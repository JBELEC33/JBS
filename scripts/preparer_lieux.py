#!/usr/bin/env python3
# =====================================================================
# Prépare le fichier des lieux de la Gironde (commerces, administrations,
# musées, parkings…) pour la recherche sur le téléphone.
# Lancé automatiquement chaque semaine par GitHub Actions.
#
# 1. Télécharge les lieux depuis OpenStreetMap (service Overpass).
# 2. Garde ceux dont le type figure dans listes/categories.json.
# 3. Complète l'adresse manquante avec la Base Adresse Nationale
#    (on envoie les coordonnées des commerces, jamais celles de l'utilisatrice).
# 4. Écrit un fichier compact : donnees/lieux.json
#
# Utilise uniquement Python standard (aucune installation nécessaire).
# =====================================================================
import csv
import io
import json
import math
import os
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'donnees', 'lieux.json')
AGENT = 'GPS-Bordeaux/1.0 (appli personnelle, github.com/JBELEC33/JBS)'

# Serveurs Overpass, essayés dans l'ordre si l'un est indisponible
SERVEURS_OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
ADRESSE_INVERSE = [
    'https://data.geopf.fr/geocodage/reverse/csv',
    'https://api-adresse.data.gouv.fr/reverse/csv/',
]

# Ordre dans lequel on regarde les étiquettes OSM pour trouver le type d'un lieu
CLES = ['government', 'amenity', 'shop', 'healthcare', 'tourism', 'office',
        'leisure', 'craft', 'historic', 'railway', 'aeroway']


def journal(*args):
    print(*args, flush=True)


def telecharger(url, donnees=None, entetes=None, delai=900):
    req = urllib.request.Request(url, data=donnees, headers={'User-Agent': AGENT, **(entetes or {})})
    with urllib.request.urlopen(req, timeout=delai) as r:
        return r.read()


# ---------------------------------------------------------------------
# 1. OpenStreetMap
# ---------------------------------------------------------------------
def requete_overpass(categories):
    morceaux = []
    for cle in ['shop', 'amenity', 'tourism', 'office', 'leisure', 'healthcare', 'craft', 'historic']:
        morceaux.append(f'nwr(area.g)["name"]["{cle}"];')
    morceaux.append('nwr(area.g)["name"]["railway"~"^(station|halt|tram_stop)$"];')
    morceaux.append('nwr(area.g)["aeroway"="aerodrome"]["name"];')
    # Lieux utiles même sans nom (boulangeries, pharmacies, stations-service…)
    for code, info in categories.items():
        if info.get('sansNom'):
            cle, valeur = code.split('=', 1)
            morceaux.append(f'nwr(area.g)["{cle}"="{valeur}"];')
    # Parkings souterrains ou à étages, même sans nom
    morceaux.append('nwr(area.g)["amenity"="parking"]["parking"~"^(underground|multi-storey)$"];')
    return ('[out:json][timeout:900];area["ISO3166-2"="FR-33"]->.g;(' + ''.join(morceaux) + ');out center tags;')


def lieux_osm(categories):
    requete = requete_overpass(categories).encode()
    for essai in range(3):
        for serveur in SERVEURS_OVERPASS:
            try:
                journal('Téléchargement OpenStreetMap :', serveur)
                brut = telecharger(serveur, urllib.parse.urlencode({'data': requete}).encode())
                elements = json.loads(brut)['elements']
                journal(f'  {len(elements)} éléments reçus ({len(brut) // 1024} Ko)')
                if len(elements) < 5000:
                    raise ValueError('trop peu de lieux, réponse incomplète')
                return elements
            except Exception as e:
                journal('  échec :', e)
        time.sleep(60)
    sys.exit('Impossible de télécharger les données OpenStreetMap.')


# ---------------------------------------------------------------------
# 2. Tri et mise en forme
# ---------------------------------------------------------------------
def normaliser(texte):
    t = unicodedata.normalize('NFD', texte.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in t).split())


def trouver_categorie(tags, categories):
    for cle in CLES:
        valeur = tags.get(cle)
        if not valeur:
            continue
        if cle == 'government' and tags.get('office') != 'government':
            continue
        code = f'{cle}={valeur}'
        if code in categories:
            return code
    return None


def convertir(element, categories):
    tags = element.get('tags', {})
    code = trouver_categorie(tags, categories)
    if not code:
        return None
    nom = (tags.get('name') or '').strip()
    if not nom:
        parking_couvert = code == 'amenity=parking' and tags.get('parking') in ('underground', 'multi-storey')
        if not (categories[code].get('sansNom') or parking_couvert):
            return None
    if tags.get('access') in ('private', 'no'):
        return None
    if code == 'amenity=parking' and tags.get('parking') in ('underground', 'multi-storey') and not nom:
        nom = 'Parking souterrain' if tags['parking'] == 'underground' else 'Parking à étages'
    cp = tags.get('addr:postcode', '')
    if cp and not cp.startswith('33'):
        return None  # hors Gironde

    if 'lat' in element:
        lat, lon = element['lat'], element['lon']
    elif 'center' in element:
        lat, lon = element['center']['lat'], element['center']['lon']
    else:
        return None

    # Autres noms utiles pour la recherche (sigle, nom officiel, enseigne…)
    autres = []
    for cle in ('short_name', 'alt_name', 'official_name', 'brand', 'operator'):
        v = (tags.get(cle) or '').strip()
        if v and normaliser(v) not in normaliser(nom) and v not in autres:
            autres.append(v)

    rue = tags.get('addr:street') or tags.get('addr:place') or ''
    numero = tags.get('addr:housenumber', '')
    adresse = f'{numero} {rue}'.strip() if rue else ''

    return {
        'nom': nom, 'code': code, 'lon': round(lon, 5), 'lat': round(lat, 5),
        'adresse': adresse, 'commune': (tags.get('addr:city') or '').strip(),
        'horaires': (tags.get('opening_hours') or '').strip(),
        'autres': ' | '.join(autres)[:200],
        'nbTags': len(tags),
    }


def distance_m(a, b):
    dx = (a['lon'] - b['lon']) * 111320 * math.cos(math.radians(a['lat']))
    dy = (a['lat'] - b['lat']) * 110540
    return math.hypot(dx, dy)


def dedoublonner(lieux):
    # Même nom + même type à moins de 150 m = même lieu (ex. arrêt de tram dans les deux sens)
    grille, gardes = {}, []
    for l in sorted(lieux, key=lambda l: -l['nbTags']):
        if l['nom']:
            cle = (normaliser(l['nom']), l['code'])
            case = (round(l['lon'] * 200), round(l['lat'] * 200))
            doublon = False
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for autre in grille.get((cle, case[0] + dx, case[1] + dy), []):
                        if distance_m(l, autre) < 150:
                            doublon = True
            if doublon:
                continue
            grille.setdefault((cle, case[0], case[1]), []).append(l)
        gardes.append(l)
    return gardes


# ---------------------------------------------------------------------
# 3. Adresses manquantes : Base Adresse Nationale (recherche inverse en lot)
# ---------------------------------------------------------------------
def envoyer_csv(url, texte_csv):
    limite = '----gpsbordeaux' + str(int(time.time()))
    corps = (f'--{limite}\r\nContent-Disposition: form-data; name="data"; filename="lieux.csv"\r\n'
             f'Content-Type: text/csv\r\n\r\n{texte_csv}\r\n--{limite}--\r\n').encode()
    return telecharger(url, corps, {'Content-Type': f'multipart/form-data; boundary={limite}'}, delai=300).decode('utf-8')


def completer_adresses(lieux):
    a_completer = [l for l in lieux if not l['adresse'] or not l['commune']]
    journal(f'Adresses à compléter : {len(a_completer)}')
    hors_gironde = set()
    for debut in range(0, len(a_completer), 5000):
        paquet = a_completer[debut:debut + 5000]
        texte = 'id,lat,lon\n' + ''.join(f'{i},{l["lat"]},{l["lon"]}\n' for i, l in enumerate(paquet))
        reponse = None
        for url in ADRESSE_INVERSE:
            for essai in range(3):
                try:
                    reponse = envoyer_csv(url, texte)
                    break
                except Exception as e:
                    journal('  échec adresse inverse :', url, e)
                    time.sleep(10)
            if reponse:
                break
        if not reponse:
            journal('  adresses non complétées pour ce paquet')
            continue
        for ligne in csv.DictReader(io.StringIO(reponse)):
            try:
                l = paquet[int(ligne['id'])]
            except (KeyError, ValueError, IndexError):
                continue
            cp = ligne.get('result_postcode') or ''
            if cp and not cp.startswith('33'):
                hors_gironde.add(id(l))
                continue
            try:
                ecart = float(ligne.get('result_distance') or 99999)
            except ValueError:
                ecart = 99999
            if not l['commune'] and ligne.get('result_city'):
                l['commune'] = ligne['result_city']
            # Rue la plus proche, sans numéro (le numéro le plus proche peut être celui du voisin)
            if not l['adresse'] and ligne.get('result_street') and ecart < 150:
                l['adresse'] = ligne['result_street']
        journal(f'  paquet {debut // 5000 + 1} traité')
    return [l for l in lieux if id(l) not in hors_gironde]


# ---------------------------------------------------------------------
# 4. Fichier compact
# ---------------------------------------------------------------------
def ecrire(lieux):
    codes = sorted({l['code'] for l in lieux})
    communes = sorted({l['commune'] for l in lieux if l['commune']})
    index_code = {c: i for i, c in enumerate(codes)}
    index_commune = {c: i for i, c in enumerate(communes)}
    lignes = []
    for l in sorted(lieux, key=lambda l: (l['commune'], l['nom'])):
        # [nom, type, longitude, latitude, adresse, commune, horaires, autres noms]
        ligne = [l['nom'], index_code[l['code']], l['lon'], l['lat'], l['adresse'],
                 index_commune.get(l['commune'], -1), l['horaires'], l['autres']]
        while ligne and ligne[-1] in ('', -1):
            ligne.pop()  # on enlève les champs vides de la fin pour gagner de la place
        lignes.append(ligne)
    contenu = {
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': '© les contributeurs OpenStreetMap (ODbL) ; adresses : Base Adresse Nationale',
        'colonnes': ['nom', 'type', 'lon', 'lat', 'adresse', 'commune', 'horaires', 'autres'],
        'types': codes,
        'communes': communes,
        'lieux': lignes,
    }
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, 'w', encoding='utf-8') as f:
        json.dump(contenu, f, ensure_ascii=False, separators=(',', ':'))
    journal(f'Fichier écrit : {SORTIE} — {len(lignes)} lieux, {os.path.getsize(SORTIE) // 1024} Ko')


def main():
    with open(os.path.join(RACINE, 'listes', 'categories.json'), encoding='utf-8') as f:
        categories = json.load(f)
    elements = lieux_osm(categories)
    lieux = [l for l in (convertir(e, categories) for e in elements) if l]
    journal(f'Lieux retenus : {len(lieux)}')
    lieux = dedoublonner(lieux)
    journal(f'Après suppression des doublons : {len(lieux)}')
    lieux = completer_adresses(lieux)
    ecrire(lieux)
    sans_adresse = sum(1 for l in lieux if not l['adresse'])
    journal(f'Sans rue connue : {sans_adresse} ; avec horaires : {sum(1 for l in lieux if l["horaires"])}')


if __name__ == '__main__':
    main()
