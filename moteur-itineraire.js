// =====================================================================
// Calcul d'itinéraire en voiture, entièrement sur le téléphone.
// Lit le fichier des rues (donnees/rues.bin) et cherche le trajet le plus
// rapide avec l'algorithme A* (« A étoile »), en respectant :
// sens uniques, interdictions de tourner, barrières et bornes,
// avec l'exception des zones piétonnes et des bornes de Bordeaux centre.
// Ce fichier marche aussi sur ordinateur (Node), pour les tests automatiques.
// =====================================================================
(function (global) {
  'use strict';

  // Drapeaux des points et des tronçons (mêmes valeurs que scripts/preparer_rues.py)
  const BLOQUE = 1, BORNE_BADGE = 2;
  const PIETON = 1, ACCES_LIMITE = 2, ROND_POINT = 4;

  // Temps ajoutés aux virages (en secondes), pour préférer les trajets simples
  const PENALITE_DROITE = 5, PENALITE_GAUCHE = 10, PENALITE_SERRE = 18, PENALITE_DEMI_TOUR = 40;
  const PENALITE_BORNE = 15; // le temps de passer la borne avec le badge
  const DISTANCE_ACCROCHE_MAX = 1500; // au-delà, le point est trop loin des rues connues (mètres)

  // Conversion degrés → mètres autour de Bordeaux (suffisant à l'échelle de l'agglomération)
  const LAT0 = 44.85 * Math.PI / 180;
  const MX = 111320 * Math.cos(LAT0) / 1e6; // mètres par millionième de degré de longitude
  const MY = 110540 / 1e6;                   // mètres par millionième de degré de latitude

  // -------------------------------------------------------------------
  // Lecture du fichier
  // -------------------------------------------------------------------
  function creerReseau(tampon) {
    const octets = new Uint8Array(tampon);
    if (String.fromCharCode(octets[0], octets[1], octets[2], octets[3]) !== 'GPSR') throw new Error('fichier des rues invalide');
    const longueurEntete = new DataView(tampon).getUint32(4, true);
    const entete = JSON.parse(new TextDecoder('utf-8').decode(octets.subarray(8, 8 + longueurEntete)));
    const base = 8 + longueurEntete;
    const genres = { Int32: Int32Array, Uint32: Uint32Array, Uint16: Uint16Array, Uint8: Uint8Array };
    const t = {};
    for (const nom in entete.tableaux) {
      const [genre, position, nombre] = entete.tableaux[nom];
      t[nom] = new genres[genre](tampon, base + position, nombre);
    }

    const nbNoeuds = t.noeudLon.length, nbTroncons = t.tronconA.length, nbAretes = t.areteCible.length;

    // Tableaux calculés une fois au chargement
    const areteSource = new Uint32Array(nbAretes);       // point de départ de chaque arête
    const areteDuree = new Float32Array(nbAretes);       // temps de parcours (secondes)
    const areteDuTroncon = new Int32Array(nbTroncons * 2).fill(-1); // tronçon + sens → arête
    const capDepart = new Float32Array(nbAretes);        // direction au départ de l'arête (degrés)
    const capArrivee = new Float32Array(nbAretes);       // direction à l'arrivée
    let vitesseMax = 1;
    for (let u = 0; u < nbNoeuds; u++) {
      for (let e = t.debutAretes[u]; e < t.debutAretes[u + 1]; e++) {
        areteSource[e] = u;
        const s = t.areteTroncon[e] >> 1;
        const v = t.tronconVitesse[s] / 3.6;
        if (v > vitesseMax) vitesseMax = v;
        areteDuree[e] = t.tronconLongueur[s] / v;
        areteDuTroncon[t.areteTroncon[e]] = e;
        const p = points(t.areteTroncon[e]);
        capDepart[e] = cap(p[0], p[1], p[2], p[3]);
        capArrivee[e] = cap(p[p.length - 4], p[p.length - 3], p[p.length - 2], p[p.length - 1]);
      }
    }

    // Interdictions de tourner, rangées par point de passage
    const interdictions = new Map();
    for (let i = 0; i < t.interDe.length; i++) {
      const par = t.interPar[i];
      if (!interdictions.has(par)) interdictions.set(par, []);
      interdictions.get(par).push(i);
    }

    // Grille pour retrouver vite les tronçons proches d'un point (cases d'environ 300 m)
    const CASE_LON = 4000, CASE_LAT = 3000; // en millionièmes de degré
    const grille = new Map();
    for (let s = 0; s < nbTroncons; s++) {
      const p = points(s * 2);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < p.length; k += 2) {
        x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
        y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
      }
      for (let cx = Math.floor(x0 / CASE_LON); cx <= Math.floor(x1 / CASE_LON); cx++) {
        for (let cy = Math.floor(y0 / CASE_LAT); cy <= Math.floor(y1 / CASE_LAT); cy++) {
          const cle = cx * 100000 + cy;
          let liste = grille.get(cle);
          if (!liste) grille.set(cle, liste = []);
          liste.push(s);
        }
      }
    }

    // Points d'un tronçon (dans le sens demandé) : [lon, lat, lon, lat, …] en millionièmes de degré
    function points(troncon2) {
      const s = troncon2 >> 1, inverse = troncon2 & 1;
      const a = t.tronconA[s], b = t.tronconB[s];
      const p = [t.noeudLon[a], t.noeudLat[a]];
      for (let k = t.tronconDebutForme[s]; k < t.tronconDebutForme[s + 1]; k++) p.push(t.formeLon[k], t.formeLat[k]);
      p.push(t.noeudLon[b], t.noeudLat[b]);
      if (!inverse) return p;
      const r = [];
      for (let k = p.length - 2; k >= 0; k -= 2) r.push(p[k], p[k + 1]);
      return r;
    }

    function cap(x1, y1, x2, y2) {
      return (Math.atan2((x2 - x1) * MX, (y2 - y1) * MY) * 180 / Math.PI + 360) % 360;
    }

    function longueurs(p) {
      const cumul = [0];
      for (let k = 2; k < p.length; k += 2) {
        cumul.push(cumul[cumul.length - 1] + Math.hypot((p[k] - p[k - 2]) * MX, (p[k + 1] - p[k - 1]) * MY));
      }
      return cumul;
    }

    // Morceau d'une polyligne entre deux fractions de sa longueur (0 = début, 1 = fin)
    function couper(p, de, a) {
      const cumul = longueurs(p), total = cumul[cumul.length - 1] || 1;
      const d0 = de * total, d1 = a * total;
      const res = [];
      const pointA = (d) => {
        for (let k = 1; k < cumul.length; k++) {
          if (d <= cumul[k] || k === cumul.length - 1) {
            const f = cumul[k] > cumul[k - 1] ? Math.min(1, Math.max(0, (d - cumul[k - 1]) / (cumul[k] - cumul[k - 1]))) : 0;
            return [p[2 * k - 2] + (p[2 * k] - p[2 * k - 2]) * f, p[2 * k - 1] + (p[2 * k + 1] - p[2 * k - 1]) * f];
          }
        }
        return [p[0], p[1]];
      };
      res.push(...pointA(d0));
      for (let k = 1; k < cumul.length - 1; k++) if (cumul[k] > d0 && cumul[k] < d1) res.push(p[2 * k], p[2 * k + 1]);
      res.push(...pointA(d1));
      return res;
    }

    // -----------------------------------------------------------------
    // Accrocher un point GPS à la rue la plus proche
    // -----------------------------------------------------------------
    function accrocher(lon, lat) {
      const x = Math.round(lon * 1e6), y = Math.round(lat * 1e6);
      const cx = Math.floor(x / CASE_LON), cy = Math.floor(y / CASE_LAT);
      let meilleur = null;
      for (let rayon = 1; rayon <= 4 && !meilleur; rayon++) {
        const vus = new Set();
        for (let dx = -rayon; dx <= rayon; dx++) {
          for (let dy = -rayon; dy <= rayon; dy++) {
            for (const s of grille.get((cx + dx) * 100000 + cy + dy) || []) {
              if (vus.has(s)) continue;
              vus.add(s);
              const p = points(s * 2);
              const cumul = longueurs(p), total = cumul[cumul.length - 1] || 1;
              for (let k = 2; k < p.length; k += 2) {
                // Point le plus proche sur le petit segment [k-1, k]
                const ax = (p[k - 2] - x) * MX, ay = (p[k - 1] - y) * MY;
                const bx = (p[k] - x) * MX, by = (p[k + 1] - y) * MY;
                const dxs = bx - ax, dys = by - ay;
                const l2 = dxs * dxs + dys * dys;
                const f = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dxs + ay * dys) / l2)) : 0;
                let d = Math.hypot(ax + dxs * f, ay + dys * f);
                // On préfère légèrement les rues ordinaires aux zones piétonnes
                if (t.tronconDrapeaux[s] & (PIETON | ACCES_LIMITE)) d += 15;
                if (!meilleur || d < meilleur.ecart) {
                  const position = cumul[k / 2 - 1] + (cumul[k / 2] - cumul[k / 2 - 1]) * f;
                  meilleur = {
                    troncon: s, fraction: position / total, ecart: d,
                    lon: (p[k - 2] + (p[k] - p[k - 2]) * f) / 1e6, lat: (p[k - 1] + (p[k + 1] - p[k - 1]) * f) / 1e6
                  };
                }
              }
            }
          }
        }
      }
      return meilleur;
    }

    // -----------------------------------------------------------------
    // Règles de passage d'une arête à la suivante
    // -----------------------------------------------------------------
    // Renvoie le temps ajouté (secondes), ou -1 si le passage est interdit
    function passage(e, f) {
      const v = t.areteCible[e];
      if ((t.areteTroncon[f] ^ 1) === t.areteTroncon[e]) {
        // Demi-tour : seulement en cul-de-sac
        return t.debutAretes[v + 1] - t.debutAretes[v] === 1 ? PENALITE_DEMI_TOUR : -1;
      }
      const liste = interdictions.get(v);
      if (liste) {
        const de = t.tronconVoie[t.areteTroncon[e] >> 1], vers = t.tronconVoie[t.areteTroncon[f] >> 1];
        for (const i of liste) {
          if (t.interDe[i] !== de) continue;
          if (t.interType[i] === 0 && t.interVers[i] === vers) return -1;
          if (t.interType[i] === 1 && t.interVers[i] !== vers) return -1;
        }
      }
      let penalite = 0;
      if (t.noeudDrapeaux[v] & BORNE_BADGE) penalite += PENALITE_BORNE;
      if ((t.tronconDrapeaux[t.areteTroncon[e] >> 1] & ROND_POINT) && (t.tronconDrapeaux[t.areteTroncon[f] >> 1] & ROND_POINT)) return penalite;
      const angle = ((capDepart[f] - capArrivee[e] + 540) % 360) - 180; // > 0 : à droite
      const a = Math.abs(angle);
      if (a < 35) return penalite;
      if (a > 135) return penalite + PENALITE_SERRE;
      return penalite + (angle > 0 ? PENALITE_DROITE : PENALITE_GAUCHE);
    }

    // -----------------------------------------------------------------
    // Recherche A* : chaque « état » est une arête parcourue jusqu'au bout
    // -----------------------------------------------------------------
    const cout = new Float64Array(nbAretes);
    const precedent = new Int32Array(nbAretes);
    const touche = new Uint32Array(nbAretes); // numéro de la recherche qui a touché cette arête
    const ferme = new Uint32Array(nbAretes);
    let numeroRecherche = 0;

    function calculer(depart, arrivee) {
      const debut = Date.now();
      const zone = entete.zoneCouverte;
      const dedans = (p) => p.lon >= zone[0] && p.lon <= zone[2] && p.lat >= zone[1] && p.lat <= zone[3];
      if (!dedans(arrivee)) return { erreur: 'hors-zone', message: "Cette destination est en dehors de la zone couverte par l'appli (agglomération bordelaise)." };
      if (!dedans(depart)) return { erreur: 'hors-zone', message: "Votre position est en dehors de la zone couverte par l'appli (agglomération bordelaise)." };
      const a = accrocher(depart.lon, depart.lat), b = accrocher(arrivee.lon, arrivee.lat);
      if (!a || a.ecart > DISTANCE_ACCROCHE_MAX) return { erreur: 'depart', message: 'Aucune rue trouvée près du point de départ.' };
      if (!b || b.ecart > DISTANCE_ACCROCHE_MAX) return { erreur: 'arrivee', message: "Aucune rue trouvée près de la destination." };

      numeroRecherche++;
      const tas = new Tas();
      const cibleX = b.lon * 1e6, cibleY = b.lat * 1e6;
      const h = (e) => {
        const v = t.areteCible[e];
        return Math.hypot((t.noeudLon[v] - cibleX) * MX, (t.noeudLat[v] - cibleY) * MY) / vitesseMax;
      };
      const toucher = (e, c, prec) => {
        if (touche[e] !== numeroRecherche || c < cout[e]) {
          touche[e] = numeroRecherche;
          cout[e] = c;
          precedent[e] = prec;
          tas.ajouter(c + h(e), e);
        }
      };

      // Départ : on peut partir dans un sens ou dans l'autre du tronçon de départ
      const eAvant = areteDuTroncon[a.troncon * 2], eArriere = areteDuTroncon[a.troncon * 2 + 1];
      if (eAvant >= 0) toucher(eAvant, (1 - a.fraction) * areteDuree[eAvant], -1);
      if (eArriere >= 0) toucher(eArriere, a.fraction * areteDuree[eArriere], -1);

      // Arrivée : on entre dans le tronçon d'arrivée par un bout ou par l'autre
      const dAvant = areteDuTroncon[b.troncon * 2], dArriere = areteDuTroncon[b.troncon * 2 + 1];
      let meilleur = Infinity, derniere = -1, finale = -1, direct = false;

      // Cas particulier : départ et arrivée sur le même tronçon, dans le bon sens
      if (a.troncon === b.troncon) {
        if (dAvant >= 0 && b.fraction >= a.fraction) { meilleur = (b.fraction - a.fraction) * areteDuree[dAvant]; finale = dAvant; direct = true; }
        if (dArriere >= 0 && b.fraction <= a.fraction) {
          const c = (a.fraction - b.fraction) * areteDuree[dArriere];
          if (c < meilleur) { meilleur = c; finale = dArriere; direct = true; }
        }
      }

      let explores = 0;
      while (tas.taille) {
        const [f, e] = tas.retirer();
        if (f >= meilleur) break;
        if (ferme[e] === numeroRecherche) continue;
        ferme[e] = numeroRecherche;
        explores++;
        const v = t.areteCible[e];
        if (t.noeudDrapeaux[v] & BLOQUE) continue; // barrière ou borne infranchissable
        // Peut-on entrer dans le tronçon d'arrivée depuis ce point ?
        for (const [d, part] of [[dAvant, b.fraction], [dArriere, 1 - b.fraction]]) {
          if (d < 0 || areteSource[d] !== v) continue;
          const p = passage(e, d);
          if (p < 0) continue;
          const c = cout[e] + p + part * areteDuree[d];
          if (c < meilleur) { meilleur = c; derniere = e; finale = d; direct = false; }
        }
        for (let g = t.debutAretes[v]; g < t.debutAretes[v + 1]; g++) {
          if (ferme[g] === numeroRecherche) continue;
          const p = passage(e, g);
          if (p < 0) continue;
          toucher(g, cout[e] + p + areteDuree[g], e);
        }
      }
      if (meilleur === Infinity) return { erreur: 'aucun', message: "Aucun itinéraire autorisé n'a été trouvé." };

      // Reconstitution du trajet
      const chemin = [];
      if (!direct) for (let e = derniere; e >= 0; e = precedent[e]) chemin.unshift(e);
      return construireTrajet(chemin, finale, a, b, direct, meilleur, explores, Date.now() - debut);
    }

    // Transforme la liste d'arêtes en trajet affichable : morceaux de ligne, bornes, distance, durée
    function construireTrajet(chemin, finale, a, b, direct, duree, explores, ms) {
      const morceaux = [];
      const ajouter = (e, de, jusqua) => {
        const s = t.areteTroncon[e] >> 1;
        const p = couper(points(t.areteTroncon[e]), de, jusqua);
        const coords = [];
        for (let k = 0; k < p.length; k += 2) coords.push([p[k] / 1e6, p[k + 1] / 1e6]);
        morceaux.push({
          coords,
          longueur: t.tronconLongueur[s] * (jusqua - de),
          duree: areteDuree[e] * (jusqua - de),
          pieton: !!(t.tronconDrapeaux[s] & PIETON),
          accesLimite: !!(t.tronconDrapeaux[s] & ACCES_LIMITE),
          rondPoint: !!(t.tronconDrapeaux[s] & ROND_POINT),
          nom: entete.noms[t.voieNom[t.tronconVoie[s]]] || '',
          vitesse: t.tronconVitesse[s],
          limitation: t.tronconLimitation[s],
          arete: e
        });
      };
      // Fraction du départ et de l'arrivée, dans le sens de parcours de chaque arête
      const fraction = (e, p) => (t.areteTroncon[e] & 1) ? 1 - p.fraction : p.fraction;
      if (direct) {
        ajouter(finale, fraction(finale, a), fraction(finale, b));
      } else {
        chemin.forEach((e, k) => ajouter(e, k === 0 ? fraction(e, a) : 0, 1));
        ajouter(finale, 0, fraction(finale, b));
      }
      const bornes = [];
      for (const e of chemin) {
        const v = t.areteCible[e];
        if (t.noeudDrapeaux[v] & BORNE_BADGE) bornes.push([t.noeudLon[v] / 1e6, t.noeudLat[v] / 1e6]);
      }
      return {
        morceaux,
        bornes,
        duree,
        distance: morceaux.reduce((x, m) => x + m.longueur, 0),
        depart: [a.lon, a.lat],
        arrivee: [b.lon, b.lat],
        explores,
        ms
      };
    }

    return {
      calculer,
      accrocher,
      date: entete.date,
      nbNoeuds, nbTroncons, nbAretes,
      zoneCouverte: entete.zoneCouverte
    };
  }

  // -------------------------------------------------------------------
  // Tas binaire (file de priorité) : donne toujours l'élément le plus prometteur
  // -------------------------------------------------------------------
  function Tas() {
    this.cles = new Float64Array(1024);
    this.valeurs = new Int32Array(1024);
    this.taille = 0;
  }
  Tas.prototype.ajouter = function (cle, valeur) {
    if (this.taille === this.cles.length) {
      const c = new Float64Array(this.taille * 2); c.set(this.cles); this.cles = c;
      const v = new Int32Array(this.taille * 2); v.set(this.valeurs); this.valeurs = v;
    }
    let i = this.taille++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cles[parent] <= cle) break;
      this.cles[i] = this.cles[parent];
      this.valeurs[i] = this.valeurs[parent];
      i = parent;
    }
    this.cles[i] = cle;
    this.valeurs[i] = valeur;
  };
  Tas.prototype.retirer = function () {
    const cle = this.cles[0], valeur = this.valeurs[0];
    const dernierCle = this.cles[--this.taille], dernierValeur = this.valeurs[this.taille];
    let i = 0;
    while (true) {
      let enfant = 2 * i + 1;
      if (enfant >= this.taille) break;
      if (enfant + 1 < this.taille && this.cles[enfant + 1] < this.cles[enfant]) enfant++;
      if (this.cles[enfant] >= dernierCle) break;
      this.cles[i] = this.cles[enfant];
      this.valeurs[i] = this.valeurs[enfant];
      i = enfant;
    }
    this.cles[i] = dernierCle;
    this.valeurs[i] = dernierValeur;
    return [cle, valeur];
  };

  const MoteurItineraire = { creerReseau };
  if (typeof module !== 'undefined' && module.exports) module.exports = MoteurItineraire;
  else global.MoteurItineraire = MoteurItineraire;
})(this);
