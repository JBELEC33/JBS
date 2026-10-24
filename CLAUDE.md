# GPS Bordeaux — cahier des charges pour Claude Code

## Contexte
- Petite appli GPS personnelle pour circuler en voiture dans l'agglomération bordelaise. Un seul utilisateur, sur un seul iPhone.
- L'utilisatrice **ne sait pas programmer** et **n'a pas de Mac**. Pour chaque étape :
  - expliquer en français simple ce que tu fais et pourquoi ;
  - donner des instructions concrètes pas à pas (où cliquer, quoi taper) ;
  - avancer par petites étapes, et s'arrêter à la fin de chacune pour qu'elle teste sur son iPhone.
- Ne jamais supposer qu'un Mac ou Xcode est disponible.
- Rester simple : on fait une seule chose qui marche bien, on ajoutera le reste plus tard.

## Mise à jour à chaque demande (obligatoire)
- **Après chaque modification, publier tout de suite sur GitHub** pour que l'appli en ligne soit à jour : enregistrer les changements (commit) et les envoyer sur la branche principale `main`, celle qui alimente GitHub Pages. Si le travail se fait sur une autre branche, la fusionner dans `main` (ou expliquer exactement à l'utilisatrice comment le faire).
- Vérifier que la mise en ligne automatique (GitHub Actions) a réussi. En cas d'échec, corriger avant de dire que c'est fini.
- **Terminer chaque réponse en redonnant le lien de l'appli** sur GitHub Pages, et indiquer quoi tester. Rappeler de fermer et rouvrir l'appli sur l'iPhone pour charger la nouvelle version.
- Si l'utilisatrice change une règle ou ajoute une fonctionnalité, **mettre aussi à jour ce fichier CLAUDE.md**, pour que les sessions suivantes suivent la nouvelle version.

## Ce que fait l'appli (version 1)
1. Afficher une carte centrée sur Bordeaux.
2. Montrer ma position en temps réel (point bleu qui suit la voiture).
3. Rechercher une destination (avant de partir, jamais en roulant) : une adresse, un commerce, un type de lieu ou un sigle. Voir la section « Recherche ».
4. Calculer l'itinéraire en voiture et l'afficher sur la carte, avec la durée et la distance.
5. Guider pendant le trajet : le trajet est dessiné sur la carte, la caméra suit la voiture. **Pas de bandeau d'instructions avec flèches** (retiré à la demande de l'utilisatrice le 24/10/2026 : trop encombrant, inutile pour elle). Pas de voix.
6. Tenir compte des travaux en cours : les afficher sur la carte et les éviter dans le calcul d'itinéraire.

C'est tout pour l'instant.

## Choix techniques
- **Application web installable (PWA)**, ouverte dans Safari puis ajoutée à l'écran d'accueil de l'iPhone. Pas d'App Store, pas de compte Apple Developer, pas de Mac.
- Hébergement gratuit sur **GitHub Pages**, mis à jour automatiquement à chaque modification. L'utilisatrice n'a qu'à ouvrir l'adresse sur son iPhone.
- Carte : MapLibre + données OpenStreetMap.
- **Carte utilisable sans réseau sur toute la Gironde** (parkings souterrains, zones mal couvertes) : les serveurs de tuiles publics d'OpenStreetMap interdisent le téléchargement en masse, donc proposer une solution adaptée (par exemple un fichier de tuiles vectorielles de la Gironde généré par GitHub Actions et publié avec l'appli). Expliquer la taille du fichier et le fonctionnement avant de coder.
- **Calcul d'itinéraire directement sur l'iPhone**, sans service en ligne :
  - un script (lancé automatiquement par GitHub Actions) télécharge les rues de l'agglomération bordelaise depuis OpenStreetMap et les transforme en un fichier compact (réseau de rues avec sens uniques, vitesses, zones piétonnes, bornes, interdictions) ;
  - ce fichier est publié avec l'appli, téléchargé une fois par le téléphone et gardé en mémoire ;
  - l'appli calcule elle-même le trajet le plus rapide (algorithme de type A*), en appliquant les règles ci-dessous ;
  - le fichier des rues est régénéré **une fois par semaine** pour suivre les changements de la carte ;
  - surveiller la taille du fichier et la vitesse de calcul sur l'iPhone ; expliquer à l'utilisatrice si une limite apparaît.
- Le GPS ne fonctionne que lorsque l'appli est ouverte et l'écran allumé : c'est voulu. Garder l'écran allumé pendant la navigation si possible, sinon expliquer comment régler le verrouillage automatique.
- Code simple, commenté en français, le moins de dépendances possible.

## Recherche
La recherche est un point essentiel : elle doit marcher aussi bien que celle de Google Maps pour un usage en Gironde.
- **Uniquement la Gironde** : ne jamais proposer de résultat hors du département (code postal commençant par 33). Classer les résultats du plus proche au plus loin de la position actuelle.
- **Recherches récentes** affichées en haut dès l'ouverture de la recherche, avant même de taper.
- **Recherche dès les premières lettres**, avec tolérance aux fautes de frappe et aux accents oubliés.
- **Adresses** : Base Adresse Nationale (api-adresse.data.gouv.fr), filtrée sur la Gironde. Seul le texte tapé est envoyé, jamais la position.
- **Commerces et lieux** (boulangeries, pharmacies, magasins, places, musées, administrations, parkings…) : à partir des données OpenStreetMap de la Gironde, ajoutées au fichier préparé chaque semaine par GitHub, pour que la recherche se fasse sur le téléphone. Proposer la meilleure solution et l'expliquer avant de coder.
- **Recherche par catégorie** : taper « boulangerie », « pharmacie » ou « musée » affiche tous ceux des environs.
- **Sigles et noms courants** : prévoir une liste de correspondances facile à compléter (CPAM = Caisse primaire d'assurance maladie, CAF, CCI, URSSAF, Pôle emploi / France Travail, mairie, préfecture, CHU, etc.), car les données ne contiennent pas toujours le sigle.
- **Affichage des résultats comme sur Google Maps** : une liste (nom, type, adresse, distance, horaires d'ouverture s'ils sont connus) **et** une mini-carte avec un repère par résultat. Toucher un résultat le met en avant sur la carte ; un bouton « Y aller » lance l'itinéraire.
- Tester la recherche avec des exemples réels avant de valider l'étape : une adresse précise, « boulangerie », « CPAM », « place de la Bourse », un musée, un nom de commerce.

## Travaux
- Les travaux changent souvent : les récupérer **chaque jour** (GitHub Actions), séparément du fichier des rues, et les recharger à l'ouverture de l'appli. Le téléphone télécharge la liste complète : sa position n'est jamais envoyée.
- Sources à chercher et vérifier avant usage (les adresses peuvent changer) : portail open data de Bordeaux Métropole (opendata.bordeaux-metropole.fr), notamment les jeux de données sur les chantiers et les mesures de circulation associées (un jeu « mesures associées aux chantiers » existe pour Bordeaux et Mérignac, vérifier sa couverture et sa fraîcheur) ; carte des chantiers de la Ville de Bordeaux ; site « Se déplacer » de Bordeaux Métropole. Présenter à l'utilisatrice ce qui existe vraiment, avec ses limites, avant de coder.
- **Source complémentaire : TomTom Traffic Incidents API** (plan gratuit : 2 500 requêtes par jour, sans carte bancaire), pour les fermetures, travaux et incidents en temps réel sur l'agglomération :
  - l'appli demande les incidents de toute la zone bordelaise (rectangle fixe), jamais autour de la position de l'utilisatrice ;
  - c'est le téléphone qui interroge TomTom directement : au calcul de chaque itinéraire, puis **toutes les 5 minutes pendant la navigation**. Si un nouvel incident touche le trajet en cours, recalculer et proposer le nouvel itinéraire (affichage clair, aucune action compliquée au volant). Aucune requête quand l'appli est fermée ;
  - ces données sont utilisées en direct pour le calcul en cours, **jamais conservées plus de 24 h** et **jamais utilisées pour des statistiques ou un historique** (conditions de licence TomTom Traffic) ;
  - afficher la mention « © TomTom » quand ces données sont visibles sur la carte ;
  - la clé d'API sera visible dans le code de la page : expliquer à l'utilisatrice comment la protéger (restriction par domaine si TomTom le permet) et comment surveiller sa consommation ;
  - avant de coder, relire les conditions actuelles sur docs.tomtom.com/legal et signaler à l'utilisatrice tout point qui interdirait cet usage.
- Dans le calcul : rue fermée = infranchissable ; rue en travaux mais ouverte (voie réduite, alternat) = temps de parcours augmenté.
- Prévoir aussi un **signalement manuel en un geste** (« rue bloquée ici »), utilisable à l'arrêt, avec une date de fin ou une suppression facile, pour les travaux absents des données officielles.
- Afficher la date de dernière mise à jour des travaux dans l'appli.

## Interface de navigation
L'interface est aussi importante que le calcul. Elle doit se comporter comme les GPS grand public type Waze (ergonomie et comportements, sans reprendre leur logo, leurs couleurs ni leurs visuels) :
- **Caméra inclinée en 3D** pendant la navigation (vue en perspective, comme si on regardait la route depuis l'arrière de la voiture), le point de position placé dans le tiers bas de l'écran.
- **La caméra suit le point** en continu, de façon fluide, et la carte **tourne dans le sens de la marche**.
- **Zoom et déplacement libres à tout moment** avec les doigts : la caméra arrête alors de suivre.
- **Bouton « Recentrer »** bien visible dès que la caméra ne suit plus : un toucher et on revient à la vue de navigation. Revenir automatiquement après quelques secondes sans toucher l'écran.
- **Zoom automatique selon la vitesse** : vue plus large à vitesse élevée (rocade), plus serrée à l'approche d'une manœuvre en ville.
- ~~Bandeau en haut avec la prochaine manœuvre~~ : **retiré à la demande de l'utilisatrice (24/10/2026), ne pas le remettre.** Seul un petit message apparaît en haut quand c'est utile (« Nouvel itinéraire », « Vous êtes arrivée »).
- **Barre en bas** : heure d'arrivée, temps restant, distance restante.
- **Vitesse actuelle** affichée, avec la **limitation de vitesse** de la rue quand elle est connue (OSM `maxspeed`).
- **Recalcul automatique** si l'utilisatrice sort de l'itinéraire.
- **Écran toujours allumé** pendant la navigation.
- **Aperçu avant le départ** : afficher le trajet entier sur la carte avec durée et distance, puis un gros bouton « Démarrer ».
- **Arrêter la navigation en un geste**, avec une petite confirmation pour éviter un arrêt par erreur.
- **Bouton de secours « Ouvrir dans Waze / Plans »** : relance la même destination dans Waze ou Plans d'Apple, au cas où l'appli bugue en plein trajet.
- Mouvements de carte fluides, sans saccades ; tester sur l'iPhone en conditions réelles.

## Outils de test (pour l'utilisatrice)
- **Mode simulation** : faire « rouler » le GPS sur un itinéraire choisi sans bouger (vitesse réglable), pour tester l'interface et le guidage depuis chez soi. À mettre en place dès que l'itinéraire existe.
- **Bouton « Ça ne va pas »** (utilisable à l'arrêt) : enregistre sur le téléphone l'endroit, l'heure, l'écran affiché et l'état de l'appli (itinéraire, position, réglages), avec un petit commentaire facultatif. Ces rapports sont exportables facilement pour être donnés à Claude Code afin de corriger le problème précis.

## Règles
- Ne jamais proposer un itinéraire interdit en voiture (sens interdit, voie bus/tram, accès interdit).
- **Exception : l'utilisatrice a le droit de traverser les zones piétonnes.** Le calcul d'itinéraire doit donc pouvoir passer par les rues piétonnes (OSM `highway=pedestrian` et accès limité aux véhicules autorisés), en les signalant clairement sur la carte (« zone piétonne : rouler au pas »). Les autres interdictions restent valables.
- **Bornes :** l'utilisatrice a un badge qui ouvre toutes les bornes escamotables de Bordeaux centre. Ces bornes ne bloquent donc pas l'itinéraire (les signaler sur la carte : « borne : badge »). Les bornes fixes et les barrières qui ne s'ouvrent pas restent infranchissables (OSM `barrier=bollard` avec `bollard=fixed`, etc.). En dehors de Bordeaux centre, considérer les bornes comme bloquantes.
- Sécurité au volant : gros boutons, mode sombre, aucune saisie au clavier pendant la conduite.
- Aucune donnée de position envoyée à un tiers : l'itinéraire est calculé sur le téléphone.

## Ordre de réalisation
1. Carte de Bordeaux + ma position, en ligne sur GitHub Pages, installée sur l'iPhone. Bouton « Ça ne va pas » dès cette étape.
2. Recherche complète (adresses, commerces, catégories, sigles, liste + mini-carte).
3. Préparation du fichier des rues + itinéraire calculé sur le téléphone et affiché sur la carte + mode simulation.
4. Guidage pendant le trajet et interface de navigation.
5. Travaux : récupération quotidienne, affichage sur la carte, prise en compte dans l'itinéraire, signalement manuel.
6. Carte utilisable sans réseau sur la Gironde.

À la fin de chaque étape : résumé de ce qui marche, de ce qui reste, et instructions de test sur l'iPhone.

## État d'avancement et choix déjà faits
- **Étape 1 faite** (carte + position + bouton « Ça ne va pas » + mise en ligne). Validée sur l'iPhone.
- **Étape 2 faite** (recherche). Validée sur l'iPhone.
- **Étape 3 faite** (fichier des rues + itinéraire calculé sur le téléphone + aperçu + mode simulation). Validée sur l'iPhone.
- **Étape 4 faite** (guidage et interface de navigation). Validée sur l'iPhone.
- **Étape 5 faite** (travaux de Bordeaux Métropole + signalement « rue bloquée ») : à valider sur l'iPhone. **Décision de l'utilisatrice : pas de TomTom** (licence incompatible, voir plus bas).
- Fond de carte en ligne : **OpenFreeMap** (tiles.openfreemap.org, gratuit, sans clé, données OSM), style `dark` si l'iPhone est en mode sombre, `liberty` sinon. Sera complété par la carte hors ligne à l'étape 6.
- MapLibre GL JS est copié dans `vendor/maplibre/` (pas de CDN).
- Mise en ligne : workflow `.github/workflows/pages.yml` (GitHub Pages, source « GitHub Actions »), déclenché à chaque push sur `main`, chaque lundi (refait le fichier des lieux) et à la main (`workflow_dispatch`, option « refaire_donnees »).
- **Fichiers de données produits par GitHub Actions** : jamais enregistrés dans le dépôt (dossier `donnees/` ignoré). Ils sont rangés dans la release GitHub « donnees » (ne pas la supprimer) et recopiés dans le site à chaque mise en ligne. Même principe à suivre pour le fichier des rues (étape 3).
- **Numéro de version** : constante `VERSION` dans `app.js`, affichée en bas de la fenêtre « Ça ne va pas ». L'augmenter à chaque mise en ligne, ainsi que le nom `CACHE` dans `sw.js` quand la liste des fichiers change.
- Rapports « Ça ne va pas » : stockés dans `localStorage` (clé `gps-bordeaux-rapports`), exportés en fichier JSON via le menu Partager de l'iPhone. Ils contiennent aussi l'état de la recherche.
- L'environnement de Claude Code n'a pas accès à internet (sauf GitHub) : les tests avec de vraies données se font dans GitHub Actions (`scripts/tester_recherche.js`, résultats lisibles dans le journal de l'action).

### Recherche (étape 2)
- Adresses : **Géoplateforme IGN** `https://data.geopf.fr/geocodage/search` (Base Adresse Nationale ; l'ancienne adresse api-adresse.data.gouv.fr est abandonnée), paramètres `index=address&autocomplete=1&depcode=33`. Seul le texte tapé est envoyé.
- Lieux : `scripts/preparer_lieux.py` (Python standard) interroge Overpass (zone `ISO3166-2=FR-33`), garde les types listés dans `listes/categories.json`, complète les adresses manquantes par recherche inverse BAN en lot (coordonnées des commerces seulement), et écrit `donnees/lieux.json` (format compact : tables `types` et `communes` + lignes `[nom, type, lon, lat, adresse, commune, horaires, autres noms]`).
- `listes/categories.json` : type OSM → nom français + synonymes (+ `sansNom` pour garder les lieux sans nom). Modifier ce fichier refait le fichier des lieux à la mise en ligne suivante.
- `listes/sigles.json` : sigles et noms courants (CPAM, CAF…), à compléter librement ; pris en compte directement par le téléphone.
- `moteur-recherche.js` : index en mémoire sur le téléphone, recherche par début de mot, fautes tolérées (1 faute dès 4 lettres, 2 dès 8, la première lettre doit être juste), classement : correspondances exactes d'abord, puis du plus proche au plus loin.
- `horaires.js` : lit les horaires OSM courants ; si l'écriture est trop complexe, rien n'est affiché.
- « Y aller » : en attendant l'itinéraire (étape 3), propose d'ouvrir la destination dans Waze ou Plans.
- Clavier bloqué au-dessus de 15 km/h (sécurité) ; les recherches récentes restent utilisables.

### Itinéraire (étape 3)
- **Zone couverte : l'agglomération bordelaise au sens large**, rectangle ouest -0.85, sud 44.70, est -0.35, nord 45.05 (constante `ZONE_COUVERTE` dans `scripts/preparer_rues.py`). Mesure faite : toute la Gironde ≈ 940 000 points de rues (fichier ≈ 10 Mo) contre ≈ 390 000 pour l'agglomération (fichier 5,6 Mo, **2,9 Mo compressé** au téléchargement). Hors zone : message + Waze/Plans.
- `scripts/preparer_rues.py` (Python standard + bibliothèque `osmium` installée par GitHub Actions) : télécharge l'**extrait régional Geofabrik** (aquitaine-latest.osm.pbf ; Overpass seulement en secours, car ses serveurs publics refusent souvent les grosses demandes : erreurs 504), garde les voies de la zone, applique les règles, ne garde que le **réseau principal relié dans les deux sens** (algorithme de Kosaraju : écarte les bouts de rue isolés derrière des barrières), écrit `donnees/rues.bin` (format : « GPSR », longueur de l'en-tête, en-tête JSON décrivant les tableaux + noms de rues, puis tableaux binaires little-endian alignés sur 4 octets).
- Règles appliquées à la préparation :
  - exclues : `highway=busway`, voies `access/motor_vehicle/motorcar = no/private/psv/bus…`, `service=driveway/parking_aisle/emergency_access/drive-through`, surfaces (`area=yes`) ;
  - `highway=pedestrian` : autorisée, signalée, 8 km/h ; `motor_vehicle=delivery/permit` : autorisée, signalée « accès réservé » ;
  - **dans la zone badge** (`listes/reglages-itineraire.json`, rectangle de Bordeaux centre) : rues `access=no` sans bus = accès réglementé, autorisées et signalées ; bornes non fixes (`bollard=rising`, inconnu…) franchissables et signalées « borne : badge » ;
  - hors zone badge : toutes les bornes bloquent ; partout : `bollard=fixed`, blocs, chaînes, barrières/portails fermés (`access=no/private`) bloquent ;
  - sens uniques (`oneway`, ronds-points, autoroutes), interdictions de tourner (relations `restriction` par un point, `no_*` et `only_*`).
  - vitesse : limitation OSM (`maxspeed`) sinon valeur par défaut selon le type de voie, × 0,8 en ville (0,7 avant la version 5.4) (0,85-0,9 sur rocade/autoroute) pour tenir compte des feux et du trafic. À ajuster si les durées affichées sont trop optimistes.
- `moteur-itineraire.js` : A* sur les arêtes (permet les interdictions de tourner), petites pénalités de virage (droite 5 s, gauche 10 s, serré 18 s, borne 15 s), demi-tour seulement en cul-de-sac ; accroche du départ et de l'arrivée à la rue la plus proche (grille de cases de ~300 m). Calcul mesuré : 5 à 70 ms sur ordinateur pour des trajets de 1 à 25 km.
- `itineraire.js` : chargement du fichier des rues 4 s après l'ouverture, aperçu (durée, distance, heure d'arrivée, alertes zone piétonne / accès réservé / bornes), trajet dessiné (bleu, pointillés orange en zone piétonne, étiquettes « borne : badge » et « zone piétonne : rouler au pas »), « Démarrer » (suivi du point, barre du bas, arrêt avec confirmation), **mode simulation** (×1 à ×8).
- Tests : `scripts/tester_itineraire.js` (trajets réels, temps de calcul, détail rue par rue) lancé à chaque mise en ligne.

### Guidage et navigation (étape 4)
- `consignes.js` (testable dans Node) : garde le suivi de la position sur le trajet ; les consignes servent seulement au zoom à l'approche des carrefours (plus affichées). Transforme le trajet en consignes (virage à droite/gauche, « tenez la », « franchement », rond-point avec numéro de sortie, zone piétonne, borne, arrivée) et situe la position sur le trajet (`situer` : distance parcourue, écart, reste, direction de la route).
  - Pas de consigne là où la route tourne sans autre choix (`continuations` < 2, calculé par `moteur-itineraire.js`).
  - Direction mesurée 25 m avant et 25 m après chaque carrefour ; deux virages du même côté à moins de 30 m = une seule consigne.
  - Seuils : < 25° tout droit, < 55° « Tenez la… », < 135° « Tournez à… », au-delà « Tournez franchement à… ».
- `navigation.js` : écran de navigation.
  - Caméra : inclinée à 55°, point dans le tiers bas (marge haute = 40 % de l'écran + barre du bas), carte tournée dans le sens de la route, positions interpolées à chaque image (`requestAnimationFrame` + `jumpTo`) pour un mouvement fluide.
  - Zoom : 15,3 au-dessus de 80 km/h, 16,2 au-dessus de 50 km/h, 17,8 à moins de 150 m d'une manœuvre, 17,2 sinon.
  - Toucher la carte met la caméra en pause, un geste arrête le suivi (bouton « Recentrer »), retour automatique après 8 s sans toucher.
  - Sur la route (écart < 30 m), le point est « collé » à la route. Recalcul automatique après 3 positions hors trajet (précision ≤ 50 m) ou dès 80 m d'écart (précision ≤ 40 m), au plus toutes les 8 s, en tenant compte de la direction de la voiture (`calculer(…, { cap })` évite de proposer un demi-tour au départ).
  - Écran gardé allumé avec l'API Wake Lock ; si l'iPhone refuse, conseil affiché une fois (Réglages › Luminosité et affichage › Verrouillage automatique).
  - ~~Bandeau vert en haut~~ (retiré le 24/10/2026, version 5.1) ; petit message `#nav-message` ; barre du bas (arrivée, temps, distance, Waze/Plans, Arrêter avec confirmation), compteur de vitesse + panneau de limitation (`maxspeed`), compteur rouge au-delà de la limitation + 4 km/h.
  - **Heure d'arrivée prévue gardée** (demande du 24/10/2026, version 5.3) : l'heure d'arrivée annoncée au démarrage est mémorisée et **ne change jamais** pendant le trajet (ni bouchon, ni recalcul). Elle est affichée sous l'heure d'arrivée actuelle (« prévu 10:58 »), en orange avec le retard (« prévu 10:58 (+6 min) ») si l'arrivée estimée est plus tardive.
  - La simulation est dans `navigation.js` ; à la fin d'une simulation, le point revient à la dernière vraie position GPS.
- Les tests de `scripts/tester_itineraire.js` affichent aussi les consignes de chaque trajet.

### Appui long sur la carte (ajout du 24/10/2026, version 5.2)
- `appui-long.js` : garder le doigt ~0,6 s sur la carte (écran carte ou aperçu, jamais pendant la navigation) pose un repère, affiche la rue la plus proche (trouvée dans le fichier des rues, sur le téléphone, sans envoi sur internet) et la distance, avec « Y aller » (ouvre l'aperçu du trajet) ou « Annuler ». Le geste est annulé si le doigt bouge de plus de 10 px ou si deux doigts touchent l'écran.

### Feux, stops et cédez-le-passage (ajout du 24/10/2026, version 5.4)
- `scripts/preparer_rues.py` garde les points OSM `highway=traffic_signals` (feu), `stop` et `give_way` (cédez-le-passage) des voies retenues : tableaux `panneauLon/Lat/Type` (1 feu, 2 stop, 3 cédez) dans `rues.bin`.
- **Temps d'attente compté dans l'itinéraire** : feu 15 s, stop 6 s, cédez-le-passage 3 s (constante `ATTENTE_PANNEAU`), au plus 40 s par tronçon et par sens, tableau `tronconAttente` (2 valeurs par tronçon : sens de la voie OSM, sens inverse). Un panneau compte pour le sens indiqué par OSM (`direction=forward/backward`), sinon pour le sens qui arrive au carrefour le plus proche. Pour ne pas compter les feux deux fois, `COEFF_VILLE` est passé de 0,7 à 0,8.
- `panneaux.js` : icônes dessinées sur le téléphone (canvas, aucune image à télécharger), couche `panneaux` visible dès le zoom 15, sous le trajet, sur la carte comme en navigation. `moteur-itineraire.js` → `panneaux()` ; un ancien fichier des rues sans ces tableaux fonctionne encore (pas d'icônes, pas d'attente).

### Travaux (étape 5)
- **Décision du 24/10/2026 : on fait sans TomTom.** Ne pas brancher TomTom (ni autre service en ligne de trafic) sans nouvel accord de l'utilisatrice et sans vérifier la licence.
- `scripts/preparer_travaux.py` (Python standard) : télécharge `ci_chantier`, garde les chantiers non terminés, classe l'effet : **« ferme »** (circulation interdite, mise en impasse, interruption, sens interdit), **« ralenti »** (circulation alternée, rétrécissement, neutralisation de voie, limitation de vitesse, circulation inversée), **« info »** (stationnement…) ; écrit `donnees/travaux.json` (≈ 120 Ko). Lancé chaque nuit (cron `47 4 * * *` dans `pages.yml`) et à chaque mise en ligne ; en cas d'échec, l'ancien fichier (release « donnees ») est repris.
- `moteur-itineraire.js` → `definirTravaux(liste)` : un chantier ponctuel ferme/ralentit le tronçon le plus proche (≤ 30 m) ; un chantier en ligne touche les tronçons qu'il longe (points tous les 8 m, ≤ 12 m, même direction ±35°). Rue fermée = infranchissable (sauf le tronçon de départ ou d'arrivée) ; ralentie = temps × 1,8 + 20 s. Mesuré : 208 chantiers actifs → 174 tronçons fermés, 239 ralentis, en 0,3 s sur ordinateur (≈ 1 s sur iPhone).
- `travaux.js` : chargement à l'ouverture (et au retour dans l'appli après 3 h), chantiers actifs du jour seulement, affichage sur la carte dès le zoom 12 (rouge = fermé, orange = ralenti, gris = info, framboise = signalé par l'utilisatrice), fiche au toucher, date de mise à jour (aperçu, panneau de signalement).
- **Signalement « rue bloquée »** : bouton framboise (carte et navigation), refusé au-dessus de 15 km/h ; un toucher bloque la rue la plus proche de la position ; panneau pour corriger la rue (toucher la carte), choisir la durée (ce soir / 1 semaine / 1 mois) ou annuler ; gardé dans `localStorage` (`gps-bordeaux-signalements`), supprimé automatiquement à la date de fin ou d'un toucher sur sa fiche. Pendant un trajet : recalcul immédiat.
- Consigne de guidage « Travaux : … » en entrant dans une rue ralentie ; alerte dans l'aperçu.
- Limite connue : la géométrie d'un chantier qui décrit plusieurs rues n'est souvent qu'un point ou une ligne : l'accroche peut tomber sur une rue voisine.
- `scripts/tester_travaux.js` : vérifie à chaque mise en ligne qu'aucun trajet ne passe par une rue fermée.

#### Recherche des sources (24/10/2026)
- **Bordeaux Métropole, jeu `ci_chantier`** (opendata.bordeaux-metropole.fr, API `api/explore/v2.1/catalog/datasets/ci_chantier/exports/json`) : chantiers **de Bordeaux et Mérignac uniquement** modifiant la circulation ; Licence Ouverte ; mis à jour chaque nuit (vers 3 h) ; 295 chantiers ce jour ; géométrie point (202) ou ligne (93) ; dates de début et de fin ; mesures dans `libelle` séparées par « ; », « / » ou « # » : Neutralisation de voie (90), Interdiction de stationnement (74), Circulation interdite (65), Limitation de vitesse (54), Rétrécissement de largeur de voie (43), Circulation alternée (43), Mesure libre circulation (39), Mise en impasse (24), Déviation, Circulation inversée, Interruption de circulation, Sens interdit… Jeux liés : `ci_acte_a`, `ci_emprise_a`, `ci_mesure_a`.
- **`ci_evenmt_p` « Événement impactant la circulation »** : 3 enregistrements, dernière mise à jour juillet 2026 : inutilisable en l'état.
- **`ci_borna_p` « Borne d'accès »** (419 bornes, Bordeaux) : utile plus tard pour affiner la règle des bornes.
- **TomTom (conditions lues sur docs.tomtom.com/legal/terms-and-conditions le 24/10/2026)** :
  - clause 2.1 : même en payant, la licence **exclut la « Navigation Functionality »** (guidage virage par virage selon la position) **et l'« Automotive Usage »**, sauf accord écrit séparé avec TomTom : c'est exactement l'usage de cette appli ;
  - clause 2.2 : l'offre gratuite est réservée à l'« Evaluation Use » (évaluation et tests internes) ;
  - clause 11.4 : mise en cache seulement selon les en-têtes de cache des réponses (pas une règle libre de 24 h) ;
  - offre gratuite du Traffic Incidents API : **2 500 requêtes par mois** (et non par jour).
  - Conclusion : TomTom n'est pas utilisé tant que l'utilisatrice n'a pas décidé (accord écrit de TomTom, ou autre source).

## Idées pour plus tard (ne pas faire maintenant)
- **Bouton « Étape » pendant la conduite** : il ouvre une barre de recherche ; tous les commerces correspondants sont affichés le long de l'itinéraire, chacun avec un nouvel itinéraire optionnel (détour proposé, sans perdre la destination finale).
- **Option pour choisir entre deux ou trois itinéraires** avant de partir.
- Poser des questions libres sur les lieux (« quelle pharmacie de garde ce soir ? », « c'est quoi ce musée ? »), avec un assistant intégré.
- Guidage vocal en français.
- Favoris (maison, crèche, adresses fréquentes).
- Enregistrer mes trajets et les revoir sur la carte.
- Éviter les feux et les bus TBM (les feux sont déjà comptés dans la durée depuis la version 5.4).
- Apprendre de mes temps de trajet réels.
