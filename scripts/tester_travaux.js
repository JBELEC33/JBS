// =====================================================================
// Test des travaux sur les vraies rues (lancé par GitHub Actions).
// Accroche les chantiers du jour au réseau, puis vérifie que les trajets
// n'empruntent jamais une rue fermée par des travaux.
// Utilisation : node scripts/tester_travaux.js donnees/rues.bin donnees/travaux.json
// =====================================================================
const fs = require('fs');
const MoteurItineraire = require('../moteur-itineraire.js');

const [fichierRues, fichierTravaux] = process.argv.slice(2);
const octets = fs.readFileSync(fichierRues);
const reseau = MoteurItineraire.creerReseau(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length));
const travaux = JSON.parse(fs.readFileSync(fichierTravaux, 'utf8'));
const jour = new Date().toISOString().slice(0, 10);
const actifs = travaux.chantiers.filter((c) => (!c.debut || c.debut <= jour) && (!c.fin || c.fin >= jour));
console.log(`Travaux du ${travaux.date} (source : ${travaux.miseAJourSource}) : ${travaux.chantiers.length} chantiers, ${actifs.length} actifs aujourd'hui`);
console.log('Effets :', ['ferme', 'ralenti', 'info'].map((e) => `${e} ${actifs.filter((c) => c.effet === e).length}`).join(', '));

let debut = Date.now();
const bilan = reseau.definirTravaux(actifs.map((c) => Object.assign({ texte: c.mesures.join(', ') }, c)));
console.log(`Accrochés au réseau en ${Date.now() - debut} ms : ${bilan.fermes} tronçons fermés, ${bilan.ralentis} ralentis`);

// Quelques chantiers fermants, avec la rue où ils ont été accrochés
actifs.filter((c) => c.effet === 'ferme').slice(0, 8).forEach((c) => {
  const p = c.geo[0][0];
  const a = reseau.accrocher(p[0], p[1], true);
  console.log(`   - ${c.lieu} | ${c.mesures.join(', ')} → ${a ? reseau.nomTroncon(a.troncon) + ' (' + Math.round(a.ecart) + ' m)' : 'non accroché'}`);
});

// Trajets dans Bordeaux et Mérignac : aucun morceau fermé, sauf tout au début ou tout à la fin
const lieux = [[-0.5705, 44.8415], [-0.5566, 44.8259], [-0.5800, 44.8411], [-0.6450, 44.8380], [-0.5900, 44.8600], [-0.6000, 44.8250]];
let echecs = 0, trajets = 0;
for (const a of lieux) for (const b of lieux) {
  if (a === b) continue;
  const r = reseau.calculer({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
  if (r.erreur) { console.log('   pas de trajet', a, b, r.message); continue; }
  trajets++;
  const fermes = r.morceaux.slice(1, -1).filter((m) => m.travaux === 1);
  if (fermes.length) { console.log('   ÉCHEC : trajet par une rue fermée', a, b, fermes.map((m) => m.nom)); echecs++; }
}
console.log(`${trajets} trajets vérifiés : ${echecs ? echecs + ' échec(s)' : 'aucun ne passe par une rue fermée'}`);
if (echecs) process.exit(1);
