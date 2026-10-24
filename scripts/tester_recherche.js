// =====================================================================
// Test de la recherche avec des exemples réels (lancé par GitHub Actions).
// Affiche les premiers résultats de chaque recherche dans le journal,
// et échoue si une recherche indispensable ne trouve rien.
// Utilisation : node scripts/tester_recherche.js donnees/lieux.json
// =====================================================================
const fs = require('fs');
const path = require('path');
const Moteur = require('../moteur-recherche.js');
const Horaires = require('../horaires.js');

const racine = path.join(__dirname, '..');
const fichier = process.argv[2] || path.join(racine, 'donnees', 'lieux.json');
const donnees = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(racine, 'listes', 'categories.json'), 'utf8'));
const sigles = JSON.parse(fs.readFileSync(path.join(racine, 'listes', 'sigles.json'), 'utf8')).sigles;

const BORDEAUX = { lon: -0.5747, lat: 44.8425 };
let echecs = 0;

function km(m) { return (m / 1000).toFixed(1) + ' km'; }

const debut = Date.now();
const moteur = Moteur.creerMoteur(donnees, categories, sigles);
console.log(`Fichier : ${(fs.statSync(fichier).size / 1024 / 1024).toFixed(1)} Mo, ${moteur.nombre} lieux, données du ${donnees.date}`);
console.log(`Préparation de l'index : ${Date.now() - debut} ms (ordinateur ; compter 2 à 4 fois plus sur iPhone)`);
if (moteur.nombre < 10000) { console.log('ÉCHEC : trop peu de lieux'); echecs++; }

// [texte tapé, doit trouver au moins un lieu ?]
const essais = [
  ['boulangerie', true], ['boulengerie', true], ['pharmacie', true], ['CPAM', true], ['cpam', true],
  ['musée', true], ["musee d'aquitaine", true], ['place de la Bourse', false], ['mairie merignac', true],
  ['préfecture', true], ['pole emploi', true], ['france travail', true], ['CHU', true], ['CAF', false],
  ['Auchan', true], ['Leclerc', false], ['Decathlon', false], ['station essence', true], ['parking', true],
  ['boul', true], ['urssaf', false]
];

async function adresses(texte) {
  const url = 'https://data.geopf.fr/geocodage/search?index=address&autocomplete=1&limit=3&depcode=33&q=' + encodeURIComponent(texte);
  try {
    const json = await (await fetch(url)).json();
    return (json.features || []).filter((f) => String(f.properties.postcode).startsWith('33')).map((f) => f.properties.label);
  } catch (e) {
    return ['(service des adresses injoignable : ' + e.message + ')'];
  }
}

(async () => {
  for (const [texte, obligatoire] of essais) {
    const t0 = Date.now();
    const res = moteur.chercher(texte, BORDEAUX, 50);
    const duree = Date.now() - t0;
    console.log(`\n« ${texte} » : ${res.length} lieu(x) en ${duree} ms${moteur.estCategorie(texte) ? ' [catégorie]' : ''}`);
    res.slice(0, 5).forEach((r) => {
      const h = r.horaires ? Horaires.etat(r.horaires) : null;
      console.log(`   - ${r.nom} | ${r.type} | ${[r.adresse, r.commune].filter(Boolean).join(', ')} | ${km(r.distance)}${h ? ' | ' + h.texte : ''}${r.qualite ? ' (approché)' : ''}`);
    });
    if (obligatoire && !res.length) { console.log('   ÉCHEC : aucun résultat'); echecs++; }
  }

  console.log('\n--- Adresses (Base Adresse Nationale, Gironde) ---');
  for (const texte of ['12 rue Sainte-Catherine Bordeaux', 'place de la Bourse', '1 cours de l\'Intendance', 'rue de la paix']) {
    console.log(`« ${texte} » →`, (await adresses(texte)).join(' ; ') || 'aucun résultat');
  }

  const ouverts = donnees.lieux.filter((l) => l[6]);
  const compris = ouverts.filter((l) => Horaires.etat(l[6]) !== null).length;
  console.log(`\nHoraires compris : ${compris} sur ${ouverts.length}`);

  if (echecs) { console.log(`\n${echecs} échec(s)`); process.exit(1); }
  console.log('\nTous les tests sont passés.');
})();
