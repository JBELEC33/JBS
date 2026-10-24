#!/usr/bin/env python3
# =====================================================================
# Prépare le fichier des rues (réseau routier) pour le calcul
# d'itinéraire sur le téléphone. Lancé chaque semaine par GitHub Actions.
#
# 1. Télécharge les rues depuis OpenStreetMap (service Overpass) :
#    voies, sens uniques, vitesses, zones piétonnes, bornes, barrières,
#    interdictions de tourner.
# 2. Applique les règles de l'appli (voir CLAUDE.md, section « Règles ») :
#    - voies bus/tram et rues interdites : écartées ;
#    - zones piétonnes : autorisées mais signalées ;
#    - bornes escamotables de Bordeaux centre : franchissables (badge) ;
#    - bornes fixes, barrières fermées, bornes hors du centre : bloquantes.
# 3. Écrit un fichier binaire compact : donnees/rues.bin
#    (un en-tête JSON décrivant les tableaux, puis les tableaux de nombres).
#
# Utilise uniquement Python standard.
# =====================================================================
import json
import math
import os
import struct
import sys
import time
import urllib.parse
import urllib.request
from array import array
from datetime import datetime, timezone

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'donnees', 'rues.bin')
AGENT = 'GPS-Bordeaux/1.0 (appli personnelle, github.com/JBELEC33/JBS)'
SERVEURS_OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

# Zone couverte : l'agglomération bordelaise au sens large (rectangle sud, ouest, nord, est).
# Toute la Gironde ferait environ 10 Mo au lieu de 4 Mo (voir CLAUDE.md).
ZONE_COUVERTE = (44.70, -0.85, 45.05, -0.35)
ZONE = ''
FILTRE_ZONE = '(%s,%s,%s,%s)' % ZONE_COUVERTE

TYPES_VOIES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
               'residential', 'living_street', 'service', 'motorway_link', 'trunk_link',
               'primary_link', 'secondary_link', 'tertiary_link', 'pedestrian']
SERVICES_EXCLUS = {'driveway', 'parking_aisle', 'emergency_access', 'drive-through'}

# Vitesse par défaut (km/h) quand la limitation n'est pas connue
VITESSE_DEFAUT = {
    'motorway': 110, 'motorway_link': 70, 'trunk': 90, 'trunk_link': 60,
    'primary': 50, 'primary_link': 40, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 50, 'tertiary_link': 40, 'unclassified': 40, 'residential': 30,
    'living_street': 20, 'service': 20, 'pedestrian': 10,
}
# Vitesse réellement pratiquée = limitation × ce coefficient (feux, trafic, virages)
COEFF_VITESSE = {'motorway': 0.9, 'motorway_link': 0.8, 'trunk': 0.85, 'trunk_link': 0.75}
COEFF_VILLE = 0.7
VITESSE_PIETON = 8  # km/h : « rouler au pas »

# Drapeaux des tronçons
PIETON, ACCES_LIMITE, ROND_POINT = 1, 2, 4
# Drapeaux des points
BLOQUE, BORNE_BADGE = 1, 2


def journal(*args):
    print(*args, flush=True)


def telecharger_osm():
    h = '|'.join(TYPES_VOIES)
    requete = (f'[out:json][timeout:540][maxsize:4000000000];{ZONE}'
               f'way{FILTRE_ZONE}["highway"~"^({h})$"]->.voies;'
               'node(w.voies)->.points;'
               'rel(bw.voies)["type"="restriction"]->.interdictions;'
               '.points out;.voies out;.interdictions out;')
    for essai in range(3):
        for serveur in SERVEURS_OVERPASS:
            try:
                journal('Téléchargement OpenStreetMap :', serveur)
                req = urllib.request.Request(serveur, data=urllib.parse.urlencode({'data': requete}).encode(),
                                             headers={'User-Agent': AGENT})
                with urllib.request.urlopen(req, timeout=600) as r:  # 10 min au plus par serveur
                    brut = r.read()
                elements = json.loads(brut)['elements']
                journal(f'  {len(elements)} éléments reçus ({len(brut) // 1048576} Mo)')
                if len(elements) < 50000:
                    raise ValueError('réponse incomplète')
                return elements
            except Exception as e:
                journal('  échec :', e)
        time.sleep(60)
    sys.exit('Impossible de télécharger les rues depuis OpenStreetMap.')


# ---------------------------------------------------------------------
# Règles d'accès
# ---------------------------------------------------------------------
def valeur_acces(tags):
    # La règle la plus précise l'emporte : voiture, puis véhicule motorisé, puis véhicule, puis général
    for cle in ('motorcar', 'motor_vehicle', 'vehicle', 'access'):
        if cle in tags:
            return tags[cle].split(';')[0].strip()
    return None


def dans_zone(lon, lat, zone):
    return zone[0] <= lon <= zone[2] and zone[1] <= lat <= zone[3]


def regle_voie(tags, centre_badge):
    """Renvoie None si la voie est interdite, sinon les drapeaux (piéton, accès limité…)."""
    hw = tags.get('highway')
    if hw == 'service' and tags.get('service') in SERVICES_EXCLUS:
        return None
    if tags.get('area') == 'yes':
        return None  # places dessinées comme des surfaces : on ne roule pas « autour »
    if hw == 'pedestrian':
        return PIETON  # exception : l'utilisatrice peut traverser les zones piétonnes
    acces = valeur_acces(tags)
    bus = any(tags.get(k) in ('yes', 'designated') for k in ('psv', 'bus', 'tram'))
    if acces in (None, 'yes', 'designated', 'permissive', 'destination', 'customers', 'discouraged', 'unknown'):
        return 0
    if acces in ('delivery', 'permit'):
        return ACCES_LIMITE  # accès réservé aux véhicules autorisés : permis, signalé
    if acces == 'no' and not bus and centre_badge and hw in ('residential', 'living_street', 'unclassified', 'service', 'tertiary'):
        return ACCES_LIMITE  # rue à accès réglementé de Bordeaux centre (badge)
    return None  # no, private, psv, bus, agricultural… : interdit (dont voies bus/tram)


def sens_unique(tags):
    """+1 : sens du dessin seulement ; -1 : sens inverse seulement ; 0 : double sens."""
    v = tags.get('oneway:motorcar') or tags.get('oneway:motor_vehicle') or tags.get('oneway')
    if v in ('yes', '1', 'true'):
        return 1
    if v in ('-1', 'reverse'):
        return -1
    if v == 'no':
        return 0
    if tags.get('junction') in ('roundabout', 'circular') or tags.get('highway') in ('motorway', 'motorway_link'):
        return 1
    return 0


def limitation(tags):
    """Limitation de vitesse en km/h, ou 0 si inconnue."""
    v = (tags.get('maxspeed') or '').strip().lower()
    if not v:
        return 0
    connues = {'fr:urban': 50, 'fr:rural': 80, 'fr:zone30': 30, 'fr:zone20': 20, 'fr:motorway': 130,
               'fr:walk': 6, 'walk': 6, 'fr:living_street': 20}
    if v in connues:
        return connues[v]
    try:
        n = float(v.split()[0].replace(',', '.'))
        if 'mph' in v:
            n *= 1.609
        return int(round(n)) if 0 < n < 200 else 0
    except ValueError:
        return 0


def regle_barriere(tags, centre_badge):
    """0 : passage libre ; BORNE_BADGE : borne franchissable avec le badge ; BLOQUE : infranchissable."""
    b = tags.get('barrier')
    if not b:
        return 0
    acces = valeur_acces(tags)
    if b == 'bollard':
        if tags.get('bollard') in ('fixed', 'flexible'):
            return BLOQUE
        if acces in ('yes', 'designated', 'permissive'):
            return 0
        # Borne escamotable (ou de type inconnu) : le badge l'ouvre seulement à Bordeaux centre
        return BORNE_BADGE if centre_badge else BLOQUE
    if b in ('gate', 'lift_gate', 'swing_gate', 'sliding_gate', 'sliding_beam', 'full-height_turnstile'):
        return BLOQUE if acces in ('no', 'private') else 0
    if b in ('kerb', 'cattle_grid', 'toll_booth', 'border_control', 'height_restrictor', 'entrance', 'cycle_barrier_open'):
        return 0
    # Blocs, chaînes, clôtures, barrières de type inconnu… : infranchissables sauf accès autorisé
    return 0 if acces in ('yes', 'designated') else BLOQUE


def distance_m(lon1, lat1, lon2, lat2):
    r = math.pi / 180
    x = (lon2 - lon1) * r * math.cos((lat1 + lat2) / 2 * r)
    y = (lat2 - lat1) * r
    return math.hypot(x, y) * 6371000


def composante_principale(nb_noeuds, troncons, noeud_drapeaux):
    """Plus grand ensemble de points tous reliés entre eux dans les deux sens (algorithme de Kosaraju).
    Les points bloqués (barrière, borne fixe) ne laissent pas passer."""
    suivants = [[] for _ in range(nb_noeuds)]
    precedents = [[] for _ in range(nb_noeuds)]
    for (a, b, _l, _v, _d, _vi, _li, sens, _f) in troncons:
        if noeud_drapeaux[a] & BLOQUE or noeud_drapeaux[b] & BLOQUE:
            continue
        if sens >= 0:
            suivants[a].append(b); precedents[b].append(a)
        if sens <= 0:
            suivants[b].append(a); precedents[a].append(b)
    # 1er passage : ordre de fin de visite (parcours en profondeur sans récursion)
    vu = bytearray(nb_noeuds)
    ordre = []
    for depart in range(nb_noeuds):
        if vu[depart]:
            continue
        vu[depart] = 1
        pile = [(depart, 0)]
        while pile:
            u, k = pile[-1]
            if k < len(suivants[u]):
                pile[-1] = (u, k + 1)
                v = suivants[u][k]
                if not vu[v]:
                    vu[v] = 1
                    pile.append((v, 0))
            else:
                pile.pop()
                ordre.append(u)
    # 2e passage sur le graphe inversé : chaque visite donne un ensemble fortement relié
    groupe = [-1] * nb_noeuds
    meilleur, taille_max, n = -1, 0, 0
    for depart in reversed(ordre):
        if groupe[depart] >= 0:
            continue
        groupe[depart] = n
        pile, taille = [depart], 0
        while pile:
            u = pile.pop()
            taille += 1
            for v in precedents[u]:
                if groupe[v] < 0:
                    groupe[v] = n
                    pile.append(v)
        if taille > taille_max:
            meilleur, taille_max = n, taille
        n += 1
    return {i for i in range(nb_noeuds) if groupe[i] == meilleur}


# ---------------------------------------------------------------------
# Construction du réseau
# ---------------------------------------------------------------------
def construire(elements, zone_badge):
    noeuds_osm = {}  # id OSM → (lon, lat, tags)
    voies_osm = []
    relations = []
    for e in elements:
        if e['type'] == 'node':
            noeuds_osm[e['id']] = (e['lon'], e['lat'], e.get('tags'))
        elif e['type'] == 'way':
            voies_osm.append(e)
        elif e['type'] == 'relation':
            relations.append(e)
    journal(f'{len(noeuds_osm)} points, {len(voies_osm)} voies, {len(relations)} interdictions de tourner')

    # 1) Voies retenues
    voies = []  # (id OSM, liste de points, drapeaux, sens, vitesse km/h, limitation, nom, type)
    for w in voies_osm:
        tags = w.get('tags', {})
        refs = [r for r in w['nodes'] if r in noeuds_osm]
        if len(refs) < 2:
            continue
        lon, lat, _ = noeuds_osm[refs[len(refs) // 2]]
        drapeaux = regle_voie(tags, dans_zone(lon, lat, zone_badge))
        if drapeaux is None:
            continue
        if tags.get('junction') in ('roundabout', 'circular'):
            drapeaux |= ROND_POINT
        hw = tags['highway']
        lim = limitation(tags)
        if drapeaux & PIETON:
            vitesse = VITESSE_PIETON
        else:
            base = lim or VITESSE_DEFAUT.get(hw, 30)
            vitesse = max(5, base * COEFF_VITESSE.get(hw, COEFF_VILLE))
        nom = tags.get('name') or ''
        ref = tags.get('ref') or ''
        if ref and ref not in nom:
            nom = f'{nom} ({ref})' if nom else ref
        voies.append((w['id'], refs, drapeaux, sens_unique(tags), vitesse, lim, nom, hw))
    journal(f'Voies retenues : {len(voies)}')

    # 2) Points du réseau : extrémités, croisements, barrières
    usage = {}
    for v in voies:
        for r in v[1]:
            usage[r] = usage.get(r, 0) + 1
    points_reseau = set()
    for v in voies:
        points_reseau.add(v[1][0])
        points_reseau.add(v[1][-1])
    for r, n in usage.items():
        if n >= 2 or (noeuds_osm[r][2] and 'barrier' in noeuds_osm[r][2]):
            points_reseau.add(r)
    numero = {r: i for i, r in enumerate(sorted(points_reseau))}
    nb_noeuds = len(numero)
    noeud_lon = array('i', [0]) * nb_noeuds
    noeud_lat = array('i', [0]) * nb_noeuds
    noeud_drapeaux = array('B', [0]) * nb_noeuds
    nb_badge = nb_bloque = 0
    for r, i in numero.items():
        lon, lat, tags = noeuds_osm[r]
        noeud_lon[i] = round(lon * 1e6)
        noeud_lat[i] = round(lat * 1e6)
        if tags:
            b = regle_barriere(tags, dans_zone(lon, lat, zone_badge))
            noeud_drapeaux[i] = b
            nb_badge += b == BORNE_BADGE
            nb_bloque += b == BLOQUE
    journal(f'Points du réseau : {nb_noeuds} (bornes badge : {nb_badge}, passages bloqués : {nb_bloque})')

    # 3) Tronçons entre deux points du réseau, avec leur forme (points intermédiaires)
    noms = {'': 0}
    voie_nom = array('I')
    voie_index = {}  # id OSM → numéro de voie
    troncons = []    # (a, b, longueur, voie, drapeaux, vitesse, limitation, sens, forme)
    for (id_osm, refs, drapeaux, sens, vitesse, lim, nom, hw) in voies:
        iv = len(voie_nom)
        voie_index[id_osm] = iv
        if nom not in noms:
            noms[nom] = len(noms)
        voie_nom.append(noms[nom])
        debut = 0
        for k in range(1, len(refs)):
            if refs[k] in numero or k == len(refs) - 1:
                morceau = refs[debut:k + 1]
                longueur = sum(distance_m(noeuds_osm[morceau[j]][0], noeuds_osm[morceau[j]][1],
                                          noeuds_osm[morceau[j + 1]][0], noeuds_osm[morceau[j + 1]][1])
                               for j in range(len(morceau) - 1))
                forme = [(round(noeuds_osm[r][0] * 1e6), round(noeuds_osm[r][1] * 1e6)) for r in morceau[1:-1]]
                troncons.append((numero[morceau[0]], numero[morceau[-1]], longueur, iv, drapeaux, vitesse, lim, sens, forme))
                debut = k

    # 3 bis) On ne garde que le grand réseau où l'on peut aller et revenir partout
    # (évite d'accrocher un départ à un bout de rue isolé, fermé par des barrières)
    garde = composante_principale(nb_noeuds, troncons, noeud_drapeaux)
    avant = len(troncons)
    troncons = [t for t in troncons if t[0] in garde and t[1] in garde]
    journal(f'Réseau principal : {len(garde)} points sur {nb_noeuds}, {len(troncons)} tronçons sur {avant}')
    nouveau = {}
    for ancien in sorted(garde):
        nouveau[ancien] = len(nouveau)
    noeud_lon = array('i', [noeud_lon[i] for i in sorted(garde)])
    noeud_lat = array('i', [noeud_lat[i] for i in sorted(garde)])
    noeud_drapeaux = array('B', [noeud_drapeaux[i] for i in sorted(garde)])
    nb_noeuds = len(nouveau)
    ancien_numero = numero
    numero = {r: nouveau[i] for r, i in ancien_numero.items() if i in nouveau}

    seg_a, seg_b = array('I'), array('I')
    seg_longueur = array('H')
    seg_voie = array('I')
    seg_drapeaux = array('B')
    seg_vitesse = array('B')
    seg_limitation = array('B')
    seg_sens = []
    seg_debut_forme = array('I')
    forme_lon, forme_lat = array('i'), array('i')
    for (a, b, longueur, iv, drapeaux, vitesse, lim, sens, forme) in troncons:
        seg_a.append(nouveau[a])
        seg_b.append(nouveau[b])
        seg_longueur.append(min(65535, max(1, round(longueur))))
        seg_voie.append(iv)
        seg_drapeaux.append(drapeaux)
        seg_vitesse.append(min(255, max(1, round(vitesse))))
        seg_limitation.append(min(255, lim))
        seg_sens.append(sens)
        seg_debut_forme.append(len(forme_lon))
        for (x, y) in forme:
            forme_lon.append(x)
            forme_lat.append(y)
    seg_debut_forme.append(len(forme_lon))
    nb_seg = len(seg_a)
    journal(f'Tronçons : {nb_seg}, points de forme : {len(forme_lon)}, noms de rues : {len(noms)}')

    # 4) Arêtes orientées (un tronçon à double sens = deux arêtes), rangées par point de départ
    aretes = []  # (départ, arrivée, tronçon × 2 + sens inverse)
    for s in range(nb_seg):
        if seg_sens[s] >= 0:
            aretes.append((seg_a[s], seg_b[s], s * 2))
        if seg_sens[s] <= 0:
            aretes.append((seg_b[s], seg_a[s], s * 2 + 1))
    aretes.sort()
    debut_aretes = array('I', [0]) * (nb_noeuds + 1)
    arete_cible = array('I')
    arete_troncon = array('I')
    for (u, v, t) in aretes:
        debut_aretes[u + 1] += 1
        arete_cible.append(v)
        arete_troncon.append(t)
    for i in range(nb_noeuds):
        debut_aretes[i + 1] += debut_aretes[i]
    journal(f'Arêtes orientées : {len(aretes)}')

    # 5) Interdictions de tourner (« de la voie A, par le point P, vers la voie B »)
    inter_de, inter_par, inter_vers = array('I'), array('I'), array('I')
    inter_type = array('B')  # 0 : interdit de tourner ; 1 : seule direction permise
    for rel in relations:
        tags = rel.get('tags', {})
        genre = tags.get('restriction:motorcar') or tags.get('restriction:motor_vehicle') or tags.get('restriction')
        if not genre or 'motorcar' in (tags.get('except') or ''):
            continue
        de = [m['ref'] for m in rel['members'] if m['role'] == 'from' and m['type'] == 'way']
        par = [m['ref'] for m in rel['members'] if m['role'] == 'via' and m['type'] == 'node']
        vers = [m['ref'] for m in rel['members'] if m['role'] == 'to' and m['type'] == 'way']
        if len(de) != 1 or len(par) != 1 or len(vers) != 1:
            continue  # cas rares (par une voie) : non gérés
        if de[0] not in voie_index or vers[0] not in voie_index or par[0] not in numero:
            continue
        inter_de.append(voie_index[de[0]])
        inter_par.append(numero[par[0]])
        inter_vers.append(voie_index[vers[0]])
        inter_type.append(1 if genre.startswith('only_') else 0)
    journal(f'Interdictions de tourner retenues : {len(inter_de)}')

    tableaux = {
        'noeudLon': ('Int32', noeud_lon), 'noeudLat': ('Int32', noeud_lat), 'noeudDrapeaux': ('Uint8', noeud_drapeaux),
        'debutAretes': ('Uint32', debut_aretes), 'areteCible': ('Uint32', arete_cible), 'areteTroncon': ('Uint32', arete_troncon),
        'tronconA': ('Uint32', seg_a), 'tronconB': ('Uint32', seg_b), 'tronconLongueur': ('Uint16', seg_longueur),
        'tronconVoie': ('Uint32', seg_voie), 'tronconDrapeaux': ('Uint8', seg_drapeaux),
        'tronconVitesse': ('Uint8', seg_vitesse), 'tronconLimitation': ('Uint8', seg_limitation),
        'tronconDebutForme': ('Uint32', seg_debut_forme), 'formeLon': ('Int32', forme_lon), 'formeLat': ('Int32', forme_lat),
        'voieNom': ('Uint32', voie_nom),
        'interDe': ('Uint32', inter_de), 'interPar': ('Uint32', inter_par), 'interVers': ('Uint32', inter_vers), 'interType': ('Uint8', inter_type),
    }
    liste_noms = [''] * len(noms)
    for nom, i in noms.items():
        liste_noms[i] = nom
    return tableaux, liste_noms


# ---------------------------------------------------------------------
# Écriture du fichier binaire
# ---------------------------------------------------------------------
def ecrire(tableaux, noms, zone_badge):
    if sys.byteorder != 'little':
        sys.exit('Ce script doit tourner sur une machine « little-endian ».')
    # On calcule la place de chaque tableau (chacun commence sur un multiple de 4 octets)
    description, position = {}, 0
    for nom, (genre, valeurs) in tableaux.items():
        taille = len(valeurs) * valeurs.itemsize
        description[nom] = [genre, position, len(valeurs)]
        position += (taille + 3) // 4 * 4
    entete = json.dumps({
        'version': 1,
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': '© les contributeurs OpenStreetMap (ODbL)',
        'zoneBadge': zone_badge,
        'zoneCouverte': [ZONE_COUVERTE[1], ZONE_COUVERTE[0], ZONE_COUVERTE[3], ZONE_COUVERTE[2]],
        'tableaux': description,
        'noms': noms,
    }, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    entete += b' ' * ((4 - len(entete) % 4) % 4)
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, 'wb') as f:
        f.write(b'GPSR')
        f.write(struct.pack('<I', len(entete)))
        f.write(entete)
        for nom, (genre, valeurs) in tableaux.items():
            octets = valeurs.tobytes()
            f.write(octets)
            f.write(b'\0' * ((4 - len(octets) % 4) % 4))
    journal(f'Fichier écrit : {SORTIE} ({os.path.getsize(SORTIE) / 1048576:.1f} Mo)')


def main():
    with open(os.path.join(RACINE, 'listes', 'reglages-itineraire.json'), encoding='utf-8') as f:
        zone_badge = json.load(f)['zone_badge']
    elements = telecharger_osm()
    tableaux, noms = construire(elements, zone_badge)
    del elements
    ecrire(tableaux, noms, zone_badge)


if __name__ == '__main__':
    main()
