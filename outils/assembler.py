#!/usr/bin/env python3
"""Refait index.html et bataille.html à partir des blocs de src/ (dans l'ordre de ordre.txt).

Usage : python3 outils/assembler.py             écrit les pages à la racine du dépôt
        python3 outils/assembler.py --verifier  n'écrit rien : dit si src/ et les pages concordent
                                                (code de sortie 1 sinon)
"""
import os, sys

PAGES = {'index.html': 'campagne', 'bataille.html': 'bataille'}
DEPOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def assembler(page):
    d = os.path.join(DEPOT, 'src', PAGES[page])
    noms = open(os.path.join(d, 'ordre.txt'), encoding='utf-8').read().split()
    return ''.join(open(os.path.join(d, n), encoding='utf-8', newline='').read() for n in noms)


if __name__ == '__main__':
    verifier = '--verifier' in sys.argv
    ok = True
    for page in PAGES:
        texte = assembler(page)
        chemin = os.path.join(DEPOT, page)
        if verifier:
            pareil = open(chemin, encoding='utf-8', newline='').read() == texte
            ok &= pareil
            print(f'{page} : ' + ('concorde avec src/' if pareil else
                  'NE concorde PAS avec src/. Si la page est la bonne : python3 outils/decouper.py ; '
                  'si ce sont les blocs : python3 outils/assembler.py'))
        else:
            with open(chemin, 'w', encoding='utf-8', newline='') as f:
                f.write(texte)
            print(f'{page} refaite depuis src/{PAGES[page]}/')
    sys.exit(0 if ok else 1)
