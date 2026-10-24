// =====================================================================
// Fond de carte : style « liberty » d'OpenFreeMap (données OpenStreetMap),
// retouché pour la conduite :
//  - grands axes bien colorés (autoroute/rocade rouge orangé, routes principales
//    orange, secondaires jaune, petites rues blanches ou gris-bleu la nuit) ;
//  - noms des rues plus gros et plus lisibles ;
//  - flèches de sens unique bien visibles dès le zoom 15 ;
//  - bâtiments à plat (pas de 3D qui cache les rues en vue inclinée) ;
//  - version « nuit » bleu sombre (pas noire) quand l'iPhone est en mode sombre.
// Les retouches sont faites sur le téléphone au chargement du style.
// =====================================================================
const StyleCarte = (() => {
  const ADRESSE = 'https://tiles.openfreemap.org/styles/liberty';
  const modeSombre = window.matchMedia('(prefers-color-scheme: dark)');

  // Couleurs des deux versions
  const THEMES = {
    jour: {
      fond: '#f6f2ec', eau: '#9ec2f0', riviere: '#8db8ea', vert: '#cfe5bd', bois: '#bcdba5',
      quartier: 'rgba(0,0,0,0)', autreSol: null, batiment: '#e2ddd5', batimentBord: '#d3ccc2',
      autoroute: '#f2704a', autorouteBord: '#b9432a',
      principale: '#ffa53a', principaleBord: '#c87616',
      secondaire: '#ffe27a', secondaireBord: '#c8a43c',
      rue: '#ffffff', rueBord: '#bfb8ae', service: '#ffffff', serviceBord: '#d2ccc3',
      chemin: '#f3efe9', rail: '#b5b5b5', limite: '#9a9a9a',
      texteGrand: '#2b2b2b', texteRue: '#454545', texteAutre: '#555', halo: 'rgba(255,255,255,0.95)',
      fleche: '#4f6280'
    },
    nuit: {
      fond: '#1e2735', eau: '#1c3b5a', riviere: '#2a5478', vert: '#21372b', bois: '#1f3428',
      quartier: 'rgba(255,255,255,0.025)', autreSol: '#252f3f', batiment: '#2c3647', batimentBord: '#364257',
      autoroute: '#e9774a', autorouteBord: '#7c3a22',
      principale: '#e2a03a', principaleBord: '#6e4c15',
      secondaire: '#cbb75a', secondaireBord: '#5a5226',
      rue: '#5e6b84', rueBord: '#273041', service: '#4b566b', serviceBord: '#232b3a',
      chemin: '#3d4859', rail: '#4d5464', limite: '#5a6580',
      texteGrand: '#f1f4f9', texteRue: '#dfe5ee', texteAutre: '#b9c2d0', halo: 'rgba(30,39,53,0.95)',
      fleche: '#d2dbea'
    }
  };

  function nuit() { return modeSombre.matches; }

  // Couleur d'une couche de route d'après son nom dans le style liberty
  // (road_…, bridge_…, tunnel_… ; « _casing » = bordure)
  function couleurRoute(id, t) {
    const bord = id.endsWith('_casing');
    if (/rail/.test(id)) return t.rail;
    if (/path_pedestrian/.test(id)) return bord ? t.rueBord : t.chemin;
    if (/motorway/.test(id)) return bord ? t.autorouteBord : t.autoroute;
    if (/trunk_primary|_link/.test(id)) return bord ? t.principaleBord : t.principale;
    if (/secondary_tertiary/.test(id)) return bord ? t.secondaireBord : t.secondaire;
    if (/service_track/.test(id)) return bord ? t.serviceBord : t.service;
    if (/minor|street/.test(id)) return bord ? t.rueBord : t.rue;
    return null;
  }

  // Couleur d'une surface (sol, eau, parcs, bâtiments…)
  function couleurSurface(id, t) {
    if (id === 'water') return t.eau;
    if (id === 'park' || id === 'landcover_grass' || id === 'landuse_pitch' || id === 'landuse_cemetery') return t.vert;
    if (id === 'landcover_wood' || id === 'landcover_wetland') return t.bois;
    if (id === 'landuse_residential') return t.quartier;
    if (id === 'building') return t.batiment;
    return t.autreSol; // null : on garde la couleur d'origine (version jour)
  }

  function transformer(t) {
    return (_ancien, style) => {
      const couches = [];
      for (const c of style.layers) {
        const p = c.paint || (c.paint = {});
        const l = c.layout || (c.layout = {});
        // Bâtiments : à plat, à tous les zooms (la 3D cache les rues en vue inclinée)
        if (c.id === 'building-3d') continue;
        if (c.id === 'building') { delete c.maxzoom; p['fill-outline-color'] = t.batimentBord; }
        // Flèches de sens unique d'origine : remplacées par les nôtres (plus visibles)
        if (c.id === 'road_one_way_arrow') {
          couches.push({
            id: 'fleches-sens', type: 'symbol', source: c.source, 'source-layer': 'transportation', minzoom: 15,
            filter: ['match', ['get', 'oneway'], [1, -1], true, false],
            layout: {
              'symbol-placement': 'line', 'symbol-spacing': 70,
              'icon-image': 'fleche-sens', 'icon-rotate': ['case', ['==', ['get', 'oneway'], -1], 180, 0],
              'icon-rotation-alignment': 'map', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.55, 18, 0.95],
              'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-padding': 0
            },
            paint: { 'icon-opacity': 0.85 }
          });
          continue;
        }
        if (c.id === 'road_one_way_arrow_opposite') continue;

        if (c.type === 'background') p['background-color'] = t.fond;
        if (c.type === 'fill') {
          const couleur = couleurSurface(c.id, t);
          if (couleur) { p['fill-color'] = couleur; delete p['fill-outline-color']; if (c.id === 'building') p['fill-outline-color'] = t.batimentBord; }
          if (c.id === 'park') p['fill-opacity'] = 1;
        }
        if (c.type === 'line') {
          if (/^waterway/.test(c.id)) p['line-color'] = t.riviere;
          else if (/^boundary/.test(c.id)) p['line-color'] = t.limite;
          else if (/^aeroway/.test(c.id)) { if (t.autreSol) p['line-color'] = t.service; }
          else {
            const couleur = couleurRoute(c.id, t);
            if (couleur) p['line-color'] = couleur;
          }
        }
        if (c.type === 'symbol' && l['text-field']) {
          const rue = c.id === 'highway-name-minor' || c.id === 'highway-name-path';
          const axe = c.id === 'highway-name-major';
          if (rue || axe) {
            // Nom de la rue en français (nom OSM), plus gros
            l['text-field'] = ['coalesce', ['get', 'name'], ['get', 'name_en']];
            l['text-size'] = axe ? ['interpolate', ['linear'], ['zoom'], 12, 12, 15, 14, 18, 17]
                                 : ['interpolate', ['linear'], ['zoom'], 15, 12.5, 18, 16];
            l['text-font'] = [axe ? 'Noto Sans Bold' : 'Noto Sans Regular'];
            p['text-color'] = axe ? t.texteGrand : t.texteRue;
            p['text-halo-width'] = 1.6;
            p['text-halo-blur'] = 0.3;
          } else {
            p['text-color'] = t.texteAutre;
          }
          p['text-halo-color'] = t.halo;
          if (!p['text-halo-width']) p['text-halo-width'] = 1.2;
        }
        couches.push(c);
      }
      style.layers = couches;
      return style;
    };
  }

  // Flèche de sens unique dessinée sur le téléphone (pointe vers la droite = sens de la rue)
  function ajouterFleche(carte) {
    if (carte.hasImage('fleche-sens')) return;
    const r = 2, L = 26, H = 14;
    const c = document.createElement('canvas');
    c.width = L * r; c.height = H * r;
    const g = c.getContext('2d');
    g.scale(r, r);
    g.fillStyle = (nuit() ? THEMES.nuit : THEMES.jour).fleche;
    g.beginPath();
    g.moveTo(2, 5); g.lineTo(15, 5); g.lineTo(15, 1.5); g.lineTo(24, 7);
    g.lineTo(15, 12.5); g.lineTo(15, 9); g.lineTo(2, 9); g.closePath();
    g.fill();
    carte.addImage('fleche-sens', g.getImageData(0, 0, L * r, H * r), { pixelRatio: r });
  }

  function appliquer(carte) {
    // (la flèche est redessinée à la couleur du jour ou de la nuit quand le style la demande)
    carte.setStyle(ADRESSE, { diff: false, transformStyle: transformer(nuit() ? THEMES.nuit : THEMES.jour) });
  }

  // Style vide de départ (juste la couleur du fond), remplacé dès que le vrai style est chargé
  function styleDeDepart() {
    return { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background',
      paint: { 'background-color': (nuit() ? THEMES.nuit : THEMES.jour).fond } }] };
  }

  function installer(carte) {
    carte.on('styleimagemissing', (e) => { if (e.id === 'fleche-sens') ajouterFleche(carte); });
    appliquer(carte);
    // Si l'iPhone passe du mode clair au mode sombre, la carte suit
    modeSombre.addEventListener('change', () => appliquer(carte));
  }

  return { installer, styleDeDepart, nuit };
})();
