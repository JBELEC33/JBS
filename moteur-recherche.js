// =====================================================================
// Moteur de recherche des lieux, entièrement sur le téléphone.
// - cherche dès les premières lettres ;
// - tolère les fautes de frappe et les accents oubliés ;
// - comprend les catégories (« boulangerie ») et les sigles (« CPAM ») ;
// - classe du plus proche au plus loin.
// Ce fichier marche aussi sur ordinateur (Node), pour les tests automatiques.
// =====================================================================
(function (global) {
  'use strict';

  // Petits mots ignorés dans la recherche (« place DE LA Bourse »)
  const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en', 'sur', 'pour']);

  // Minuscules, sans accents, sans ponctuation : « Pâtisserie l'Été » → « patisserie l ete »
  function normaliser(texte) {
    return (texte || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function decouper(texte) {
    const n = normaliser(texte);
    return n ? n.split(' ') : [];
  }

  // Nombre de fautes entre le mot tapé et le DÉBUT d'un mot connu
  // (ex. « boulengr » contre « boulangerie » → 1 faute). On s'arrête dès que ça dépasse « max ».
  function fautesDebut(tape, mot, max) {
    const n = tape.length, m = Math.min(mot.length, n + max);
    let precedente = new Array(m + 1);
    let avantDerniere = null;
    for (let j = 0; j <= m; j++) precedente[j] = j;
    for (let i = 1; i <= n; i++) {
      const ligne = [i];
      let minLigne = i;
      for (let j = 1; j <= m; j++) {
        const cout = tape[i - 1] === mot[j - 1] ? 0 : 1;
        let v = Math.min(precedente[j] + 1, ligne[j - 1] + 1, precedente[j - 1] + cout);
        // Deux lettres inversées (« boualngerie ») = une seule faute
        if (i > 1 && j > 1 && tape[i - 1] === mot[j - 2] && tape[i - 2] === mot[j - 1]) {
          v = Math.min(v, avantDerniere[j - 2] + 1);
        }
        ligne[j] = v;
        if (v < minLigne) minLigne = v;
      }
      if (minLigne > max) return max + 1;
      avantDerniere = precedente;
      precedente = ligne;
    }
    // Le mot tapé peut correspondre au début du mot connu : on prend le meilleur début
    let meilleur = max + 1;
    for (let j = Math.max(0, n - max); j <= m; j++) meilleur = Math.min(meilleur, precedente[j]);
    return meilleur;
  }

  function fautesPermises(longueur) {
    if (longueur >= 8) return 2;
    if (longueur >= 4) return 1;
    return 0;
  }

  // Distance en mètres entre deux points [lon, lat]
  function distanceMetres(lon1, lat1, lon2, lat2) {
    const r = Math.PI / 180;
    const x = (lon2 - lon1) * r * Math.cos((lat1 + lat2) / 2 * r);
    const y = (lat2 - lat1) * r;
    return Math.sqrt(x * x + y * y) * 6371000;
  }

  // -------------------------------------------------------------------
  // Construction de l'index (une seule fois, au chargement de l'appli)
  // -------------------------------------------------------------------
  function creerMoteur(donnees, categories, sigles) {
    const types = donnees.types;
    const communes = donnees.communes;
    const lieux = donnees.lieux;

    // Mots de chaque catégorie : son nom + ses synonymes
    const motsDuType = types.map((code) => {
      const c = categories[code] || {};
      const mots = new Set(decouper(c.nom || ''));
      (c.mots || []).forEach((m) => decouper(m).forEach((x) => mots.add(x)));
      return [...mots].filter((m) => !MOTS_VIDES.has(m));
    });

    // Sigles : on prépare les phrases à repérer dans les noms
    const reglesSigles = (sigles || []).map((s) => ({
      mots: [...new Set(s.mots.flatMap(decouper))].filter((m) => !MOTS_VIDES.has(m)),
      phrases: (s.trouve || []).map((p) => ' ' + normaliser(p) + ' '),
      types: new Set((s.categories || []).map((code) => types.indexOf(code)).filter((i) => i >= 0))
    }));

    const index = new Map();         // mot → liste des lieux dont le nom contient ce mot
    const indexMotsCles = new Map(); // mot → liste des lieux dont le type ou le sigle contient ce mot (« boulangerie », « chu »)
    const indexCommune = new Map();  // mot → liste des lieux de cette commune

    function ajouter(table, mot, i) {
      let liste = table.get(mot);
      if (!liste) table.set(mot, liste = []);
      if (liste[liste.length - 1] !== i) liste.push(i);
    }

    for (let i = 0; i < lieux.length; i++) {
      const l = lieux[i];
      const texteNom = normaliser((l[0] || '') + ' ' + (l[7] || ''));
      const mots = new Set(texteNom ? texteNom.split(' ') : []);
      const motsCles = new Set(motsDuType[l[1]]);
      const avecEspaces = ' ' + texteNom + ' ';
      for (const regle of reglesSigles) {
        if (regle.types.has(l[1]) || regle.phrases.some((p) => avecEspaces.includes(p))) {
          regle.mots.forEach((m) => motsCles.add(m));
        }
      }
      mots.forEach((m) => { if (!MOTS_VIDES.has(m)) ajouter(index, m, i); });
      motsCles.forEach((m) => ajouter(indexMotsCles, m, i));
      const c = l[5] >= 0 ? communes[l[5]] : '';
      decouper(c).forEach((m) => { if (!MOTS_VIDES.has(m)) ajouter(indexCommune, m, i); });
    }

    // Vocabulaire trié (pour trouver vite les mots qui commencent par…) et rangé par première lettre (pour les fautes)
    function preparer(table) {
      const vocabulaire = [...table.keys()].sort();
      const parLettre = new Map();
      vocabulaire.forEach((m) => {
        if (!parLettre.has(m[0])) parLettre.set(m[0], []);
        parLettre.get(m[0]).push(m);
      });
      return { table, vocabulaire, parLettre, motsCles: table === indexMotsCles };
    }
    const parNom = preparer(index);
    const parMotCle = preparer(indexMotsCles);
    const parCommune = preparer(indexCommune);

    // Tous les lieux qui correspondent au mot tapé, avec une note de qualité :
    // 0 = type de lieu ou sigle tapé en entier (« chu », « boulangerie »),
    // 1 = début de mot ou nom de lieu (« boul » → boulangeries, « auchan »),
    // 2 = mot approché (faute de frappe).
    // Ainsi « boul » montre les boulangeries proches avant « Boul'Ange » à 12 km,
    // mais « CHU » montre les hôpitaux avant « Resto Chut ».
    function correspondances(source, tape, resultat) {
      const { table, vocabulaire, parLettre } = source;
      // 1) mots identiques ou qui commencent par ce qui est tapé (recherche dichotomique dans la liste triée)
      let bas = 0, haut = vocabulaire.length;
      while (bas < haut) {
        const milieu = (bas + haut) >> 1;
        if (vocabulaire[milieu] < tape) bas = milieu + 1; else haut = milieu;
      }
      for (let k = bas; k < vocabulaire.length && vocabulaire[k].startsWith(tape); k++) {
        const q = source.motsCles && vocabulaire[k] === tape ? 0 : 1;
        for (const i of table.get(vocabulaire[k])) {
          const avant = resultat.get(i);
          if (avant === undefined || q < avant) resultat.set(i, q);
        }
      }
      // 2) mots proches (fautes de frappe), seulement pour les mots d'au moins 4 lettres
      const max = fautesPermises(tape.length);
      if (max > 0) {
        for (const mot of parLettre.get(tape[0]) || []) {
          if (mot.startsWith(tape)) continue;
          if (fautesDebut(tape, mot, max) <= max) {
            for (const i of table.get(mot)) if (!resultat.has(i)) resultat.set(i, 2);
          }
        }
      }
      return resultat;
    }

    // -----------------------------------------------------------------
    // Recherche
    // -----------------------------------------------------------------
    // position : { lon, lat } ; renvoie les lieux triés : les mieux notés d'abord, puis du plus proche au plus loin
    function chercher(texte, position, limite) {
      let tapes = decouper(texte);
      const utiles = tapes.filter((m) => !MOTS_VIDES.has(m));
      if (utiles.length) tapes = utiles;
      if (!tapes.length || (tapes.length === 1 && tapes[0].length < 2)) return [];

      // Pour chaque mot tapé : lieux trouvés par le nom/type/sigle, et lieux trouvés par la commune
      const parMot = tapes.map((t) => ({
        nom: correspondances(parNom, t, correspondances(parMotCle, t, new Map())),
        commune: t.length >= 3 ? correspondances(parCommune, t, new Map()) : new Map()
      }));

      // On part du mot qui donne le moins de résultats
      const ordre = parMot.slice().sort((a, b) => (a.nom.size + a.commune.size) - (b.nom.size + b.commune.size));
      const candidats = new Set([...ordre[0].nom.keys(), ...ordre[0].commune.keys()]);
      const trouves = [];
      for (const i of candidats) {
        let qualite = 0, parNom = false, ok = true;
        for (const m of parMot) {
          const q = m.nom.has(i) ? m.nom.get(i) : (m.commune.has(i) ? m.commune.get(i) : -1);
          if (q < 0) { ok = false; break; }
          if (m.nom.has(i)) parNom = true;
          qualite = Math.max(qualite, q);
        }
        // Au moins un mot doit correspondre au nom ou au type (pas seulement à la commune)
        if (!ok || !parNom) continue;
        const l = lieux[i];
        trouves.push({ i, qualite, distance: distanceMetres(position.lon, position.lat, l[2], l[3]) });
      }
      trouves.sort((a, b) => a.qualite - b.qualite || a.distance - b.distance);
      return trouves.slice(0, limite || 50).map((t) => lieu(t.i, t.distance, t.qualite));
    }

    // Vrai si le texte tapé est un nom de catégorie ou un sigle (« boulangerie », « pharmacie », « CPAM »)
    function estCategorie(texte) {
      const n = normaliser(texte);
      if (n.length < 4) return false;
      const egal = (m) => normaliser(m) === n;
      return Object.values(categories).some((c) => egal(c.nom) || (c.mots || []).some(egal)) ||
        (sigles || []).some((s) => s.mots.some(egal));
    }

    function lieu(i, distance, qualite) {
      const l = lieux[i];
      const code = types[l[1]];
      return {
        source: 'lieu',
        id: 'l' + i,
        nom: l[0] || (categories[code] || {}).nom || code,
        type: (categories[code] || {}).nom || code,
        code,
        lon: l[2],
        lat: l[3],
        adresse: l[4] || '',
        commune: l[5] >= 0 ? communes[l[5]] : '',
        horaires: l[6] || '',
        distance,
        qualite
      };
    }

    return { chercher, estCategorie, nombre: lieux.length, date: donnees.date };
  }

  const Moteur = { creerMoteur, normaliser, distanceMetres, fautesDebut };
  if (typeof module !== 'undefined' && module.exports) module.exports = Moteur;
  else global.Moteur = Moteur;
})(this);
