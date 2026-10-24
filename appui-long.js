// =====================================================================
// Appui long sur la carte : « Aller ici ? »
// Garder le doigt appuyé ~0,6 s sur un endroit pose un repère, affiche la rue
// la plus proche (trouvée sur le téléphone, dans le fichier des rues : rien
// n'est envoyé sur internet) et propose « Y aller ».
// Désactivé pendant la navigation (sécurité au volant).
// =====================================================================
const AppuiLong = (() => {
  const DUREE_MS = 600;       // temps d'appui pour déclencher
  const TOLERANCE_PX = 10;    // si le doigt bouge plus, c'est un déplacement de carte

  let carte, etat;
  let minuterie = null, depart = null;
  let repere = null, point = null;

  const $ = (id) => document.getElementById(id);

  // L'appui long n'est possible que sur la carte ou pendant l'aperçu d'un trajet
  function permis() {
    return etat.ecran === 'carte' || etat.ecran === 'apercu';
  }

  function annulerAttente() {
    clearTimeout(minuterie);
    minuterie = null;
    depart = null;
  }

  function debut(x, y) {
    annulerAttente();
    if (!permis()) return;
    depart = { x, y };
    minuterie = setTimeout(() => {
      minuterie = null;
      const rect = carte.getCanvasContainer().getBoundingClientRect();
      const lngLat = carte.unproject([depart.x - rect.left, depart.y - rect.top]);
      if (navigator.vibrate) navigator.vibrate(30);
      choisir(lngLat.lng, lngLat.lat);
    }, DUREE_MS);
  }

  function deplacement(x, y) {
    if (depart && Math.hypot(x - depart.x, y - depart.y) > TOLERANCE_PX) annulerAttente();
  }

  // -------------------------------------------------------------------
  // Point choisi : repère + petit panneau
  // -------------------------------------------------------------------
  function choisir(lon, lat) {
    point = { lon, lat, nom: 'Point sur la carte', rue: '' };
    const reseau = Itineraire.reseau();
    if (reseau) {
      const a = reseau.accrocher(lon, lat, true);
      if (a && a.ecart < 150) point.rue = reseau.nomTroncon(a.troncon);
    }
    if (point.rue) point.nom = point.rue;

    if (!repere) {
      const el = document.createElement('div');
      el.className = 'repere repere-destination';
      repere = new maplibregl.Marker({ element: el });
    }
    repere.setLngLat([lon, lat]).addTo(carte);

    $('point-rue').textContent = point.rue || 'Point sur la carte';
    let distance = '';
    if (etat.position) {
      const m = Moteur.distanceMetres(etat.position.longitude, etat.position.latitude, lon, lat);
      distance = 'à ' + (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km') + ' de vous (à vol d\'oiseau)';
    }
    $('point-distance').textContent = distance;
    $('panneau-point').classList.remove('cache');
    etat.pointChoisi = { lon: +lon.toFixed(6), lat: +lat.toFixed(6), rue: point.rue };
  }

  function fermer() {
    $('panneau-point').classList.add('cache');
    if (repere) repere.remove();
    point = null;
    etat.pointChoisi = null;
  }

  function yAller() {
    if (!point) return;
    const destination = { nom: point.nom, lon: point.lon, lat: point.lat, type: 'Point sur la carte', adresse: '', commune: '' };
    fermer();
    Itineraire.apercu(destination);
  }

  // -------------------------------------------------------------------
  function installer(laCarte, lEtat) {
    carte = laCarte;
    etat = lEtat;
    const zone = carte.getCanvasContainer();
    // Doigt (iPhone)
    zone.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { annulerAttente(); return; } // deux doigts = zoom
      debut(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    zone.addEventListener('touchmove', (e) => deplacement(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    zone.addEventListener('touchend', annulerAttente, { passive: true });
    zone.addEventListener('touchcancel', annulerAttente, { passive: true });
    // Souris (ordinateur)
    zone.addEventListener('mousedown', (e) => { if (e.button === 0) debut(e.clientX, e.clientY); });
    zone.addEventListener('mousemove', (e) => deplacement(e.clientX, e.clientY));
    window.addEventListener('mouseup', annulerAttente);
    // La carte bouge (zoom, rotation…) : ce n'est pas un appui long
    carte.on('zoomstart', annulerAttente);
    carte.on('rotatestart', annulerAttente);

    $('point-y-aller').addEventListener('click', yAller);
    $('point-annuler').addEventListener('click', fermer);
  }

  return { installer, fermer };
})();
