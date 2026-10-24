// =====================================================================
// Navigation pendant le trajet (comme les GPS grand public) :
// - caméra inclinée en 3D qui suit la voiture et tourne dans le sens de la marche ;
// - bandeau en haut : prochaine manœuvre (grosse flèche, distance), puis la suivante ;
// - barre en bas : heure d'arrivée, temps et distance restants ;
// - vitesse actuelle et limitation de la rue ;
// - recalcul automatique si l'on sort du trajet ;
// - écran gardé allumé ; mode simulation.
// =====================================================================
const Navigation = (() => {
  let carte, etat, pointBleu, elementPoint, positionSimulee, revenirPositionReelle;
  let nav = null;          // navigation en cours
  let simulation = null;   // simulation en cours
  let boucle = null;       // animation de la caméra
  const VITESSES_SIMULATION = [1, 2, 4, 8];
  const RETOUR_AUTO_MS = 8000;   // retour automatique à la vue de navigation après ce délai sans toucher
  const INCLINAISON = 55;        // vue en perspective (degrés)

  const $ = (id) => document.getElementById(id);

  // -------------------------------------------------------------------
  // Textes et icônes
  // -------------------------------------------------------------------
  function texteDistance(m) {
    if (m < 1000) return (m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50) + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
  }
  function texteDuree(s) {
    const min = Math.max(1, Math.round(s / 60));
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  }
  function heure(dans) {
    const d = new Date(Date.now() + dans * 1000);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Grosse flèche dessinée selon la manœuvre
  function icone(c) {
    const trait = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
    let dessin;
    if (c.type === 'virage') {
      if (c.force === 'legerement') dessin = `<path d="M18 44 V28 L34 12" ${trait}/><path d="M23 11 H35 V23" ${trait}/>`;
      else if (c.force === 'serre') dessin = `<path d="M16 44 V16 Q16 8 24 8 Q32 8 32 16 V34" ${trait}/><path d="M24 27 L32 35 L40 27" ${trait}/>`;
      else dessin = `<path d="M16 44 V26 Q16 18 24 18 H38" ${trait}/><path d="M31 11 L38 18 L31 25" ${trait}/>`;
      if (c.cote === 'gauche') dessin = `<g transform="translate(48,0) scale(-1,1)">${dessin}</g>`;
    } else if (c.type === 'rond-point') {
      dessin = `<circle cx="24" cy="22" r="9" ${trait}/><path d="M24 46 V31" ${trait}/>` +
        `<text x="24" y="27" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${c.sortie}</text>`;
    } else if (c.type === 'arrivee') {
      dessin = `<path d="M14 44 V6" ${trait}/><path d="M14 8 H36 L30 15 L36 22 H14 Z" fill="currentColor"/>`;
    } else if (c.type === 'pieton' || c.type === 'borne') {
      dessin = `<path d="M24 6 L44 42 H4 Z" ${trait}/><path d="M24 18 V29" ${trait}/><circle cx="24" cy="36" r="2.5" fill="currentColor"/>`;
    } else {
      dessin = `<path d="M24 44 V8" ${trait}/><path d="M14 18 L24 8 L34 18" ${trait}/>`;
    }
    return `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">${dessin}</svg>`;
  }

  // -------------------------------------------------------------------
  // Démarrer / arrêter
  // -------------------------------------------------------------------
  function demarrer(trajet, destination, simuler) {
    nav = {
      trajet, destination,
      prep: Consignes.preparer(trajet, destination.nom),
      indice: 0, horsTrajet: 0, dernierRecalcul: 0, recalculs: 0,
      suivi: true, dernierToucher: 0, toucheEnCours: false,
      arrivee: false, dernierFix: 0, zoom: carte.getZoom(), zoomCible: 17,
      affiche: null, capAffiche: carte.getBearing(),
      anim: null, verrou: null
    };
    etat.ecran = 'trajet';
    etat.suivi = true;
    etat.trajet.mode = simuler ? 'simulation' : 'en route';
    etat.trajet.recalculs = 0;
    document.body.classList.add('en-navigation');
    $('nav-haut').classList.remove('cache');
    $('barre-trajet').classList.remove('cache');
    $('nav-vitesse').classList.remove('cache');
    $('barre-simulation').classList.toggle('cache', !simuler);
    document.body.classList.toggle('avec-simulation', !!simuler);
    $('barre-arreter').textContent = 'Arrêter';
    $('bouton-recentrer').classList.add('cache');
    // Le point bleu devient une flèche couchée sur la carte, tournée dans le sens de la marche
    elementPoint.classList.add('fleche-navigation');
    pointBleu.setRotationAlignment('map').setPitchAlignment('map');
    garderEcranAllume();
    afficher(null);
    boucle = requestAnimationFrame(image);
    if (simuler) demarrerSimulation();
    else if (etat.position) position({ coords: {
      longitude: etat.position.longitude, latitude: etat.position.latitude, accuracy: etat.position.precisionMetres,
      speed: etat.position.vitesseKmh != null ? etat.position.vitesseKmh / 3.6 : null, heading: etat.position.cap } });
  }

  function arreter() {
    if (!nav) return;
    const etaitSimule = !!simulation;
    arreterSimulation();
    simulation = null;
    cancelAnimationFrame(boucle);
    if (nav.verrou) nav.verrou.release().catch(() => {});
    nav = null;
    document.body.classList.remove('en-navigation', 'avec-simulation');
    ['nav-haut', 'barre-trajet', 'nav-vitesse', 'confirmation-arret', 'panneau-secours'].forEach((id) => $(id).classList.add('cache'));
    elementPoint.classList.remove('fleche-navigation');
    pointBleu.setRotation(0).setRotationAlignment('auto').setPitchAlignment('auto');
    if (etat.position) pointBleu.setLngLat([etat.position.longitude, etat.position.latitude]);
    carte.easeTo({ pitch: 0, bearing: 0, zoom: 16, padding: { top: 0, bottom: 0, left: 0, right: 0 },
      center: etat.position ? [etat.position.longitude, etat.position.latitude] : carte.getCenter(), duration: 800 });
    Itineraire.terminer();
    // Après une simulation, le point bleu revient à la vraie position
    if (etaitSimule) revenirPositionReelle();
  }

  // -------------------------------------------------------------------
  // À chaque nouvelle position (vraie ou simulée)
  // -------------------------------------------------------------------
  function position(pos) {
    if (!nav) return;
    const c = pos.coords;
    const lon = c.longitude, lat = c.latitude;
    const vitesse = c.speed != null && c.speed >= 0 ? c.speed : null; // m/s
    const precision = c.accuracy || 0;
    const maintenant = performance.now();

    const s = Consignes.situer(nav.prep, lon, lat, nav.indice);
    const surRoute = s && s.ecart < 30;
    let affiche, capAffiche;
    if (surRoute) {
      // Sur le trajet : on « colle » le point à la route, et la carte suit la direction de la route
      nav.indice = s.indice;
      nav.horsTrajet = 0;
      affiche = s.point;
      capAffiche = s.cap;
    } else {
      affiche = [lon, lat];
      capAffiche = c.heading != null && !isNaN(c.heading) && (vitesse || 0) > 1.5 ? c.heading : nav.capAffiche;
      if (precision <= 50) nav.horsTrajet++;
    }

    // Sortie du trajet : on recalcule depuis la position actuelle (au plus une fois toutes les 8 s)
    const loin = s && s.ecart > 80 && precision <= 40;
    if (!nav.arrivee && !surRoute && (nav.horsTrajet >= 3 || loin) && maintenant - nav.dernierRecalcul > 8000) {
      recalculer(lon, lat, capAffiche);
      return;
    }

    // Animation douce de la position affichée jusqu'au prochain point GPS
    const depart = nav.anim ? positionAnimee(maintenant) : { p: affiche, cap: capAffiche };
    nav.anim = {
      de: depart.p, capDe: depart.cap, vers: affiche, capVers: capAffiche, t0: maintenant,
      duree: nav.dernierFix ? Math.min(1500, Math.max(300, maintenant - nav.dernierFix)) : 1
    };
    nav.dernierFix = maintenant;
    nav.capAffiche = capAffiche;

    // Zoom selon la vitesse, plus serré à l'approche d'une manœuvre en ville
    const kmh = vitesse != null ? vitesse * 3.6 : 0;
    const [suivante] = s ? Consignes.prochaines(nav.prep, s.parcouru) : [null];
    const avantManoeuvre = s && suivante ? suivante.pos - s.parcouru : Infinity;
    if (kmh > 80) nav.zoomCible = 15.3;
    else if (kmh > 50) nav.zoomCible = 16.2;
    else if (avantManoeuvre < 150) nav.zoomCible = 17.8;
    else nav.zoomCible = 17.2;

    // Arrivée
    if (surRoute && s.resteDistance < 25) nav.arrivee = true;

    afficher(surRoute ? s : null, kmh);
  }

  function recalculer(lon, lat, cap) {
    $('nav-titre').textContent = 'Recalcul de l\'itinéraire…';
    $('nav-rue').textContent = '';
    $('nav-distance').textContent = '';
    nav.dernierRecalcul = performance.now();
    const nouveau = Itineraire.recalculer({ lon, lat }, cap);
    if (!nouveau || nouveau.erreur) {
      $('nav-titre').textContent = nouveau && nouveau.message ? nouveau.message : 'Recalcul impossible';
      return;
    }
    nav.trajet = nouveau;
    nav.prep = Consignes.preparer(nouveau, nav.destination.nom);
    nav.indice = 0;
    nav.horsTrajet = 0;
    nav.recalculs++;
    etat.trajet.recalculs = nav.recalculs;
    if (simulation && simulation.minuterie) demarrerSimulation();
  }

  // -------------------------------------------------------------------
  // Affichage : bandeau, barre du bas, vitesse
  // -------------------------------------------------------------------
  function afficher(s, kmh) {
    const prep = nav.prep;
    const parcouru = s ? s.parcouru : 0;
    const resteDistance = s ? s.resteDistance : prep.total;
    const resteTemps = s ? s.resteTemps : prep.totalTemps;

    if (nav.arrivee) {
      $('nav-icone').innerHTML = icone({ type: 'arrivee' });
      $('nav-distance').textContent = '';
      $('nav-titre').textContent = 'Vous êtes arrivée';
      $('nav-rue').textContent = nav.destination.nom;
      $('nav-suivante').classList.add('cache');
      $('barre-arreter').textContent = 'Terminer';
      $('nav-arrivee').textContent = heure(0);
      $('nav-reste-temps').textContent = '0 min';
      $('nav-reste-distance').textContent = '0 m';
      arreterSimulation();
    } else {
      const [c1, c2] = Consignes.prochaines(prep, parcouru);
      const d1 = c1.pos - parcouru;
      $('nav-icone').innerHTML = icone(c1);
      $('nav-distance').textContent = texteDistance(d1);
      $('nav-titre').textContent = c1.titre;
      $('nav-rue').textContent = c1.rue || '';
      // La manœuvre suivante, si elle arrive peu après
      if (c2 && c2.pos - c1.pos < 400) {
        $('nav-suivante').classList.remove('cache');
        $('nav-suivante-icone').innerHTML = icone(c2);
        $('nav-suivante-texte').textContent = c2.titre;
      } else {
        $('nav-suivante').classList.add('cache');
      }
      $('nav-arrivee').textContent = heure(resteTemps);
      $('nav-reste-temps').textContent = texteDuree(resteTemps);
      $('nav-reste-distance').textContent = texteDistance(resteDistance);
    }

    // Vitesse actuelle et limitation de la rue (si connue)
    const v = nav.arrivee ? 0 : (kmh != null ? Math.round(kmh) : null);
    $('nav-vitesse-valeur').textContent = v != null ? v : '–';
    const limite = s && s.morceau && s.morceau.limitation ? s.morceau.limitation : 0;
    $('nav-limite').classList.toggle('cache', !limite);
    $('nav-limite').textContent = limite || '';
    $('nav-compteur').classList.toggle('exces', !!(limite && v != null && v > limite + 4));

    etat.trajet.progression = s ? {
      parcouruM: Math.round(parcouru), resteM: Math.round(resteDistance), resteS: Math.round(resteTemps),
      ecartM: Math.round(s.ecart), prochaine: Consignes.prochaines(prep, parcouru)[0].titre
    } : { horsTrajet: true };
  }

  // -------------------------------------------------------------------
  // Caméra : animée à chaque image pour des mouvements fluides
  // -------------------------------------------------------------------
  function positionAnimee(t) {
    const a = nav.anim;
    const f = Math.min(1, (t - a.t0) / a.duree);
    const p = [a.de[0] + (a.vers[0] - a.de[0]) * f, a.de[1] + (a.vers[1] - a.de[1]) * f];
    const cap = (a.capDe + Consignes.ecartAngle(a.capDe, a.capVers) * f + 360) % 360;
    return { p, cap };
  }

  function marges() {
    // Le point de position est placé dans le tiers bas de l'écran
    const bas = $('barre-trajet').getBoundingClientRect().height + 10;
    return { top: Math.round(window.innerHeight * 0.4) + bas, bottom: bas, left: 0, right: 0 };
  }

  function image(t) {
    if (!nav) return;
    boucle = requestAnimationFrame(image);
    if (!nav.anim) return;
    const { p, cap } = positionAnimee(t);
    pointBleu.setLngLat(p).setRotation(cap);
    nav.zoom += (nav.zoomCible - nav.zoom) * 0.03;
    if (nav.suivi) {
      if (nav.toucheEnCours) return; // geste en cours : on ne bouge pas la carte sous le doigt
      if (t - (nav.retour || 0) < 700) return; // transition de « Recentrer » en cours
      carte.jumpTo({ center: p, bearing: cap, pitch: INCLINAISON, zoom: nav.zoom, padding: marges() });
    } else if (!nav.toucheEnCours && Date.now() - nav.dernierToucher > RETOUR_AUTO_MS) {
      recentrer();
    }
  }

  function recentrer() {
    if (!nav) return;
    nav.suivi = true;
    etat.suivi = true;
    nav.retour = performance.now();
    $('bouton-recentrer').classList.add('cache');
    if (nav.anim) {
      const { p, cap } = positionAnimee(performance.now());
      carte.easeTo({ center: p, bearing: cap, pitch: INCLINAISON, zoom: nav.zoom, padding: marges(), duration: 650 });
    }
  }

  // Dès que l'utilisatrice touche la carte, la caméra arrête de suivre
  function interaction(e) {
    if (!nav || !e.originalEvent) return;
    nav.suivi = false;
    etat.suivi = false;
    nav.dernierToucher = Date.now();
    $('bouton-recentrer').classList.remove('cache');
  }

  // -------------------------------------------------------------------
  // Écran toujours allumé
  // -------------------------------------------------------------------
  async function garderEcranAllume() {
    if (!nav) return;
    try {
      if ('wakeLock' in navigator) {
        nav.verrou = await navigator.wakeLock.request('screen');
        etat.trajet.ecranAllume = true;
        return;
      }
    } catch (e) { /* refusé par l'iPhone : on donne le conseil ci-dessous */ }
    etat.trajet.ecranAllume = false;
    let dejaDit = false;
    try { dejaDit = localStorage.getItem('gps-bordeaux-conseil-ecran') === 'oui'; } catch (e) { /* rien */ }
    if (!dejaDit) {
      $('nav-conseil').classList.remove('cache');
      setTimeout(() => $('nav-conseil').classList.add('cache'), 12000);
      try { localStorage.setItem('gps-bordeaux-conseil-ecran', 'oui'); } catch (e) { /* rien */ }
    }
  }

  // -------------------------------------------------------------------
  // Mode simulation : le point « roule » sur le trajet, sans bouger
  // -------------------------------------------------------------------
  function demarrerSimulation() {
    arreterSimulation();
    const prep = nav.prep;
    simulation = {
      parcouru: 0,
      multiplicateur: simulation ? simulation.multiplicateur : (etat.multiplicateurSimulation || 2),
      minuterie: setInterval(pasSimulation, 1000)
    };
    etat.simulation = true;
    $('simulation-vitesse').textContent = '×' + simulation.multiplicateur;
    simulation.prep = prep;
    pasSimulation();
  }

  function pasSimulation() {
    if (!simulation || !nav) return;
    const prep = simulation.prep;
    // Vitesse du morceau en cours
    let k = 0;
    while (k < prep.cumul.length - 2 && prep.cumul[k + 1] <= simulation.parcouru) k++;
    const morceau = prep.morceaux[prep.morceauDuSegment[k]] || prep.morceaux[0];
    const v = (morceau.vitesse / 3.6) * simulation.multiplicateur;
    simulation.parcouru = Math.min(prep.total, simulation.parcouru + v);
    while (k < prep.cumul.length - 2 && prep.cumul[k + 1] < simulation.parcouru) k++;
    const A = prep.points[k], B = prep.points[k + 1] || A;
    const l = prep.cumul[k + 1] - prep.cumul[k] || 1;
    const f = Math.min(1, (simulation.parcouru - prep.cumul[k]) / l);
    const fin = simulation.parcouru >= prep.total;
    positionSimulee({
      coords: { longitude: A[0] + (B[0] - A[0]) * f, latitude: A[1] + (B[1] - A[1]) * f, accuracy: 5,
        speed: fin ? 0 : v, heading: Consignes.cap(A, B) },
      timestamp: Date.now()
    });
    if (fin) arreterSimulation();
  }

  function arreterSimulation() {
    if (simulation && simulation.minuterie) clearInterval(simulation.minuterie);
    if (simulation) simulation.minuterie = null;
    etat.simulation = false;
  }

  function changerVitesse(sens) {
    if (!simulation) return;
    const i = VITESSES_SIMULATION.indexOf(simulation.multiplicateur);
    simulation.multiplicateur = VITESSES_SIMULATION[Math.max(0, Math.min(VITESSES_SIMULATION.length - 1, i + sens))];
    etat.multiplicateurSimulation = simulation.multiplicateur;
    $('simulation-vitesse').textContent = '×' + simulation.multiplicateur;
  }

  // -------------------------------------------------------------------
  function installer(options) {
    ({ carte, etat, pointBleu, elementPoint, positionSimulee, revenirPositionReelle } = options);
    ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((ev) => carte.on(ev, interaction));
    // Doigt posé sur la carte : la caméra se met en pause pour laisser faire le geste
    const zone = carte.getCanvasContainer();
    const poser = () => { if (nav) { nav.toucheEnCours = true; nav.dernierToucher = Date.now(); } };
    const lever = () => { if (nav) { nav.toucheEnCours = false; nav.dernierToucher = Date.now(); } };
    zone.addEventListener('pointerdown', poser);
    zone.addEventListener('touchstart', poser, { passive: true });
    window.addEventListener('pointerup', lever);
    window.addEventListener('touchend', lever, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (nav && document.visibilityState === 'visible') garderEcranAllume();
    });

    $('barre-arreter').addEventListener('click', () => {
      if (nav && nav.arrivee) arreter();
      else $('confirmation-arret').classList.remove('cache');
    });
    $('arret-non').addEventListener('click', () => $('confirmation-arret').classList.add('cache'));
    $('arret-oui').addEventListener('click', arreter);
    $('barre-secours').addEventListener('click', () => {
      if (!nav) return;
      const d = nav.destination;
      $('secours-waze').href = 'https://waze.com/ul?ll=' + d.lat + ',' + d.lon + '&navigate=yes';
      $('secours-plans').href = 'https://maps.apple.com/?daddr=' + d.lat + ',' + d.lon + '&dirflg=d';
      $('panneau-secours').classList.remove('cache');
    });
    $('secours-fermer').addEventListener('click', () => $('panneau-secours').classList.add('cache'));
    $('simulation-moins').addEventListener('click', () => changerVitesse(-1));
    $('simulation-plus').addEventListener('click', () => changerVitesse(1));
  }

  return { installer, demarrer, arreter, position, recentrer, actif: () => !!nav };
})();
