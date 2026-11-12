#!/usr/bin/env python3
"""Découpe index.html (campagne) et bataille.html du dépôt en un fichier par bloc.

Un bloc commence à chaque ligne de repère « /* ===== NOM ===== */ » (les repères « FIN … »
restent dans le bloc qu'ils ferment). Chaque page devient src/<page>/NNN-nom.part, et
src/<page>/ordre.txt garde l'ordre exact. assembler.py refait les pages à l'octet près.

Usage : python3 outils/decouper.py            (depuis n'importe où dans le dépôt)
        python3 outils/decouper.py <dépôt>
"""
import os, re, sys

PAGES = {'index.html': 'campagne', 'bataille.html': 'bataille'}
REPERE = re.compile(r'\s*/\* ?=+ ?(?!\s*FIN\b)([^*=\n]{3,80})')
ACCENTS = str.maketrans('àâäáéèêëíîïóôöúùûüçœÀÂÉÈÊÎÔÙÛÇ', 'aaaaeeeeiiiooouuuucoAAEEEIOUUC')


def nom_de(ligne):
    m = REPERE.match(ligne)
    nom = m.group(1).strip().translate(ACCENTS).lower() if m else 'debut'
    return re.sub(r'[^a-z0-9]+', '-', nom)[:40].strip('-') or 'bloc'


def decouper(depot):
    src = os.path.join(depot, 'src')
    for page, dossier in PAGES.items():
        texte = open(os.path.join(depot, page), encoding='utf-8', newline='').read()
        lignes = texte.splitlines(True)
        coupes = [0] + [i for i, l in enumerate(lignes) if i and REPERE.match(l)] + [len(lignes)]
        d = os.path.join(src, dossier)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.endswith('.part'):
                os.remove(os.path.join(d, f))
        noms = []
        for k in range(len(coupes) - 1):
            nom = f'{k:03d}-{nom_de(lignes[coupes[k]]) if k else "debut"}.part'
            noms.append(nom)
            with open(os.path.join(d, nom), 'w', encoding='utf-8', newline='') as f:
                f.write(''.join(lignes[coupes[k]:coupes[k + 1]]))
        with open(os.path.join(d, 'ordre.txt'), 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(noms) + '\n')
        print(f'{page} → src/{dossier}/ : {len(noms)} blocs')


if __name__ == '__main__':
    decouper(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
