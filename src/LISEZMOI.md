# Le code du jeu, bloc par bloc

`index.html` (la campagne) et `bataille.html` sont découpés ici en un fichier par bloc,
à chaque repère `/* ===== NOM ===== */` du code :

- `src/campagne/` : 90 blocs de index.html
- `src/bataille/` : 30 blocs de bataille.html
- `ordre.txt` dans chaque dossier : l'ordre exact d'assemblage

Les pages à la racine restent celles que le site et l'appli publient. `src/` en est
l'exact reflet : `python3 outils/assembler.py --verifier` le contrôle à chaque envoi.

## Modifier un module

1. Partir de la dernière version de `main`.
2. Modifier le bloc concerné dans `src/…/NNN-nom.part` (ou ajouter un fichier et
   l'inscrire à sa place dans `ordre.txt`).
3. `python3 outils/assembler.py` : refait index.html et bataille.html.
4. `node outils/controle/controle.js` : joue le jeu et dit si tout est vert.
5. Envoyer les blocs et les pages ensemble.

Plus besoin de rejouer les patch.py des différents modules dans un ordre précis : chaque
bloc est déjà à sa place dans la dernière version.

## Quand une page arrive d'ailleurs (zip, ancien patch.py)

`python3 outils/decouper.py` refait `src/` à partir des pages de la racine. C'est l'inverse
exact d'assembler.py : les deux sens donnent le même résultat à l'octet près.

`naval.html` n'est pas découpé : c'est une page à part, plus petite, sans chaîne de patchs.
