// =====================================================================
// Écran de recherche : barre de saisie, recherches récentes,
// liste des résultats + repères sur la carte, fiche du lieu choisi.
// =====================================================================
const Recherche = (() => {
  // Service public des adresses (Base Adresse Nationale, via la Géoplateforme de l'IGN).
  // On n'envoie QUE le texte tapé, jamais la position. depcode=33 : Gironde uniquement.
  const URL_ADRESSES = 'https://data.geopf.fr/geocodage/search';
  const CLE_RECENTS = 'gps-bordeaux-recents';
  const NB_RECENTS = 15;
  const VITESSE_BLOCAGE_KMH = 15; // au-dessus, le clavier est bloqué (sécurité au volant)
  const TYPES_ADRESSE = { housenumber: 'Adresse', street: 'Rue', locality: 'Lieu-dit', municipality: 'Commune' };

  let carte, etat, centreParDefaut;
  let moteur = null;         // moteur de recherche des lieux (une fois le fichier chargé)
  let infoDonnees = 'Chargement des lieux…';
  let resultats = [];        // résultats affichés
  let choisi = null;         // résultat mis en avant
  let reperes = [];          // repères posés sur la carte
  let numeroRecherche = 0;   // pour ignorer les réponses arrivées trop tard
  let attenteAdresses = null;
  let requeteAdresses = null;

  const $ = (id) => document.getElementById(id);

  // -------------------------------------------------------------------
  // Chargement des données (une fois, au démarrage)
  // -------------------------------------------------------------------
  async function chargerDonnees() {
    try {
      const [categories, sigles] = await Promise.all([
        fetch('listes/categories.json').then((r) => r.json()),
        fetch('listes/sigles.json').then((r) => r.json())
      ]);
      const reponse = await fetch('donnees/lieux.json');
      if (!reponse.ok) throw new Error('fichier des lieux absent (' + reponse.status + ')');
      const donnees = await reponse.json();
      moteur = Moteur.creerMoteur(donnees, categories, sigles.sigles);
      const date = new Date(donnees.date).toLocaleDateString('fr-FR');
      infoDonnees = moteur.nombre.toLocaleString('fr-FR') + ' lieux · données OpenStreetMap du ' + date;
    } catch (e) {
      moteur = null;
      infoDonnees = 'Commerces et lieux indisponibles pour le moment : seules les adresses sont cherchées.';
      etat.erreurs.push({ heure: new Date().toISOString(), texte: 'Chargement des lieux : ' + e });
    }
    if (etat.ecran === 'recherche') afficherListe();
  }

  // -------------------------------------------------------------------
  // Petits outils d'affichage
  // -------------------------------------------------------------------
  function position() {
    return etat.position ? { lon: etat.position.longitude, lat: etat.position.latitude } : centreParDefaut;
  }

  function texteDistance(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    if (m < 10000) return (m / 1000).toFixed(1).replace('.', ',') + ' km';
    return Math.round(m / 1000) + ' km';
  }

  function avecDistance(r) {
    const p = position();
    return Object.assign({}, r, { distance: Moteur.distanceMetres(p.lon, p.lat, r.lon, r.lat) });
  }

  function ligneAdresse(r) {
    return [r.adresse, r.commune].filter(Boolean).join(', ');
  }

  function element(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  // -------------------------------------------------------------------
  // Recherches récentes (gardées sur le téléphone)
  // -------------------------------------------------------------------
  function lireRecents() {
    try { return JSON.parse(localStorage.getItem(CLE_RECENTS)) || []; } catch (e) { return []; }
  }

  function memoriserRecent(r) {
    const garde = { source: r.source, id: r.id, nom: r.nom, type: r.type, lon: r.lon, lat: r.lat,
      adresse: r.adresse, commune: r.commune, horaires: r.horaires || '' };
    const liste = lireRecents().filter((x) => !(x.nom === garde.nom && x.lon === garde.lon && x.lat === garde.lat));
    liste.unshift(garde);
    try { localStorage.setItem(CLE_RECENTS, JSON.stringify(liste.slice(0, NB_RECENTS))); } catch (e) { /* mémoire pleine */ }
  }

  function oublierRecent(r) {
    const liste = lireRecents().filter((x) => !(x.nom === r.nom && x.lon === r.lon && x.lat === r.lat));
    try { localStorage.setItem(CLE_RECENTS, JSON.stringify(liste)); } catch (e) { /* rien */ }
  }

  // -------------------------------------------------------------------
  // Recherche
  // -------------------------------------------------------------------
  function lancer() {
    const texte = $('recherche-texte').value;
    $('recherche-effacer').classList.toggle('cache', !texte);
    choisi = null;
    const numero = ++numeroRecherche;
    clearTimeout(attenteAdresses);
    if (requeteAdresses) requeteAdresses.abort();

    if (!texte.trim()) {
      resultats = [];
      afficherListe();
      return;
    }

    // 1) Lieux : sur le téléphone, tout de suite
    const lieux = moteur ? moteur.chercher(texte, position(), 50) : [];
    resultats = lieux;
    afficherListe();

    // 2) Adresses : service public, un court instant après la dernière lettre tapée
    const categorie = moteur && moteur.estCategorie(texte);
    if (texte.trim().length >= 3 && !categorie) {
      attenteAdresses = setTimeout(() => chercherAdresses(texte, numero, lieux), 300);
    }
  }

  async function chercherAdresses(texte, numero, lieux) {
    requeteAdresses = new AbortController();
    try {
      const url = URL_ADRESSES + '?index=address&autocomplete=1&limit=8&depcode=33&q=' + encodeURIComponent(texte.trim());
      const r = await fetch(url, { signal: requeteAdresses.signal });
      const json = await r.json();
      if (numero !== numeroRecherche) return; // l'utilisatrice a continué à taper
      const adresses = (json.features || [])
        .filter((f) => String(f.properties.postcode || '').startsWith('33')) // Gironde uniquement
        .map((f) => avecDistance({
          source: 'adresse',
          id: 'a' + f.properties.id,
          nom: f.properties.name,
          type: TYPES_ADRESSE[f.properties.type] || 'Adresse',
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          adresse: '',
          commune: f.properties.postcode + ' ' + f.properties.city,
          qualite: f.properties.score >= 0.7 ? 0 : 1
        }));
      // Lieux et adresses mélangés : les plus sûrs d'abord, puis du plus proche au plus loin
      resultats = lieux.concat(adresses).sort((a, b) => a.qualite - b.qualite || a.distance - b.distance);
      if (!choisi) afficherListe();
    } catch (e) {
      if (e.name !== 'AbortError' && numero === numeroRecherche && !lieux.length) {
        $('recherche-titre').textContent = "Adresses : pas de réseau pour l'instant.";
      }
    }
  }

  // -------------------------------------------------------------------
  // Affichage de la liste
  // -------------------------------------------------------------------
  function ligneResultat(r, numero, recent) {
    const li = element('li', 'resultat');
    const pastille = element('span', 'pastille' + (recent ? ' pastille-recent' : ''), recent ? '' : String(numero));
    if (recent) pastille.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    li.appendChild(pastille);

    const texte = element('div', 'resultat-texte');
    texte.appendChild(element('div', 'resultat-nom', r.nom));
    const details = [r.type, ligneAdresse(r)].filter(Boolean).join(' · ');
    texte.appendChild(element('div', 'resultat-details', details));
    const horaires = r.horaires ? Horaires.etat(r.horaires) : null;
    if (horaires) texte.appendChild(element('div', 'resultat-horaires ' + (horaires.ouvert ? 'ouvert' : 'ferme'), horaires.texte));
    li.appendChild(texte);

    li.appendChild(element('span', 'resultat-distance', texteDistance(r.distance)));
    if (recent) {
      const oublier = element('button', 'resultat-oublier', '×');
      oublier.setAttribute('aria-label', 'Retirer des recherches récentes');
      oublier.addEventListener('click', (e) => { e.stopPropagation(); oublierRecent(r); afficherListe(); });
      li.appendChild(oublier);
    }
    li.addEventListener('click', () => choisir(r));
    return li;
  }

  function afficherListe() {
    const texte = $('recherche-texte').value.trim();
    const liste = $('recherche-liste');
    liste.innerHTML = '';
    $('recherche-fiche').classList.add('cache');
    liste.classList.remove('cache');

    if (!texte) {
      // Recherches récentes, avant même de taper
      const recents = lireRecents().map(avecDistance);
      $('recherche-titre').textContent = recents.length ? 'Recherches récentes' : 'Tapez une adresse, un commerce, un type de lieu ou un sigle.';
      recents.forEach((r) => liste.appendChild(ligneResultat(r, 0, true)));
      poserReperes([]);
    } else {
      const categorie = moteur && moteur.estCategorie(texte);
      if (!resultats.length) {
        $('recherche-titre').textContent = moteur || texte.length >= 3 ? 'Aucun résultat pour l\'instant…' : 'Chargement…';
      } else {
        $('recherche-titre').textContent = categorie ? 'Les plus proches' : resultats.length + ' résultat' + (resultats.length > 1 ? 's' : '');
      }
      resultats.forEach((r, k) => liste.appendChild(ligneResultat(r, k + 1, false)));
      poserReperes(resultats);
    }
    $('recherche-info').textContent = infoDonnees + (etat.position ? '' : ' · distances depuis le centre de Bordeaux');
    etat.recherche = { texte, nombre: resultats.length, choisi: null };
  }

  // -------------------------------------------------------------------
  // Repères sur la carte (un par résultat)
  // -------------------------------------------------------------------
  function poserReperes(liste) {
    reperes.forEach((m) => m.remove());
    reperes = liste.map((r, k) => {
      const el = element('div', 'repere', String(k + 1));
      el.addEventListener('click', (e) => { e.stopPropagation(); choisir(r); });
      return new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(carte);
    });
  }

  // Ajuste la carte pour voir tous les repères, au-dessus du panneau du bas
  function cadrer(liste) {
    if (!liste.length) return;
    const marges = margesCarte();
    if (liste.length === 1) {
      carte.easeTo({ center: [liste[0].lon, liste[0].lat], zoom: Math.max(carte.getZoom(), 15), padding: marges, duration: 600 });
      return;
    }
    const zone = new maplibregl.LngLatBounds();
    liste.slice(0, 20).forEach((r) => zone.extend([r.lon, r.lat]));
    carte.fitBounds(zone, { padding: marges, maxZoom: 16, duration: 600 });
  }

  function margesCarte() {
    const haut = $('recherche-haut').getBoundingClientRect().bottom + 30;
    const bas = window.innerHeight - $('recherche-panneau').getBoundingClientRect().top + 30;
    return { top: haut, bottom: Math.max(bas, 40), left: 40, right: 40 };
  }

  // Le panneau du bas : « plein » (liste sur tout l'écran) ou « moitié » (la carte visible au-dessus)
  function modePanneau(mode) {
    const panneau = $('recherche-panneau');
    panneau.classList.toggle('plein', mode === 'plein');
    panneau.classList.toggle('moitie', mode === 'moitie');
  }

  // -------------------------------------------------------------------
  // Fiche d'un résultat
  // -------------------------------------------------------------------
  function choisir(r) {
    r = avecDistance(r);
    choisi = r;
    memoriserRecent(r);
    $('recherche-texte').blur();
    etat.recherche = { texte: $('recherche-texte').value.trim(), nombre: resultats.length, choisi: { nom: r.nom, type: r.type, lon: r.lon, lat: r.lat } };

    // Met le repère en avant (ou en pose un s'il venait des recherches récentes)
    const k = resultats.findIndex((x) => x.id === r.id && x.lon === r.lon);
    if (k < 0) poserReperes([r]);
    reperes.forEach((m, j) => m.getElement().classList.toggle('repere-choisi', j === (k < 0 ? 0 : k)));

    $('recherche-liste').classList.add('cache');
    $('fiche-nom').textContent = r.nom;
    $('fiche-type').textContent = r.type;
    $('fiche-adresse').textContent = ligneAdresse(r);
    $('fiche-distance').textContent = texteDistance(r.distance) + (etat.position ? ' de vous (à vol d\'oiseau)' : ' du centre de Bordeaux');
    const horaires = r.horaires ? Horaires.etat(r.horaires) : null;
    $('fiche-horaires').textContent = horaires ? horaires.texte : '';
    $('fiche-horaires').className = 'fiche-horaires ' + (horaires ? (horaires.ouvert ? 'ouvert' : 'ferme') : '');
    $('fiche-choix-gps').classList.add('cache');
    $('fiche-y-aller').classList.remove('cache');
    $('recherche-titre').textContent = '';
    $('recherche-fiche').classList.remove('cache');
    modePanneau('moitie');
    requestAnimationFrame(() => cadrer([r]));
  }

  // « Y aller » : l'itinéraire calculé par l'appli arrive à l'étape 3.
  // En attendant, on propose d'ouvrir la destination dans Waze ou Plans.
  function yAller() {
    if (!choisi) return;
    const { lat, lon } = choisi;
    $('fiche-waze').href = 'https://waze.com/ul?ll=' + lat + ',' + lon + '&navigate=yes';
    $('fiche-plans').href = 'https://maps.apple.com/?daddr=' + lat + ',' + lon + '&dirflg=d';
    $('fiche-y-aller').classList.add('cache');
    $('fiche-choix-gps').classList.remove('cache');
  }

  function retourListe() {
    choisi = null;
    afficherListe();
    modePanneau(resultats.length ? 'moitie' : 'plein');
    requestAnimationFrame(() => cadrer(resultats));
  }

  // -------------------------------------------------------------------
  // Ouvrir / fermer l'écran de recherche
  // -------------------------------------------------------------------
  function roule() {
    return etat.position && etat.position.vitesseKmh != null && etat.position.vitesseKmh > VITESSE_BLOCAGE_KMH;
  }

  function ouvrir() {
    etat.ecran = 'recherche';
    document.body.classList.add('en-recherche');
    $('ecran-recherche').classList.remove('cache');
    $('ouvrir-recherche').classList.add('cache');
    const champ = $('recherche-texte');
    // Sécurité : pas de clavier quand la voiture roule
    champ.readOnly = !!roule();
    $('recherche-avertissement').classList.toggle('cache', !roule());
    modePanneau('plein');
    lancer();
    if (!champ.readOnly) champ.focus();
  }

  function fermer() {
    etat.ecran = 'carte';
    etat.recherche = null;
    choisi = null;
    document.body.classList.remove('en-recherche');
    $('recherche-texte').blur();
    $('ecran-recherche').classList.add('cache');
    $('ouvrir-recherche').classList.remove('cache');
    poserReperes([]);
    // Si la carte suivait le point bleu, on y revient
    if (etat.suivi && etat.position) {
      carte.easeTo({ center: [etat.position.longitude, etat.position.latitude], padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
    } else {
      carte.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    }
  }

  function installer(laCarte, lEtat, centre) {
    carte = laCarte;
    etat = lEtat;
    centreParDefaut = centre;
    chargerDonnees();

    $('ouvrir-recherche').addEventListener('click', ouvrir);
    $('recherche-retour').addEventListener('click', () => (choisi ? retourListe() : fermer()));
    $('recherche-effacer').addEventListener('click', () => {
      $('recherche-texte').value = '';
      lancer();
      modePanneau('plein');
      if (!roule()) $('recherche-texte').focus();
    });

    const champ = $('recherche-texte');
    champ.addEventListener('input', lancer);
    champ.addEventListener('focus', () => {
      if (roule()) { champ.blur(); return; }
      if (choisi) afficherListe();
      choisi = null;
      modePanneau('plein');
    });
    // Touche « Rechercher » du clavier : on ferme le clavier et on montre la carte
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); champ.blur(); }
    });
    champ.addEventListener('blur', () => {
      if (etat.ecran !== 'recherche' || choisi) return;
      if (resultats.length) {
        modePanneau('moitie');
        requestAnimationFrame(() => cadrer(resultats));
      }
    });
    // Faire défiler la liste ferme le clavier
    $('recherche-liste').addEventListener('touchstart', () => champ.blur(), { passive: true });
    // Toucher la poignée : liste en grand ↔ carte visible
    $('recherche-poignee').addEventListener('click', () => {
      const plein = $('recherche-panneau').classList.contains('plein');
      modePanneau(plein ? 'moitie' : 'plein');
      if (plein) requestAnimationFrame(() => cadrer(choisi ? [choisi] : resultats));
    });

    $('fiche-y-aller').addEventListener('click', yAller);
    $('fiche-retour').addEventListener('click', retourListe);
  }

  return { installer };
})();
