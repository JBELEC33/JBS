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
5. Guider pendant le trajet : prochaine instruction affichée en gros à l'écran (« dans 200 m, tournez à droite »). Pas de voix pour l'instant.
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
- **Bandeau en haut** : prochaine manœuvre avec une grosse flèche et la distance, et la manœuvre suivante en plus petit dessous.
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
- **Étape 3 faite** (fichier des rues + itinéraire calculé sur le téléphone + aperçu + mode simulation) : à valider sur l'iPhone.
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
- `scripts/preparer_rues.py` (Python standard) : télécharge les voies (Overpass), applique les règles, ne garde que le **réseau principal relié dans les deux sens** (algorithme de Kosaraju : écarte les bouts de rue isolés derrière des barrières), écrit `donnees/rues.bin` (format : « GPSR », longueur de l'en-tête, en-tête JSON décrivant les tableaux + noms de rues, puis tableaux binaires little-endian alignés sur 4 octets).
- Règles appliquées à la préparation :
  - exclues : `highway=busway`, voies `access/motor_vehicle/motorcar = no/private/psv/bus…`, `service=driveway/parking_aisle/emergency_access/drive-through`, surfaces (`area=yes`) ;
  - `highway=pedestrian` : autorisée, signalée, 8 km/h ; `motor_vehicle=delivery/permit` : autorisée, signalée « accès réservé » ;
  - **dans la zone badge** (`listes/reglages-itineraire.json`, rectangle de Bordeaux centre) : rues `access=no` sans bus = accès réglementé, autorisées et signalées ; bornes non fixes (`bollard=rising`, inconnu…) franchissables et signalées « borne : badge » ;
  - hors zone badge : toutes les bornes bloquent ; partout : `bollard=fixed`, blocs, chaînes, barrières/portails fermés (`access=no/private`) bloquent ;
  - sens uniques (`oneway`, ronds-points, autoroutes), interdictions de tourner (relations `restriction` par un point, `no_*` et `only_*`).
  - vitesse : limitation OSM (`maxspeed`) sinon valeur par défaut selon le type de voie, × 0,7 en ville (0,85-0,9 sur rocade/autoroute) pour tenir compte des feux et du trafic. À ajuster si les durées affichées sont trop optimistes.
- `moteur-itineraire.js` : A* sur les arêtes (permet les interdictions de tourner), petites pénalités de virage (droite 5 s, gauche 10 s, serré 18 s, borne 15 s), demi-tour seulement en cul-de-sac ; accroche du départ et de l'arrivée à la rue la plus proche (grille de cases de ~300 m). Calcul mesuré : 5 à 70 ms sur ordinateur pour des trajets de 1 à 25 km.
- `itineraire.js` : chargement du fichier des rues 4 s après l'ouverture, aperçu (durée, distance, heure d'arrivée, alertes zone piétonne / accès réservé / bornes), trajet dessiné (bleu, pointillés orange en zone piétonne, étiquettes « borne : badge » et « zone piétonne : rouler au pas »), « Démarrer » (suivi du point, barre du bas, arrêt avec confirmation), **mode simulation** (×1 à ×8).
- Tests : `scripts/tester_itineraire.js` (trajets réels, temps de calcul, détail rue par rue) lancé à chaque mise en ligne.

## Idées pour plus tard (ne pas faire maintenant)
- **Bouton « Étape » pendant la conduite** : il ouvre une barre de recherche ; tous les commerces correspondants sont affichés le long de l'itinéraire, chacun avec un nouvel itinéraire optionnel (détour proposé, sans perdre la destination finale).
- **Option pour choisir entre deux ou trois itinéraires** avant de partir.
- Poser des questions libres sur les lieux (« quelle pharmacie de garde ce soir ? », « c'est quoi ce musée ? »), avec un assistant intégré.
- Guidage vocal en français.
- Favoris (maison, crèche, adresses fréquentes).
- Enregistrer mes trajets et les revoir sur la carte.
- Éviter les feux et les bus TBM.
- Apprendre de mes temps de trajet réels.
