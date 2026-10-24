# GPS Bordeaux

Petite appli GPS personnelle (application web installable sur iPhone) pour circuler en voiture dans l'agglomération bordelaise.

- Appli en ligne : https://jbelec33.github.io/JBS/
- Cahier des charges : voir `CLAUDE.md`.

## Fichiers
- `index.html`, `style.css` : la page et son apparence.
- `app.js` : la carte et le point bleu (position en temps réel).
- `rapports.js` : le bouton « Ça ne va pas » (rapports gardés sur le téléphone, exportables).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil.
- `vendor/maplibre/` : bibliothèque de carte MapLibre GL JS (copie, licence BSD).
- `.github/workflows/pages.yml` : mise en ligne automatique sur GitHub Pages à chaque modification de `main`.
