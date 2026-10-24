// =====================================================================
// Itinéraire : chargement du fichier des rues, calcul, affichage du trajet
// sur la carte, aperçu avant le départ et mode simulation.
// Le guidage détaillé (« dans 200 m, tournez à droite ») arrive à l'étape 4.
// =====================================================================
const Itineraire = (() => {
  let carte, etat, centreParDefaut, positionSimulee;
  let reseau = null;            // réseau des rues, une fois chargé
  let chargement = null;        // promesse du chargement en cours
  let trajet = null;            // trajet affiché
  let destination = null;
  let reperes = [];             // repères posés sur la carte (destination, bornes, zones piétonnes)
  let simulation = null;        // simulation en cours

  const $ = (id) => document.getElementById(id);
  const VITESSES_SIMULATION = [1, 2, 4, 8];

  // -------------------------------------------------------------------
  // Chargement du fichier des rues (une fois, en arrière-plan)
  // -------------------------------------------------------------------
  function charger() {
    if (!chargement) {
      chargement = fetch('donnees/rues.bin')
        .then((r) => {
          if (!r.ok) throw new Error('fichier des rues absent (' + r.status + ')');
          return r.arrayBuffer();
        })
        .then((tampon) => {
          const debut = Date.now();
          reseau = MoteurItineraire.creerReseau(tampon);
          etat.reseau = { date: reseau.date, preparationMs: Date.now() - debut, taille: tampon.byteLength };
          return reseau;
        })
        .catch((e) => {
          chargement = null; // on réessaiera au prochain « Y aller »
          etat.erreurs.push({ heure: new Date().toISOString(), texte: 'Chargement des rues : ' + e });
          throw e;
        });
    }
    return chargement;
  }

  // -------------------------------------------------------------------
  // Petits outils
  // -------------------------------------------------------------------
  function texteDuree(secondes) {
    const min = Math.max(1, Math.round(secondes / 60));
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  }

  function texteDistance(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
  }

  function heureArrivee(secondes) {
    const d = new Date(Date.now() + secondes * 1000);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function element(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function liensSecours(lieu) {
    $('trajet-waze').href = 'https://waze.com/ul?ll=' + lieu.lat + ',' + lieu.lon + '&navigate=yes';
    $('trajet-plans').href = 'https://maps.apple.com/?daddr=' + lieu.lat + ',' + lieu.lon + '&dirflg=d';
  }

  // -------------------------------------------------------------------
  // Dessin du trajet sur la carte
  // -------------------------------------------------------------------
  function donneesCarte() {
    const features = (trajet ? trajet.morceaux : []).map((m) => ({
      type: 'Feature',
      properties: { genre: m.pieton || m.accesLimite ? 'pieton' : 'normal' },
      geometry: { type: 'LineString', coordinates: m.coords }
    }));
    return { type: 'FeatureCollection', features };
  }

  // Ajoute (ou remet, après un changement de fond de carte) les couches du trajet.
  // Si le fond de carte n'est pas encore prêt, on réessaie dès qu'il l'est.
  function couches() {
    if (carte.getSource('trajet')) return;
    try {
      carte.addSource('trajet', { type: 'geojson', data: donneesCarte() });
    } catch (e) {
      carte.once('styledata', dessiner);
      return;
    }
    carte.addLayer({ id: 'trajet-bord', type: 'line', source: 'trajet',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0b2a66', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 14] } });
    carte.addLayer({ id: 'trajet-ligne', type: 'line', source: 'trajet', filter: ['==', ['get', 'genre'], 'normal'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2f8cff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 9] } });
    carte.addLayer({ id: 'trajet-pieton', type: 'line', source: 'trajet', filter: ['==', ['get', 'genre'], 'pieton'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#f29d38', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 9], 'line-dasharray': [1.2, 0.8] } });
  }

  function dessiner() {
    couches();
    const source = carte.getSource('trajet');
    if (source) source.setData(donneesCarte());
    reperes.forEach((m) => m.remove());
    reperes = [];
    if (!trajet) return;
    // Destination
    const fin = element('div', 'repere repere-destination', '');
    reperes.push(new maplibregl.Marker({ element: fin }).setLngLat([destination.lon, destination.lat]).addTo(carte));
    // Bornes franchies avec le badge
    trajet.bornes.forEach((b) => {
      reperes.push(new maplibregl.Marker({ element: element('div', 'etiquette-carte', 'borne : badge') }).setLngLat(b).addTo(carte));
    });
    // Début de chaque passage en zone piétonne ou à accès réservé
    trajet.morceaux.forEach((m, k) => {
      const precedent = trajet.morceaux[k - 1];
      const special = m.pieton || m.accesLimite;
      if (special && !(precedent && (precedent.pieton || precedent.accesLimite))) {
        const texte = m.pieton ? 'zone piétonne : rouler au pas' : 'accès réservé : badge';
        reperes.push(new maplibregl.Marker({ element: element('div', 'etiquette-carte', texte) }).setLngLat(m.coords[0]).addTo(carte));
      }
    });
  }

  function cadrer() {
    if (!trajet) return;
    const zone = new maplibregl.LngLatBounds();
    trajet.morceaux.forEach((m) => m.coords.forEach((c) => zone.extend(c)));
    const panneau = $('panneau-trajet');
    const bas = (panneau.classList.contains('cache') ? 100 : panneau.getBoundingClientRect().height) + 30;
    // On arrête le mouvement en cours (fermeture de la recherche) pour que le cadrage parte d'une carte immobile
    carte.stop();
    carte.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    carte.fitBounds(zone, { padding: { top: 90, bottom: bas, left: 40, right: 40 }, maxZoom: 17, duration: 700 });
  }

  // -------------------------------------------------------------------
  // Aperçu avant le départ
  // -------------------------------------------------------------------
  async function apercu(lieu) {
    destination = lieu;
    trajet = null;
    etat.ecran = 'apercu';
    document.body.classList.add('en-trajet');
    $('panneau-trajet').classList.remove('cache');
    $('trajet-destination').textContent = lieu.nom;
    $('trajet-resume').textContent = 'Calcul de l\'itinéraire…';
    $('trajet-details').textContent = '';
    $('trajet-alertes').innerHTML = '';
    $('trajet-boutons').classList.add('cache');
    liensSecours(lieu);
    dessiner();

    let depart, departInconnu = false;
    if (etat.position) depart = { lon: etat.position.longitude, lat: etat.position.latitude };
    else { depart = centreParDefaut; departInconnu = true; }

    try {
      await charger();
    } catch (e) {
      $('trajet-resume').textContent = 'Le fichier des rues n\'a pas pu être chargé (réseau ?).';
      $('trajet-details').textContent = 'Vous pouvez ouvrir la destination dans Waze ou Plans.';
      return;
    }
    if (destination !== lieu) return; // une autre destination a été choisie entre-temps

    const resultat = reseau.calculer(depart, { lon: lieu.lon, lat: lieu.lat });
    if (resultat.erreur) {
      etat.trajet = { destination: lieu.nom, erreur: resultat.erreur };
      $('trajet-resume').textContent = resultat.message;
      $('trajet-details').textContent = 'Vous pouvez ouvrir la destination dans Waze ou Plans.';
      return;
    }
    trajet = resultat;
    etat.trajet = {
      destination: { nom: lieu.nom, lon: lieu.lon, lat: lieu.lat },
      depart,
      mode: 'aperçu',
      dureeS: Math.round(trajet.duree),
      distanceM: Math.round(trajet.distance),
      calculMs: trajet.ms,
      explores: trajet.explores
    };

    $('trajet-resume').textContent = texteDuree(trajet.duree) + ' · ' + texteDistance(trajet.distance);
    $('trajet-details').textContent = 'Arrivée vers ' + heureArrivee(trajet.duree) +
      (departInconnu ? ' · départ : centre de Bordeaux (position GPS inconnue)' : '');
    const alertes = $('trajet-alertes');
    if (trajet.morceaux.some((m) => m.pieton)) alertes.appendChild(element('li', 'alerte', 'Passe par une zone piétonne : rouler au pas'));
    if (trajet.morceaux.some((m) => m.accesLimite)) alertes.appendChild(element('li', 'alerte', 'Passe par une rue à accès réservé (badge)'));
    if (trajet.bornes.length) alertes.appendChild(element('li', 'alerte', 'Borne' + (trajet.bornes.length > 1 ? 's' : '') + ' à passer avec le badge : ' + trajet.bornes.length));
    $('trajet-info').textContent = 'Calculé sur le téléphone en ' + trajet.ms + ' ms · rues OpenStreetMap du ' + new Date(reseau.date).toLocaleDateString('fr-FR');
    $('trajet-boutons').classList.remove('cache');
    dessiner();
    cadrer();
  }

  // -------------------------------------------------------------------
  // Départ (réel ou simulé)
  // -------------------------------------------------------------------
  function demarrer(simuler) {
    if (!trajet) return;
    $('panneau-trajet').classList.add('cache');
    $('barre-trajet').classList.remove('cache');
    $('barre-destination').textContent = destination.nom;
    $('barre-resume').textContent = 'Arrivée vers ' + heureArrivee(trajet.duree) + ' · ' + texteDuree(trajet.duree) + ' · ' + texteDistance(trajet.distance);
    $('barre-simulation').classList.toggle('cache', !simuler);
    etat.ecran = 'trajet';
    etat.suivi = true;
    $('bouton-recentrer').classList.add('cache');
    etat.trajet.mode = simuler ? 'simulation' : 'en route';
    if (simuler) demarrerSimulation();
    else if (etat.position) carte.easeTo({ center: [etat.position.longitude, etat.position.latitude], zoom: 16, duration: 800 });
  }

  function arreter() {
    arreterSimulation();
    trajet = null;
    destination = null;
    etat.trajet = null;
    etat.ecran = 'carte';
    document.body.classList.remove('en-trajet');
    $('panneau-trajet').classList.add('cache');
    $('barre-trajet').classList.add('cache');
    $('confirmation-arret').classList.add('cache');
    dessiner();
    if (etat.position) carte.easeTo({ center: [etat.position.longitude, etat.position.latitude], zoom: 16, duration: 600 });
  }

  // -------------------------------------------------------------------
  // Mode simulation : le point bleu « roule » sur le trajet
  // -------------------------------------------------------------------
  function demarrerSimulation() {
    // Liste des points du trajet, avec la vitesse de chaque morceau
    const points = [];
    trajet.morceaux.forEach((m) => m.coords.forEach((c) => {
      const dernier = points[points.length - 1];
      if (!dernier || dernier.lon !== c[0] || dernier.lat !== c[1]) points.push({ lon: c[0], lat: c[1], vitesse: m.vitesse });
    }));
    simulation = { points, index: 0, avance: 0, multiplicateur: simulation ? simulation.multiplicateur : 2, minuterie: null };
    etat.simulation = true;
    afficherVitesseSimulation();
    simulation.minuterie = setInterval(pasSimulation, 1000);
    pasSimulation();
  }

  function pasSimulation() {
    const s = simulation;
    if (!s) return;
    let reste = (s.points[Math.min(s.index + 1, s.points.length - 1)].vitesse / 3.6) * s.multiplicateur; // mètres à parcourir en 1 s
    while (reste > 0 && s.index < s.points.length - 1) {
      const a = s.points[s.index], b = s.points[s.index + 1];
      const longueur = MoteurDistances.metres(a, b);
      if (s.avance + reste < longueur) { s.avance += reste; reste = 0; break; }
      reste -= longueur - s.avance;
      s.avance = 0;
      s.index++;
    }
    const a = s.points[s.index], b = s.points[Math.min(s.index + 1, s.points.length - 1)];
    const longueur = MoteurDistances.metres(a, b) || 1;
    const f = Math.min(1, s.avance / longueur);
    const lon = a.lon + (b.lon - a.lon) * f, lat = a.lat + (b.lat - a.lat) * f;
    const cap = MoteurDistances.cap(a, b);
    const arrive = s.index >= s.points.length - 1;
    positionSimulee({
      coords: { longitude: lon, latitude: lat, accuracy: 5, speed: arrive ? 0 : (b.vitesse / 3.6) * s.multiplicateur, heading: cap },
      timestamp: Date.now()
    });
    if (arrive) {
      arreterSimulation();
      $('barre-resume').textContent = 'Vous êtes arrivée.';
    }
  }

  function arreterSimulation() {
    if (simulation && simulation.minuterie) clearInterval(simulation.minuterie);
    if (simulation) simulation.minuterie = null;
    etat.simulation = false;
  }

  function afficherVitesseSimulation() {
    $('simulation-vitesse').textContent = '×' + simulation.multiplicateur;
  }

  function changerVitesse(sens) {
    if (!simulation) return;
    const i = VITESSES_SIMULATION.indexOf(simulation.multiplicateur);
    simulation.multiplicateur = VITESSES_SIMULATION[Math.max(0, Math.min(VITESSES_SIMULATION.length - 1, i + sens))];
    afficherVitesseSimulation();
  }

  // Petits calculs de distance et de direction entre deux points { lon, lat }
  const MoteurDistances = {
    metres: (a, b) => Moteur.distanceMetres(a.lon, a.lat, b.lon, b.lat),
    cap: (a, b) => {
      const x = (b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), y = b.lat - a.lat;
      return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    }
  };

  // -------------------------------------------------------------------
  function installer(laCarte, lEtat, centre, fonctionPositionSimulee) {
    carte = laCarte;
    etat = lEtat;
    centreParDefaut = centre;
    positionSimulee = fonctionPositionSimulee;
    // Le fichier des rues est préparé en arrière-plan quelques secondes après l'ouverture
    setTimeout(() => charger().catch(() => {}), 4000);
    // Après un changement de fond de carte (jour/nuit), on redessine le trajet
    carte.on('style.load', dessiner);

    $('trajet-demarrer').addEventListener('click', () => demarrer(false));
    $('trajet-simuler').addEventListener('click', () => demarrer(true));
    $('trajet-fermer').addEventListener('click', arreter);
    $('barre-arreter').addEventListener('click', () => $('confirmation-arret').classList.remove('cache'));
    $('arret-non').addEventListener('click', () => $('confirmation-arret').classList.add('cache'));
    $('arret-oui').addEventListener('click', arreter);
    $('simulation-moins').addEventListener('click', () => changerVitesse(-1));
    $('simulation-plus').addEventListener('click', () => changerVitesse(1));
  }

  return { installer, apercu, charger };
})();
