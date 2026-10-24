#!/usr/bin/env python3
# =====================================================================
# Prépare le fichier des travaux (chantiers en cours ou à venir) pour l'appli.
# Lancé chaque nuit par GitHub Actions, et à chaque mise en ligne.
#
# Source : Bordeaux Métropole, jeu « Chantiers sur Bordeaux et Mérignac
# modifiant les conditions de circulation et de stationnement » (ci_chantier),
# Licence Ouverte. Couvre seulement Bordeaux et Mérignac.
#
# Pour chaque chantier, on garde : l'endroit (point ou ligne), les dates,
# les mesures de circulation et leur effet sur l'itinéraire :
#   « ferme »   : rue fermée ou mise en impasse → infranchissable ;
#   « ralenti » : voie rétrécie, circulation alternée… → plus lent ;
#   « info »    : seulement affiché (stationnement interdit…).
# Écrit donnees/travaux.json. Python standard uniquement.
# =====================================================================
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone, date

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'donnees', 'travaux.json')
AGENT = 'GPS-Bordeaux/1.0 (appli personnelle, github.com/JBELEC33/JBS)'
API = 'https://opendata.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/ci_chantier'

# Mesures qui rendent la rue infranchissable
FERME = ['circulation interdite', 'mise en impasse', 'interruption de circulation', 'sens interdit', 'route barree', 'fermeture']
# Mesures qui ralentissent sans fermer
RALENTI = ['circulation alternee', 'retrecissement', 'neutralisation de voie', 'limitation de vitesse',
           'circulation inversee', 'chaussee retrecie', 'alternat']


def journal(*args):
    print(*args, flush=True)


def lire(url):
    for essai in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': AGENT})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:
            journal('  échec :', e)
            time.sleep(15 * (essai + 1))
    sys.exit('Impossible de récupérer les chantiers de Bordeaux Métropole.')


def sans_accents(texte):
    import unicodedata
    t = unicodedata.normalize('NFD', texte.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


def effet(mesures):
    t = ' | '.join(sans_accents(m) for m in mesures)
    if any(m in t for m in FERME):
        return 'ferme'
    if any(m in t for m in RALENTI):
        return 'ralenti'
    return 'info'


def parties(geometrie):
    """Liste de morceaux, chacun étant une liste de points [lon, lat] (un seul point pour un chantier ponctuel)."""
    if not geometrie:
        return []
    g = geometrie.get('geometry', geometrie)
    t, c = g.get('type'), g.get('coordinates')
    arrondi = lambda p: [round(p[0], 6), round(p[1], 6)]
    if t == 'Point':
        return [[arrondi(c)]]
    if t == 'MultiPoint':
        return [[arrondi(p)] for p in c]
    if t == 'LineString':
        return [[arrondi(p) for p in c]]
    if t == 'MultiLineString':
        return [[arrondi(p) for p in ligne] for ligne in c]
    return []


def main():
    journal('Téléchargement des chantiers de Bordeaux Métropole…')
    infos = lire(API)
    mise_a_jour_source = infos.get('metas', {}).get('default', {}).get('data_processed') or ''
    lignes = lire(API + '/exports/json')
    journal(f'  {len(lignes)} chantiers reçus (données de la source : {mise_a_jour_source})')

    aujourd_hui = date.today().isoformat()
    chantiers = []
    for r in lignes:
        fin = (r.get('date_fin') or '')[:10]
        if fin and fin < aujourd_hui:
            continue  # chantier terminé
        mesures = []
        for m in re.split(r'[;/#]', r.get('libelle') or ''):
            m = re.sub(r'^MERIGNAC\s*-\s*', '', m.strip())
            if m and m not in mesures:
                mesures.append(m)
        geo = parties(r.get('geo_shape'))
        if not geo:
            continue
        chantiers.append({
            'id': str(r.get('ident') or r.get('gid')),
            'effet': effet(mesures),
            'mesures': mesures,
            'lieu': (r.get('localisation_emprise') or r.get('localisation') or '').strip(),
            'nature': ' – '.join(x for x in [r.get('alias_nature_n1'), r.get('alias_nature_n2')] if x),
            'debut': (r.get('date_debut') or '')[:10],
            'fin': fin,
            'geo': geo,
        })

    compte = {e: sum(1 for c in chantiers if c['effet'] == e) for e in ('ferme', 'ralenti', 'info')}
    journal(f'Chantiers gardés : {len(chantiers)} (rue fermée : {compte["ferme"]}, ralentissement : {compte["ralenti"]}, information : {compte["info"]})')
    if not chantiers:
        sys.exit('Aucun chantier : réponse suspecte, fichier non écrit.')

    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, 'w', encoding='utf-8') as f:
        json.dump({
            'date': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'miseAJourSource': mise_a_jour_source,
            'source': 'Bordeaux Métropole – chantiers de Bordeaux et Mérignac (Licence Ouverte)',
            'chantiers': chantiers,
        }, f, ensure_ascii=False, separators=(',', ':'))
    journal(f'Fichier écrit : {SORTIE} ({os.path.getsize(SORTIE) // 1024} Ko)')


if __name__ == '__main__':
    main()
