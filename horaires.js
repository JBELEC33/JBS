// =====================================================================
// Horaires d'ouverture OpenStreetMap → « Ouvert · ferme à 19:30 »
// Comprend les écritures les plus courantes, par exemple :
//   « Mo-Fr 08:00-12:00,14:00-19:00; Sa 09:00-12:00 », « 24/7 », « Su off ».
// Si l'écriture est trop compliquée, on renvoie null (rien n'est affiché),
// plutôt que de risquer une information fausse.
// =====================================================================
(function (global) {
  'use strict';

  const JOURS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // ordre de Date.getDay()
  const JOURS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  function minutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function heure(min) {
    min = min % 1440;
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }

  // Liste de jours « Mo-Fr,Su » → [1,2,3,4,5,0]
  function lireJours(texte) {
    const jours = [];
    for (const morceau of texte.split(',')) {
      const plage = morceau.split('-');
      const debut = JOURS.indexOf(plage[0]);
      const fin = plage.length > 1 ? JOURS.indexOf(plage[1]) : debut;
      if (debut < 0 || fin < 0) return null;
      for (let j = debut; ; j = (j + 1) % 7) {
        jours.push(j);
        if (j === fin) break;
      }
    }
    return jours;
  }

  // Lit tout le texte : renvoie, pour chaque jour de la semaine, la liste des créneaux [début, fin] en minutes
  function lire(texte) {
    if (!texte) return null;
    texte = texte.trim();
    if (texte === '24/7') return Array.from({ length: 7 }, () => [[0, 1440]]);
    const semaine = Array.from({ length: 7 }, () => []);
    for (let regle of texte.split(/;|\|\|/)) {
      regle = regle.replace(/"[^"]*"/g, '').trim(); // on retire les commentaires entre guillemets
      if (!regle) continue;
      // Jours fériés seuls : on les ignore (on ne connaît pas le calendrier des fériés)
      if (/^PH\b/.test(regle)) continue;
      const m = /^([A-Za-z,\-]+(?:\s*,\s*PH)?)?\s*(.*)$/.exec(regle);
      let jours = [0, 1, 2, 3, 4, 5, 6];
      let reste = regle;
      if (m && m[1] && /^[A-Z][a-z]/.test(m[1])) {
        const sansFeries = m[1].replace(/,?\s*PH/g, '');
        jours = lireJours(sansFeries.replace(/\s/g, ''));
        if (!jours) return null; // écriture non comprise (mois, semaines…)
        reste = m[2].trim();
      }
      // Une règle remplace ce qui avait été dit avant pour ces jours-là
      jours.forEach((j) => { semaine[j] = []; });
      if (reste === 'off' || reste === 'closed') continue;
      if (reste === '' || reste === '24/7') { jours.forEach((j) => semaine[j].push([0, 1440])); continue; }
      for (const creneau of reste.split(',')) {
        const c = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\+?$/.exec(creneau.trim());
        if (!c) return null;
        const debut = minutes(c[1]);
        let fin = minutes(c[2]);
        if (debut == null || fin == null) return null;
        if (fin <= debut) fin += 1440; // ouvert après minuit (ex. 18:00-02:00)
        jours.forEach((j) => semaine[j].push([debut, fin]));
      }
    }
    return semaine;
  }

  // État à un instant donné : { ouvert: true/false, texte: « Ouvert · ferme à 19:30 » }
  function etat(texte, maintenant) {
    let semaine;
    try { semaine = lire(texte); } catch (e) { return null; }
    if (!semaine) return null;
    maintenant = maintenant || new Date();
    const jour = maintenant.getDay();
    const min = maintenant.getHours() * 60 + maintenant.getMinutes();

    // Créneaux d'aujourd'hui, et ceux d'hier qui débordent après minuit
    const enCours = [];
    semaine[jour].forEach(([d, f]) => { if (min >= d && min < f) enCours.push(f); });
    semaine[(jour + 6) % 7].forEach(([d, f]) => { if (f > 1440 && min < f - 1440) enCours.push(f - 1440); });
    if (enCours.length) {
      const fin = Math.max(...enCours);
      if (fin >= 1440 && semaine.every((j) => j.some(([d, f]) => d === 0 && f >= 1440))) {
        return { ouvert: true, texte: 'Ouvert 24h/24' };
      }
      return { ouvert: true, texte: 'Ouvert · ferme à ' + heure(fin) };
    }

    // Fermé : prochaine ouverture dans les 7 jours
    for (let decalage = 0; decalage < 7; decalage++) {
      const j = (jour + decalage) % 7;
      const debuts = semaine[j].map(([d]) => d).filter((d) => decalage > 0 || d > min).sort((a, b) => a - b);
      if (debuts.length) {
        const quand = decalage === 0 ? '' : (decalage === 1 ? 'demain ' : JOURS_FR[j] + ' ');
        return { ouvert: false, texte: 'Fermé · ouvre ' + quand + 'à ' + heure(debuts[0]) };
      }
    }
    return { ouvert: false, texte: 'Fermé' };
  }

  const Horaires = { etat, lire };
  if (typeof module !== 'undefined' && module.exports) module.exports = Horaires;
  else global.Horaires = Horaires;
})(this);
