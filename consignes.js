// =====================================================================
// Consignes de guidage et suivi de la progression sur le trajet.
// - transforme un trajet (morceaux de rues) en consignes :
//   « Tournez à droite », « Au rond-point, 2e sortie », « Zone piétonne »…
// - à chaque position GPS, retrouve où l'on en est sur le trajet
//   (distance parcourue, écart à la route, direction de la route).
// Ce fichier marche aussi sur ordinateur (Node), pour les tests automatiques.
// =====================================================================
(function (global) {
  'use strict';

  // Conversion degrés → mètres autour de Bordeaux
  const KX = 111320 * Math.cos(44.85 * Math.PI / 180), KY = 110540;

  function cap(a, b) {
    return (Math.atan2((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) * 180 / Math.PI + 360) % 360;
  }
  function ecartAngle(a, b) {
    return ((b - a + 540) % 360) - 180; // > 0 : vers la droite
  }
  function distance(a, b) {
    return Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);
  }

  // Direction au début et à la fin d'un morceau (en ignorant les points confondus)
  function capDebut(coords) {
    for (let k = 1; k < coords.length; k++) if (distance(coords[0], coords[k]) > 2) return cap(coords[0], coords[k]);
    return null;
  }
  function capFin(coords) {
    const n = coords.length - 1;
    for (let k = n - 1; k >= 0; k--) if (distance(coords[k], coords[n]) > 2) return cap(coords[k], coords[n]);
    return null;
  }

  function ordinal(n) {
    return n === 1 ? '1re' : n + 'e';
  }

  // -------------------------------------------------------------------
  // Préparation : ligne du trajet (avec distances et temps cumulés) et consignes
  // -------------------------------------------------------------------
  function preparer(trajet, nomDestination) {
    const morceaux = trajet.morceaux.filter((m) => m.coords.length >= 2);
    const points = [], cumul = [], cumulTemps = [], morceauDuSegment = [];
    const debutMorceau = [];
    morceaux.forEach((m, i) => {
      debutMorceau.push(Math.max(0, points.length - 1));
      const vitesse = m.longueur > 0 ? m.duree / m.longueur : 0; // secondes par mètre
      m.coords.forEach((c, k) => {
        if (points.length && k === 0) return; // même point que la fin du morceau précédent
        if (!points.length) { points.push(c); cumul.push(0); cumulTemps.push(0); return; }
        const d = distance(points[points.length - 1], c);
        points.push(c);
        cumul.push(cumul[cumul.length - 1] + d);
        cumulTemps.push(cumulTemps[cumulTemps.length - 1] + d * vitesse);
        morceauDuSegment.push(i);
      });
    });
    const total = cumul[cumul.length - 1] || 0;

    const consignes = [];
    for (let i = 1; i < morceaux.length; i++) {
      const a = morceaux[i - 1], b = morceaux[i];
      const pos = cumul[debutMorceau[i]];
      const point = points[debutMorceau[i]];
      // Borne au bout du morceau précédent
      if (a.borneFin) consignes.push({ type: 'borne', pos, point, titre: 'Borne : badge', rue: '' });
      // Entrée dans une zone piétonne ou à accès réservé
      if ((b.pieton || b.accesLimite) && !(a.pieton || a.accesLimite)) {
        consignes.push({ type: 'pieton', pos, point, titre: b.pieton ? 'Zone piétonne : rouler au pas' : 'Accès réservé : badge', rue: b.nom });
      }
      // Rond-point : on compte les sorties jusqu'à celle qu'on prend
      if (b.rondPoint && !a.rondPoint) {
        let j = i, sortie = 0;
        while (j < morceaux.length && morceaux[j].rondPoint) {
          if (morceaux[j].continuations >= 2) sortie++;
          j++;
        }
        const rue = j < morceaux.length ? morceaux[j].nom : '';
        consignes.push({ type: 'rond-point', sortie: Math.max(1, sortie), pos, point,
          titre: 'Au rond-point, ' + ordinal(Math.max(1, sortie)) + ' sortie', rue });
        i = j; // les virages à l'intérieur du rond-point ne donnent pas de consigne
        continue;
      }
      if (b.rondPoint) continue;
      // Simple virage de la route, sans autre choix possible : pas de consigne
      if (a.continuations < 2) continue;
      const c1 = capFin(a.coords), c2 = capDebut(b.coords);
      if (c1 == null || c2 == null) continue;
      const angle = ecartAngle(c1, c2), absolu = Math.abs(angle);
      if (absolu < 25) continue; // tout droit
      const cote = angle > 0 ? 'droite' : 'gauche';
      let force, titre;
      if (absolu < 55) { force = 'legerement'; titre = 'Tenez la ' + cote; }
      else if (absolu < 135) { force = 'normal'; titre = 'Tournez à ' + cote; }
      else { force = 'serre'; titre = 'Tournez franchement à ' + cote; }
      consignes.push({ type: 'virage', cote, force, pos, point, titre, rue: b.nom });
    }
    consignes.push({ type: 'arrivee', pos: total, point: points[points.length - 1],
      titre: 'Arrivée', rue: nomDestination || '' });
    // Au même endroit : la manœuvre d'abord, puis les informations (zone piétonne, borne)
    const ordre = { virage: 0, 'rond-point': 0, pieton: 1, borne: 2, arrivee: 3 };
    consignes.sort((x, y) => x.pos - y.pos || ordre[x.type] - ordre[y.type]);

    return { points, cumul, cumulTemps, morceauDuSegment, morceaux, consignes, total, totalTemps: cumulTemps[cumulTemps.length - 1] || 0 };
  }

  // -------------------------------------------------------------------
  // Suivi : où en est-on sur le trajet ?
  // -------------------------------------------------------------------
  // indice : dernier segment connu (on cherche autour pour ne pas « sauter » sur un autre passage du trajet)
  function situer(prep, lon, lat, indice) {
    const p = [lon, lat];
    const n = prep.points.length - 1;
    const chercher = (de, a) => {
      let meilleur = null;
      for (let k = Math.max(0, de); k < Math.min(n, a); k++) {
        const A = prep.points[k], B = prep.points[k + 1];
        const ax = (A[0] - lon) * KX, ay = (A[1] - lat) * KY, bx = (B[0] - lon) * KX, by = (B[1] - lat) * KY;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const f = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
        const ecart = Math.hypot(ax + dx * f, ay + dy * f);
        if (!meilleur || ecart < meilleur.ecart - 0.5) meilleur = { indice: k, f, ecart };
      }
      return meilleur;
    };
    let m = chercher((indice || 0) - 3, (indice || 0) + 150);
    if (!m || m.ecart > 60) {
      const partout = chercher(0, n);
      if (partout && (!m || partout.ecart < m.ecart)) m = partout;
    }
    if (!m) return null;
    const A = prep.points[m.indice], B = prep.points[m.indice + 1];
    const longueur = prep.cumul[m.indice + 1] - prep.cumul[m.indice];
    const parcouru = prep.cumul[m.indice] + longueur * m.f;
    const temps = prep.cumulTemps[m.indice] + (prep.cumulTemps[m.indice + 1] - prep.cumulTemps[m.indice]) * m.f;
    return {
      indice: m.indice,
      ecart: m.ecart,
      parcouru,
      resteDistance: Math.max(0, prep.total - parcouru),
      resteTemps: Math.max(0, prep.totalTemps - temps),
      point: [A[0] + (B[0] - A[0]) * m.f, A[1] + (B[1] - A[1]) * m.f], // position ramenée sur la route
      cap: cap(A, B),
      morceau: prep.morceaux[prep.morceauDuSegment[m.indice]]
    };
  }

  // Prochaine consigne (et la suivante) après la distance parcourue
  function prochaines(prep, parcouru) {
    const i = prep.consignes.findIndex((c) => c.pos > parcouru + 3);
    if (i < 0) return [prep.consignes[prep.consignes.length - 1], null];
    return [prep.consignes[i], prep.consignes[i + 1] || null];
  }

  const Consignes = { preparer, situer, prochaines, cap, ecartAngle, distance };
  if (typeof module !== 'undefined' && module.exports) module.exports = Consignes;
  else global.Consignes = Consignes;
})(this);
