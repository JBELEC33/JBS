// =====================================================================
// Travaux : chantiers officiels (Bordeaux Métropole) + rues bloquées signalées
// par l'utilisatrice. Affichage sur la carte et prise en compte dans l'itinéraire.
// - fichier donnees/travaux.json préparé chaque nuit par GitHub, rechargé à
//   l'ouverture de l'appli (le téléphone télécharge la liste entière : sa
//   position n'est jamais envoyée) ;
// - signalements « rue bloquée ici » gardés sur le téléphone, avec une date de fin.
// =====================================================================
const Travaux = (() => {
  const CLE_SIGNALEMENTS = 'gps-bordeaux-signalements';
  const VITESSE_MAX_SIGNALEMENT = 15; // km/h : au-dessus, on demande de s'arrêter
  const RECHARGER_APRES_MS = 3 * 3600 * 1000;

  let carte, etat;
  let officiels = null;     // contenu de travaux.json
  let dernierChargement = 0;
  let reseau = null;        // réseau des rues (pour accrocher les chantiers aux rues)
  let enCours = null;       // signalement en cours de réglage
  let popup = null;
  let quandChange = [];     // fonctions à prévenir quand la liste des travaux change

  const $ = (id) => document.getElementById(id);

  // -------------------------------------------------------------------
  // Dates
  // -------------------------------------------------------------------
  function aujourdhui() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateCourte(iso) {
    if (!iso) return '';
    const [a, m, j] = iso.slice(0, 10).split('-');
    return j + '/' + m + (a !== String(new Date().getFullYear()) ? '/' + a : '');
  }
  function finDeJournee(dansJours) {
    const d = new Date();
    d.setDate(d.getDate() + dansJours);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }

  // -------------------------------------------------------------------
  // Chargement des chantiers officiels
  // -------------------------------------------------------------------
  async function charger() {
    try {
      const r = await fetch('donnees/travaux.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('fichier des travaux absent (' + r.status + ')');
      officiels = await r.json();
      dernierChargement = Date.now();
    } catch (e) {
      etat.erreurs.push({ heure: new Date().toISOString(), texte: 'Chargement des travaux : ' + e });
    }
    appliquer();
  }

  // -------------------------------------------------------------------
  // Signalements de l'utilisatrice (gardés sur le téléphone)
  // -------------------------------------------------------------------
  function lireSignalements() {
    let liste = [];
    try { liste = JSON.parse(localStorage.getItem(CLE_SIGNALEMENTS)) || []; } catch (e) { /* rien */ }
    const maintenant = new Date().toISOString();
    return liste.filter((s) => s.fin > maintenant); // les signalements terminés disparaissent tout seuls
  }
  function ecrireSignalements(liste) {
    try { localStorage.setItem(CLE_SIGNALEMENTS, JSON.stringify(liste)); } catch (e) { /* mémoire pleine */ }
  }

  // -------------------------------------------------------------------
  // Liste des travaux actifs aujourd'hui
  // -------------------------------------------------------------------
  function actifs() {
    const jour = aujourdhui();
    const liste = [];
    for (const c of (officiels && officiels.chantiers) || []) {
      if (c.debut && c.debut > jour) continue; // pas encore commencé
      if (c.fin && c.fin < jour) continue;     // terminé
      liste.push(Object.assign({ manuel: false, texte: c.mesures.join(', ') || 'Travaux' }, c));
    }
    for (const s of lireSignalements()) {
      liste.push({ id: s.id, manuel: true, effet: 'ferme', texte: 'Rue bloquée (signalée par vous)',
        mesures: ['Rue bloquée'], lieu: s.rue || '', fin: s.fin, geo: [[[s.lon, s.lat]]] });
    }
    return liste;
  }

  // Applique les travaux au calcul d'itinéraire et à la carte, puis prévient les autres modules
  function appliquer() {
    const liste = actifs();
    if (reseau) etat.travaux = Object.assign(resume(), reseau.definirTravaux(liste));
    else etat.travaux = resume();
    dessiner(liste);
    quandChange.forEach((f) => f());
  }

  function resume() {
    const liste = actifs();
    return {
      date: officiels ? officiels.date : null,
      miseAJourSource: officiels ? officiels.miseAJourSource : null,
      chantiers: liste.filter((c) => !c.manuel).length,
      signalements: liste.filter((c) => c.manuel).length
    };
  }

  // Texte « Travaux mis à jour le … »
  function texteMiseAJour() {
    if (!officiels) return 'Travaux : données indisponibles pour le moment';
    const d = new Date(officiels.miseAJourSource || officiels.date);
    return 'Travaux (Bordeaux et Mérignac) mis à jour le ' + d.toLocaleDateString('fr-FR') + ' à ' +
      d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // -------------------------------------------------------------------
  // Carte
  // -------------------------------------------------------------------
  function donnees(liste) {
    const features = [];
    for (const c of liste) {
      const props = { id: c.id, effet: c.manuel ? 'manuel' : c.effet };
      for (const partie of c.geo) {
        features.push({ type: 'Feature', properties: props,
          geometry: partie.length === 1 ? { type: 'Point', coordinates: partie[0] } : { type: 'LineString', coordinates: partie } });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  const COULEUR = ['match', ['get', 'effet'], 'ferme', '#e5484d', 'manuel', '#b0005a', 'ralenti', '#f29d38', '#8a94a6'];

  function couches() {
    if (carte.getSource('travaux')) return true;
    try {
      carte.addSource('travaux', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    } catch (e) {
      carte.once('styledata', () => dessiner(actifs()));
      return false;
    }
    // Les travaux sont dessinés sous le trajet s'il existe
    const avant = carte.getLayer('trajet-bord') ? 'trajet-bord' : undefined;
    carte.addLayer({ id: 'travaux-lignes', type: 'line', source: 'travaux', minzoom: 12,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': COULEUR, 'line-width': 6, 'line-opacity': 0.85, 'line-dasharray': [1, 1] } }, avant);
    carte.addLayer({ id: 'travaux-points', type: 'circle', source: 'travaux', minzoom: 12,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': COULEUR, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10],
        'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } }, avant);
    return true;
  }

  function dessiner(liste) {
    if (!carte || !couches()) return;
    carte.getSource('travaux').setData(donnees(liste));
  }

  // Toucher un chantier : petite fiche
  function montrerFiche(e) {
    const f = e.features && e.features[0];
    if (!f) return;
    const c = actifs().find((x) => x.id === f.properties.id);
    if (!c) return;
    const div = document.createElement('div');
    div.className = 'fiche-travaux';
    const ajouter = (balise, texte, classe) => {
      const el = document.createElement(balise);
      el.textContent = texte;
      if (classe) el.className = classe;
      div.appendChild(el);
      return el;
    };
    if (c.manuel) {
      ajouter('strong', 'Rue bloquée (signalée par vous)');
      if (c.lieu) ajouter('div', c.lieu);
      ajouter('div', "Jusqu'au " + new Date(c.fin).toLocaleDateString('fr-FR'), 'fiche-travaux-dates');
      const bouton = ajouter('button', 'Supprimer ce signalement', 'bouton bouton-danger fiche-travaux-bouton');
      bouton.addEventListener('click', () => { supprimer(c.id); if (popup) popup.remove(); });
    } else {
      ajouter('strong', c.effet === 'ferme' ? 'Rue fermée' : c.effet === 'ralenti' ? 'Circulation perturbée' : 'Travaux');
      ajouter('div', c.mesures.join(', '));
      if (c.lieu) ajouter('div', c.lieu);
      ajouter('div', (c.debut ? 'du ' + dateCourte(c.debut) + ' ' : '') + (c.fin ? 'au ' + dateCourte(c.fin) : ''), 'fiche-travaux-dates');
      ajouter('div', c.nature, 'fiche-travaux-source');
      ajouter('div', 'Source : Bordeaux Métropole', 'fiche-travaux-source');
    }
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(div).addTo(carte);
  }

  // -------------------------------------------------------------------
  // Signalement « rue bloquée ici »
  // -------------------------------------------------------------------
  function signaler() {
    const p = etat.position;
    if (p && p.vitesseKmh != null && p.vitesseKmh > VITESSE_MAX_SIGNALEMENT && !etat.simulation) {
      afficherMessage('Pour votre sécurité, signalez une rue bloquée à l\'arrêt.');
      return;
    }
    // L'endroit : la position GPS (sinon le centre de la carte), ramenée sur la rue la plus proche
    const c = p ? { lon: p.longitude, lat: p.latitude } : { lon: carte.getCenter().lng, lat: carte.getCenter().lat };
    enCours = { id: 's' + Date.now(), cree: new Date().toISOString(), fin: finDeJournee(0) };
    placer(c.lon, c.lat);
    $('signalement-duree').querySelectorAll('button').forEach((b) => b.classList.toggle('choisi', b.dataset.jours === '0'));
    $('panneau-signalement').classList.remove('cache');
    $('signalement-maj').textContent = texteMiseAJour();
    etat.ecranAvantSignalement = etat.ecran;
    etat.ecran = 'signalement';
  }

  // Place (ou déplace) le signalement en cours sur la rue la plus proche du point donné
  function placer(lon, lat) {
    let point = { lon, lat }, rue = '';
    if (reseau) {
      const a = reseau.accrocher(lon, lat, true);
      if (a && a.ecart < 60) { point = { lon: a.lon, lat: a.lat }; rue = reseau.nomTroncon(a.troncon); }
    }
    Object.assign(enCours, point, { rue });
    $('signalement-rue').textContent = rue ? rue : 'Rue la plus proche de votre position';
    const liste = lireSignalements().filter((s) => s.id !== enCours.id);
    liste.push(enCours);
    ecrireSignalements(liste);
    appliquer();
  }

  function fermerPanneau(recalculer) {
    $('panneau-signalement').classList.add('cache');
    etat.ecran = etat.ecranAvantSignalement || 'carte';
    enCours = null;
    // Si un trajet est en cours, on recalcule pour éviter la rue bloquée
    if (recalculer && Navigation.actif()) Navigation.recalculerMaintenant();
    else if (recalculer) Itineraire.recalculerApercu();
  }

  function supprimer(id) {
    ecrireSignalements(lireSignalements().filter((s) => s.id !== id));
    appliquer();
    if (Navigation.actif()) Navigation.recalculerMaintenant();
    else Itineraire.recalculerApercu();
  }

  function afficherMessage(texte) {
    const m = $('message-travaux');
    m.textContent = texte;
    m.classList.remove('cache');
    clearTimeout(afficherMessage.minuterie);
    afficherMessage.minuterie = setTimeout(() => m.classList.add('cache'), 5000);
  }

  // -------------------------------------------------------------------
  function installer(laCarte, lEtat) {
    carte = laCarte;
    etat = lEtat;
    carte.on('style.load', () => dessiner(actifs()));
    ['travaux-points', 'travaux-lignes'].forEach((couche) => {
      carte.on('click', couche, (e) => { if (etat.ecran !== 'signalement') montrerFiche(e); });
      carte.on('mouseenter', couche, () => { carte.getCanvas().style.cursor = 'pointer'; });
      carte.on('mouseleave', couche, () => { carte.getCanvas().style.cursor = ''; });
    });
    // Pendant le réglage d'un signalement, toucher la carte déplace la rue bloquée
    carte.on('click', (e) => { if (enCours && etat.ecran === 'signalement') placer(e.lngLat.lng, e.lngLat.lat); });

    $('bouton-bloque').addEventListener('click', signaler);
    $('nav-bloque').addEventListener('click', signaler);
    $('signalement-duree').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !enCours) return;
      enCours.fin = finDeJournee(parseInt(b.dataset.jours, 10));
      $('signalement-duree').querySelectorAll('button').forEach((x) => x.classList.toggle('choisi', x === b));
      const liste = lireSignalements().filter((s) => s.id !== enCours.id);
      liste.push(enCours);
      ecrireSignalements(liste);
    });
    $('signalement-ok').addEventListener('click', () => fermerPanneau(true));
    $('signalement-supprimer').addEventListener('click', () => {
      if (enCours) {
        ecrireSignalements(lireSignalements().filter((s) => s.id !== enCours.id));
        appliquer();
      }
      fermerPanneau(true);
    });

    charger();
    // L'appli reste souvent ouverte en arrière-plan : on recharge les travaux en revenant dessus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - dernierChargement > RECHARGER_APRES_MS) charger();
    });
  }

  // Le réseau des rues vient d'être chargé : on y accroche les travaux
  function surReseau(leReseau) {
    reseau = leReseau;
    appliquer();
  }

  return {
    installer, surReseau, texteMiseAJour,
    surChangement: (f) => quandChange.push(f)
  };
})();
