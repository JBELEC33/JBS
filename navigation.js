// =====================================================================
// Navigation pendant le trajet (comme les GPS grand public) :
// - caméra inclinée en 3D qui suit la voiture et tourne dans le sens de la marche ;
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
    return heureDe(Date.now() + dans * 1000);
  }
  function heureDe(ms) {
    const d = new Date(ms);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Petit message en haut de l'écran (recalcul, arrivée). duree = 0 : reste affiché
  function message(texte, duree) {
    const m = $('nav-message');
    m.textContent = texte;
    m.classList.remove('cache');
    clearTimeout(message.minuterie);
    if (duree) message.minuterie = setTimeout(() => m.classList.add('cache'), duree);
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
    // Heure d'arrivée annoncée au départ : gardée telle quelle jusqu'à la fin
    // (même en cas de bouchon ou de recalcul), pour comparer avec l'heure réelle.
    nav.arriveePrevue = Date.now() + nav.prep.totalTemps * 1000;
    etat.trajet.arriveePrevue = heureDe(nav.arriveePrevue);
    etat.ecran = 'trajet';
    etat.suivi = true;
    etat.trajet.mode = simuler ? 'simulation' : 'en route';
    etat.trajet.recalculs = 0;
    document.body.classList.add('en-navigation');
    $('barre-trajet').classList.remove('cache');
    $('nav-vitesse').classList.remove('cache');
    $('nav-bloque').classList.remove('cache');
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
    ['nav-message', 'barre-trajet', 'nav-vitesse', 'confirmation-arret', 'panneau-secours', 'nav-bloque', 'nav-conseil'].forEach((id) => $(id).classList.add('cache'));
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
    nav.dernierRecalcul = performance.now();
    const nouveau = Itineraire.recalculer({ lon, lat }, cap);
    if (!nouveau || nouveau.erreur) {
      message(nouveau && nouveau.message ? nouveau.message : 'Recalcul impossible', 6000);
      return;
    }
    message('Nouvel itinéraire', 3000);
    nav.trajet = nouveau;
    nav.prep = Consignes.preparer(nouveau, nav.destination.nom);
    nav.indice = 0;
    nav.horsTrajet = 0;
    nav.recalculs++;
    etat.trajet.recalculs = nav.recalculs;
    if (simulation && simulation.minuterie) demarrerSimulation();
  }

  // -------------------------------------------------------------------
  // Affichage : barre du bas, vitesse
  // -------------------------------------------------------------------
  function afficher(s, kmh) {
    const prep = nav.prep;
    const parcouru = s ? s.parcouru : 0;
    const resteDistance = s ? s.resteDistance : prep.total;
    const resteTemps = s ? s.resteTemps : prep.totalTemps;

    if (nav.arrivee) {
      if ($('barre-arreter').textContent !== 'Terminer') message('Vous êtes arrivée : ' + nav.destination.nom, 0);
      $('barre-arreter').textContent = 'Terminer';
      $('nav-arrivee').textContent = heure(0);
      $('nav-reste-temps').textContent = '0 min';
      $('nav-reste-distance').textContent = '0 m';
      arreterSimulation();
    } else {
      $('nav-arrivee').textContent = heure(resteTemps);
      $('nav-reste-temps').textContent = texteDuree(resteTemps);
      $('nav-reste-distance').textContent = texteDistance(resteDistance);
    }
    // Sous l'heure d'arrivée : l'heure prévue au départ (en orange si on est en retard)
    const retard = Math.round((Date.now() + (nav.arrivee ? 0 : resteTemps) * 1000 - nav.arriveePrevue) / 60000);
    $('nav-arrivee-prevue').textContent = 'prévu ' + heureDe(nav.arriveePrevue) + (retard >= 1 ? ' (+' + retard + ' min)' : '');
    $('nav-arrivee-prevue').classList.toggle('en-retard', retard >= 1);

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
    const r = $('barre-trajet').getBoundingClientRect();
    if (r.width < window.innerWidth * 0.7) {
      // Téléphone en paysage : la barre est une colonne à gauche, la route se voit à sa droite
      return { top: Math.round(window.innerHeight * 0.4), bottom: 10, left: Math.round(r.right), right: 0 };
    }
    const bas = r.height + 10;
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
    // Hauteur réelle de la barre du bas (2 ou 3 lignes selon la simulation) : les boutons
    // et le compteur de vitesse se placent juste au-dessus (variable CSS --barre-haut)
    const barre = $('barre-trajet');
    const mesurer = () => {
      const h = barre.getBoundingClientRect().height;
      if (h) document.documentElement.style.setProperty('--barre-haut', Math.round(h) + 'px');
    };
    if (window.ResizeObserver) new ResizeObserver(mesurer).observe(barre);
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

  // Recalcul immédiat depuis la position actuelle (par exemple après un signalement « rue bloquée »)
  function recalculerMaintenant() {
    if (!nav || nav.arrivee) return;
    const p = nav.anim ? positionAnimee(performance.now()) : null;
    const lon = p ? p.p[0] : (etat.position && etat.position.longitude);
    const lat = p ? p.p[1] : (etat.position && etat.position.latitude);
    if (lon == null) return;
    recalculer(lon, lat, nav.capAffiche);
  }

  return { installer, demarrer, arreter, position, recentrer, recalculerMaintenant, actif: () => !!nav };
})();
