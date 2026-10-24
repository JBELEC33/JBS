// =====================================================================
// Test du calcul d'itinéraire avec les vraies rues (lancé par GitHub Actions).
// Affiche la durée, la distance, le temps de calcul et les rues empruntées,
// et échoue si un trajet indispensable n'est pas trouvé.
// Utilisation : node scripts/tester_itineraire.js donnees/rues.bin
// =====================================================================
const fs = require('fs');
const path = require('path');
const MoteurItineraire = require('../moteur-itineraire.js');

const fichier = process.argv[2] || path.join(__dirname, '..', 'donnees', 'rues.bin');
const octets = fs.readFileSync(fichier);
let debut = Date.now();
const reseau = MoteurItineraire.creerReseau(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length));
console.log(`Fichier : ${(octets.length / 1048576).toFixed(1)} Mo, ${reseau.nbNoeuds} points, ${reseau.nbTroncons} tronçons, ${reseau.nbAretes} arêtes, rues du ${reseau.date}`);
console.log(`Préparation : ${Date.now() - debut} ms (ordinateur ; compter 3 à 5 fois plus sur iPhone)`);

const lieux = {
  'Place de la Bourse': [-0.5705, 44.8415],
  'Gare Saint-Jean': [-0.5566, 44.8259],
  'Aéroport de Mérignac': [-0.7156, 44.8306],
  'Place Gambetta': [-0.5800, 44.8411],
  'Rue Sainte-Catherine (milieu, piétonne)': [-0.5732, 44.8378],
  'Pessac centre': [-0.6310, 44.8067],
  'Lormont': [-0.5225, 44.8792],
  'Bègles': [-0.5480, 44.8080],
  'Blanquefort': [-0.6370, 44.9120],
  'Arcachon (hors zone)': [-1.1680, 44.6600]
};
const essais = [
  ['Place de la Bourse', 'Aéroport de Mérignac', true],
  ['Gare Saint-Jean', 'Place Gambetta', true],
  ['Place Gambetta', 'Gare Saint-Jean', true],
  ['Place Gambetta', 'Rue Sainte-Catherine (milieu, piétonne)', true],
  ['Pessac centre', 'Lormont', true],
  ['Bègles', 'Blanquefort', true],
  ['Place de la Bourse', 'Arcachon (hors zone)', false]
];

let echecs = 0;
for (const [de, a, obligatoire] of essais) {
  const p = (n) => ({ lon: lieux[n][0], lat: lieux[n][1] });
  const r = reseau.calculer(p(de), p(a));
  console.log(`\n${de} → ${a}`);
  if (r.erreur) {
    console.log(`   ${r.message}`);
    if (obligatoire) { console.log('   ÉCHEC'); echecs++; }
    continue;
  }
  const rues = [];
  r.morceaux.forEach((m) => { const n = m.nom || '(sans nom)'; if (rues[rues.length - 1] !== n) rues.push(n); });
  console.log(`   ${Math.round(r.duree / 60)} min, ${(r.distance / 1000).toFixed(1)} km — calcul ${r.ms} ms, ${r.explores} arêtes explorées`);
  console.log(`   zone piétonne : ${r.morceaux.some((m) => m.pieton) ? 'oui' : 'non'} · accès réservé : ${r.morceaux.some((m) => m.accesLimite) ? 'oui' : 'non'} · bornes badge : ${r.bornes.length}`);
  console.log(`   par : ${rues.slice(0, 14).join(' → ')}${rues.length > 14 ? ' → …' : ''}`);
  // Détail rue par rue (longueur, vitesse retenue, P = piéton, R = accès réservé)
  const depart = reseau.accrocher(lieux[de][0], lieux[de][1]), arrivee = reseau.accrocher(lieux[a][0], lieux[a][1]);
  console.log(`   départ accroché à ${Math.round(depart.ecart)} m, arrivée à ${Math.round(arrivee.ecart)} m`);
  if (r.distance < 6000) {
    const detail = [];
    r.morceaux.forEach((m) => {
      const cle = (m.nom || '(sans nom)') + (m.pieton ? ' [P]' : '') + (m.accesLimite ? ' [R]' : '');
      const d = detail[detail.length - 1];
      if (d && d.cle === cle) d.longueur += m.longueur; else detail.push({ cle, longueur: m.longueur, vitesse: m.vitesse });
    });
    console.log('   détail : ' + detail.map((d) => `${d.cle} ${Math.round(d.longueur)} m à ${d.vitesse} km/h`).join(' | '));
  }
  // Vérification de bon sens : vitesse moyenne entre 8 et 90 km/h
  const vitesse = r.distance / r.duree * 3.6;
  if (vitesse < 8 || vitesse > 90) { console.log(`   ÉCHEC : vitesse moyenne anormale (${vitesse.toFixed(0)} km/h)`); echecs++; }
  if (!obligatoire) { console.log('   ÉCHEC : ce trajet aurait dû être refusé (hors zone)'); echecs++; }
}

if (echecs) { console.log(`\n${echecs} échec(s)`); process.exit(1); }
console.log('\nTous les tests sont passés.');
