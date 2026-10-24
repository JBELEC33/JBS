// Essai temporaire : captures d'écran de la carte avec les vraies tuiles (lancé par essai.yml)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: scheme, geolocation: { latitude: 44.8378, longitude: -0.5792 }, permissions: ['geolocation'] });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror:', e.message));
    await p.goto('http://localhost:8765/');
    await p.waitForTimeout(9000);
    await p.evaluate(() => carte.jumpTo({ center: [-0.5745, 44.8405], zoom: 16.3 }));
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `resultats/${scheme}-carte.png` });
    // Trajet : vers la gare Saint-Jean, puis vue de navigation en simulation
    await p.evaluate(() => Itineraire.apercu({ nom: 'Gare Saint-Jean', lon: -0.5566, lat: 44.8259, type: '', adresse: '', commune: '' }));
    await p.waitForTimeout(3000);
    console.log(scheme, 'panneaux du trajet :', await p.evaluate(() => Panneaux.affiches()), 'sur', await p.evaluate(() => Panneaux.nombre()));
    await p.screenshot({ path: `resultats/${scheme}-apercu.png` });
    await p.tap('#trajet-simuler');
    await p.waitForTimeout(25000);
    console.log(scheme, 'zoom en navigation :', await p.evaluate(() => carte.getZoom().toFixed(1)));
    await p.screenshot({ path: `resultats/${scheme}-navigation.png` });
    await ctx.close();
  }
  await b.close();
})();
