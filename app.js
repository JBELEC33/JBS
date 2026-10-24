// =====================================================================
// GPS Bordeaux — étape 1 : carte de Bordeaux + ma position en temps réel
// =====================================================================

// Numéro de version, affiché dans la fenêtre « Ça ne va pas ».
// À changer à chaque mise en ligne pour vérifier que l'iPhone a bien la dernière version.
const VERSION = '5.2 (appui long pour y aller)';

// Centre de Bordeaux (place de la Comédie), au format [longitude, latitude]
const BORDEAUX = [-0.5747, 44.8425];

// Fonds de carte OpenFreeMap : gratuits, sans clé, données OpenStreetMap.
// Sombre la nuit (ou si l'iPhone est en mode sombre), clair sinon.
const STYLE_SOMBRE = 'https://tiles.openfreemap.org/styles/dark';
const STYLE_CLAIR = 'https://tiles.openfreemap.org/styles/liberty';
const modeSombre = window.matchMedia('(prefers-color-scheme: dark)');

// Au-delà de ce délai sans nouvelle position, le point devient gris.
const DELAI_POSITION_ANCIENNE_MS = 15000;

// ---------------------------------------------------------------------
// État de l'appli (aussi recopié dans les rapports « Ça ne va pas »)
// ---------------------------------------------------------------------
const etat = {
  ecran: 'carte',         // écran affiché : carte, recherche, apercu (du trajet), trajet ou rapport
  suivi: true,            // la carte suit-elle le point bleu ?
  position: null,         // dernière position reçue du GPS
  gps: 'en attente',      // en attente / actif / refusé / indisponible
  recherche: null,        // recherche en cours (texte, nombre de résultats, lieu choisi)
  trajet: null,           // itinéraire en cours (destination, durée, distance, mode)
  simulation: false,      // vrai quand le mode simulation fait « rouler » le point bleu
  reseau: null,           // fichier des rues chargé (date, taille, temps de préparation)
  erreurs: []             // dernières erreurs JavaScript (pour le débogage)
};

// Note les erreurs inattendues pour qu'elles apparaissent dans les rapports
window.addEventListener('error', (e) => noterErreur(e.message + ' (' + e.filename + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', (e) => noterErreur(String(e.reason)));
function noterErreur(texte) {
  etat.erreurs.push({ heure: new Date().toISOString(), texte });
  if (etat.erreurs.length > 20) etat.erreurs.shift();
}

// ---------------------------------------------------------------------
// La carte
// ---------------------------------------------------------------------
const carte = new maplibregl.Map({
  container: 'carte',
  style: modeSombre.matches ? STYLE_SOMBRE : STYLE_CLAIR,
  center: BORDEAUX,
  zoom: 13,
  attributionControl: false
});
// Crédits obligatoires (OpenStreetMap…), repliés dans un petit « i »
carte.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

// Si l'iPhone passe du mode clair au mode sombre, la carte suit
modeSombre.addEventListener('change', () => {
  carte.setStyle(modeSombre.matches ? STYLE_SOMBRE : STYLE_CLAIR);
});

// Le point bleu : un simple rond dessiné en HTML, posé sur la carte
const elementPoint = document.createElement('div');
elementPoint.className = 'point-position';
const pointBleu = new maplibregl.Marker({ element: elementPoint });

// ---------------------------------------------------------------------
// Suivi de la position
// ---------------------------------------------------------------------
const boutonRecentrer = document.getElementById('bouton-recentrer');
const zoneEtat = document.getElementById('etat-gps');

function afficherEtat(texte, erreur) {
  if (!texte) { zoneEtat.classList.add('cache'); return; }
  zoneEtat.textContent = texte;
  zoneEtat.classList.toggle('erreur', !!erreur);
  zoneEtat.classList.remove('cache');
}

let carteCentree = false; // la carte s'est-elle déjà placée sur la position ?
let dernierePositionReelle = null; // dernière position du vrai GPS (pour revenir après une simulation)

function revenirPositionReelle() {
  if (dernierePositionReelle) nouvellePosition(dernierePositionReelle);
}

// Appelé à chaque nouvelle position donnée par le GPS de l'iPhone
function nouvellePosition(pos) {
  const premiere = !etat.position;
  etat.gps = 'actif';
  etat.position = {
    longitude: pos.coords.longitude,
    latitude: pos.coords.latitude,
    precisionMetres: Math.round(pos.coords.accuracy),
    vitesseKmh: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null,
    cap: pos.coords.heading,
    heure: new Date(pos.timestamp).toISOString()
  };
  afficherEtat(null);

  const lngLat = [pos.coords.longitude, pos.coords.latitude];
  if (premiere) pointBleu.setLngLat(lngLat).addTo(carte);
  elementPoint.classList.remove('ancien');

  // Pendant la navigation, c'est navigation.js qui déplace le point et la caméra (en douceur)
  if (Navigation.actif()) {
    Navigation.position(pos);
    return;
  }
  pointBleu.setLngLat(lngLat);

  // Pendant une recherche ou l'aperçu du trajet, la carte montre autre chose : on ne la bouge pas
  if (etat.ecran !== 'carte' && etat.ecran !== 'trajet') return;
  if (!carteCentree) {
    // Premier signal : on se place sur la position, zoomé à l'échelle de la rue
    carteCentree = true;
    carte.jumpTo({ center: lngLat, zoom: 16 });
  } else if (etat.suivi) {
    // Ensuite, la carte glisse en douceur pour garder le point au centre
    carte.easeTo({ center: lngLat, duration: 900, easing: (t) => t });
  }
}

function erreurPosition(err) {
  if (err.code === err.PERMISSION_DENIED) {
    etat.gps = 'refusé';
    afficherEtat("L'appli n'a pas accès à votre position. Sur l'iPhone : Réglages › Confidentialité et sécurité › " +
      "Service de localisation : activé, puis « Sites web Safari » : « Lorsque l'app est active ». " +
      "Ensuite fermez et rouvrez l'appli.", true);
  } else {
    // Signal faible ou momentanément perdu : le GPS continue de chercher tout seul
    etat.gps = 'indisponible';
    afficherEtat('Recherche du signal GPS…');
  }
}

if ('geolocation' in navigator) {
  afficherEtat('Recherche de votre position…');
  // Pendant une simulation, les positions viennent du simulateur : on ignore le vrai GPS
  navigator.geolocation.watchPosition((pos) => {
    dernierePositionReelle = pos;
    if (!etat.simulation) nouvellePosition(pos);
  }, erreurPosition, {
    enableHighAccuracy: true, // utilise la puce GPS (plus précis)
    maximumAge: 0,            // jamais de position en cache
    timeout: 20000
  });
} else {
  etat.gps = 'indisponible';
  afficherEtat("Ce navigateur ne donne pas accès à la position.", true);
}

// Toutes les 5 secondes : si la position n'a pas bougé depuis longtemps, le point devient gris
setInterval(() => {
  if (!etat.position) return;
  const age = Date.now() - new Date(etat.position.heure).getTime();
  elementPoint.classList.toggle('ancien', age > DELAI_POSITION_ANCIENNE_MS);
}, 5000);

// ---------------------------------------------------------------------
// Suivre ou ne plus suivre le point
// ---------------------------------------------------------------------
// Dès que l'utilisatrice déplace la carte avec le doigt, on arrête de suivre
// et on montre le bouton « Recentrer ».
carte.on('dragstart', (e) => {
  if (!e.originalEvent) return; // mouvement fait par l'appli elle-même : on ignore
  etat.suivi = false;
  boutonRecentrer.classList.remove('cache');
});

boutonRecentrer.addEventListener('click', () => {
  if (Navigation.actif()) { Navigation.recentrer(); return; }
  etat.suivi = true;
  boutonRecentrer.classList.add('cache');
  if (etat.position) {
    carte.flyTo({
      center: [etat.position.longitude, etat.position.latitude],
      zoom: Math.max(carte.getZoom(), 16),
      bearing: 0,
      pitch: 0
    });
  }
});

// ---------------------------------------------------------------------
// Ce que l'appli recopie dans un rapport « Ça ne va pas »
// ---------------------------------------------------------------------
function etatPourRapport() {
  const centre = carte.getCenter();
  return {
    version: VERSION,
    ecran: etat.ecran,
    gps: etat.gps,
    position: etat.position,
    suiviDuPoint: etat.suivi,
    recherche: etat.recherche,
    trajet: etat.trajet,
    simulation: etat.simulation,
    reseau: etat.reseau,
    travaux: etat.travaux,
    vueCarte: {
      centre: [Number(centre.lng.toFixed(6)), Number(centre.lat.toFixed(6))],
      zoom: Number(carte.getZoom().toFixed(2)),
      rotation: Math.round(carte.getBearing()),
      inclinaison: Math.round(carte.getPitch()),
      style: modeSombre.matches ? 'sombre' : 'clair'
    },
    appliInstallee: window.navigator.standalone === true,
    ecranTaille: window.innerWidth + '×' + window.innerHeight,
    appareil: navigator.userAgent,
    enLigne: navigator.onLine,
    erreurs: etat.erreurs.slice()
  };
}

document.getElementById('version').textContent = VERSION;
Rapports.installer(carte, etat, etatPourRapport);
Recherche.installer(carte, etat, { lon: BORDEAUX[0], lat: BORDEAUX[1] });
Travaux.installer(carte, etat);
AppuiLong.installer(carte, etat);
Itineraire.installer(carte, etat, { lon: BORDEAUX[0], lat: BORDEAUX[1] });
Navigation.installer({ carte, etat, pointBleu, elementPoint, positionSimulee: nouvellePosition, revenirPositionReelle });

// ---------------------------------------------------------------------
// Fonctionnement en appli installée : enregistre le « service worker »,
// qui garde une copie de l'appli sur le téléphone.
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => noterErreur('Service worker : ' + e));
}
