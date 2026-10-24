// =====================================================================
// Feux, stops et cédez-le-passage dessinés sur la carte.
// Ils viennent du fichier des rues (OpenStreetMap), déjà sur le téléphone :
// rien n'est téléchargé en plus. Visibles quand on zoome assez (rues).
// Leur temps d'attente moyen est compté dans la durée du trajet
// (feu 15 s, stop 6 s, cédez-le-passage 3 s : voir scripts/preparer_rues.py).
// =====================================================================
const Panneaux = (() => {
  const ZOOM_MIN = 15;
  let carte, liste = [];

  // Petites images dessinées une fois (pas de fichier image à télécharger)
  function images() {
    const r = 2; // deux fois plus de pixels pour un affichage net sur l'iPhone
    const faire = (nom, dessin) => {
      if (carte.hasImage(nom)) return;
      const c = document.createElement('canvas');
      c.width = c.height = 22 * r;
      const g = c.getContext('2d');
      g.scale(r, r);
      dessin(g);
      carte.addImage(nom, g.getImageData(0, 0, 22 * r, 22 * r), { pixelRatio: r });
    };
    // Feu : boîtier noir, trois lumières
    faire('panneau-feu', (g) => {
      g.fillStyle = '#1b1b1b'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(6, 1, 10, 20, 3); else g.rect(6, 1, 10, 20); g.fill(); g.stroke();
      [['#ff4d4d', 5], ['#ffc233', 11], ['#33d17a', 17]].forEach(([couleur, y]) => {
        g.fillStyle = couleur; g.beginPath(); g.arc(11, y, 2.4, 0, 2 * Math.PI); g.fill();
      });
    });
    // Stop : octogone rouge
    faire('panneau-stop', (g) => {
      g.fillStyle = '#d7263d'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + k * Math.PI / 4;
        g.lineTo(11 + 10 * Math.cos(a), 11 + 10 * Math.sin(a));
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 6.5px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('STOP', 11, 11.5);
    });
    // Cédez-le-passage : triangle pointe en bas, bord rouge
    faire('panneau-cedez', (g) => {
      g.fillStyle = '#fff'; g.strokeStyle = '#d7263d'; g.lineWidth = 3; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(2.5, 3); g.lineTo(19.5, 3); g.lineTo(11, 19.5); g.closePath(); g.fill(); g.stroke();
    });
  }

  function donnees() {
    const nom = ['', 'panneau-feu', 'panneau-stop', 'panneau-cedez'];
    return { type: 'FeatureCollection', features: liste.map(([lon, lat, genre]) => ({
      type: 'Feature', properties: { image: nom[genre] }, geometry: { type: 'Point', coordinates: [lon, lat] } })) };
  }

  function dessiner() {
    if (!carte || !liste.length) return;
    if (!carte.getSource('panneaux')) {
      try {
        images();
        carte.addSource('panneaux', { type: 'geojson', data: donnees() });
      } catch (e) {
        carte.once('styledata', dessiner); // style pas encore prêt
        return;
      }
      // Au-dessus de tout, trajet compris (le trajet est rangé dessous : voir itineraire.js)
      carte.addLayer({ id: 'panneaux', type: 'symbol', source: 'panneaux', minzoom: ZOOM_MIN,
        layout: { 'icon-image': ['get', 'image'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.65, 18, 1],
          'icon-allow-overlap': true, 'icon-pitch-alignment': 'viewport' } });
    } else {
      carte.getSource('panneaux').setData(donnees());
    }
  }

  function installer(laCarte) {
    carte = laCarte;
    carte.on('style.load', dessiner); // mode sombre / clair : le style est rechargé
  }

  // Le fichier des rues vient d'être chargé
  function surReseau(reseau) {
    liste = reseau.panneaux ? reseau.panneaux() : [];
    dessiner();
  }

  return { installer, surReseau, nombre: () => liste.length };
})();
