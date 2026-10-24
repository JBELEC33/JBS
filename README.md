# GPS Bordeaux

Petite appli GPS personnelle (application web installable sur iPhone) pour circuler en voiture dans l'agglomération bordelaise.

- Appli en ligne : https://jbelec33.github.io/JBS/
- Cahier des charges : voir `CLAUDE.md`.

## Fichiers
- `index.html`, `style.css` : la page et son apparence.
- `app.js` : la carte et le point bleu (position en temps réel).
- `rapports.js` : le bouton « Ça ne va pas » (rapports gardés sur le téléphone, exportables).
- `recherche.js`, `moteur-recherche.js`, `horaires.js` : la recherche (adresses, lieux, catégories, sigles).
- `itineraire.js`, `moteur-itineraire.js` : calcul de l'itinéraire sur le téléphone, aperçu.
- `consignes.js`, `navigation.js` : consignes de guidage, écran de navigation, recalcul, mode simulation.
- `listes/categories.json`, `listes/sigles.json` : listes faciles à compléter (types de lieux, sigles).
- `listes/reglages-itineraire.json` : zone où le badge ouvre les bornes (Bordeaux centre).
- `scripts/preparer_rues.py`, `scripts/tester_itineraire.js` : fichier des rues (chaque semaine) et ses tests.
- `scripts/preparer_lieux.py` : prépare chaque semaine le fichier des lieux de la Gironde (OpenStreetMap).
- `scripts/tester_recherche.js` : teste la recherche avec des exemples réels.
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil.
- `vendor/maplibre/` : bibliothèque de carte MapLibre GL JS (copie, licence BSD).
- `.github/workflows/pages.yml` : mise en ligne automatique sur GitHub Pages à chaque modification de `main`.
