#!/usr/bin/env python3
"""Copie le jeu (zip Bellum-a-plusieurs.zip ou dossier) dans coquille/jeu/ et remplace
les bibliothèques en ligne par des copies locales (le jeu marche alors sans internet,
sauf le multijoueur qui a besoin du serveur de rendez-vous PeerJS).
Usage : preparer_jeu.py <zip_ou_dossier> <dossier_vendor> <coquille/jeu>"""
import sys, os, shutil, zipfile, re

src, vend, out = sys.argv[1:4]
if os.path.isdir(out): shutil.rmtree(out)
os.makedirs(out)
if zipfile.is_zipfile(src):
    with zipfile.ZipFile(src) as z:
        for n in z.namelist():
            if n.endswith('/'): continue
            base = n.split('/', 1)[1] if '/' in n else n
            if not base.endswith('.html'): continue
            with open(os.path.join(out, base), 'wb') as f: f.write(z.read(n))
else:
    for n in os.listdir(src):
        if n.endswith('.html'): shutil.copy(os.path.join(src, n), out)

# Interdit : modèles sous licence non redistribuable.
for bad in ('units', 'navires', 'ancient'):
    if os.path.exists(os.path.join(out, bad)): sys.exit('refusé : dossier sous licence ' + bad)

lib = os.path.join(out, 'lib'); os.makedirs(lib)
T = os.path.join(vend, 'three-0.128.0', 'package')
COPIES = {
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': os.path.join(T, 'build', 'three.min.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js': os.path.join(T, 'examples/js/loaders/GLTFLoader.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js': os.path.join(T, 'examples/js/loaders/FBXLoader.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/fflate.min.js': os.path.join(T, 'examples/js/libs/fflate.min.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/curves/NURBSUtils.js': os.path.join(T, 'examples/js/curves/NURBSUtils.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/curves/NURBSCurve.js': os.path.join(T, 'examples/js/curves/NURBSCurve.js'),
  'https://cdn.jsdelivr.net/npm/d3-delaunay@6.0.4/dist/d3-delaunay.min.js': os.path.join(vend, 'd3-delaunay-6.0.4', 'package/dist/d3-delaunay.min.js'),
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js': os.path.join(vend, 'peerjs-1.5.4', 'package/dist/peerjs.min.js'),
}
remap = {}
for url, f in COPIES.items():
    name = os.path.basename(f)
    shutil.copy(f, os.path.join(lib, name)); remap[url] = 'lib/' + name

# Polices : Marcellus 400 + Barlow Semi Condensed 400/500/600 (latin, latin-ext).
fdir = os.path.join(lib, 'polices'); os.makedirs(fdir)
css = []
for pkg, fam, weights in (('fontsource-marcellus-5.3.0', 'marcellus', [400]),
                          ('fontsource-barlow-semi-condensed-5.3.0', 'barlow-semi-condensed', [400, 500, 600])):
    p = os.path.join(vend, pkg, 'package')
    for w in weights:
        c = open(os.path.join(p, f'{w}.css'), encoding='utf-8').read()
        c = re.sub(r",\s*url\([^)]*\.woff\) format\('woff'\)", '', c)
        for m in re.findall(r'\./files/([\w.-]+\.woff2)', c):
            shutil.copy(os.path.join(p, 'files', m), os.path.join(fdir, m))
        css.append(c.replace('./files/', './polices/'))
open(os.path.join(lib, 'polices.css'), 'w', encoding='utf-8').write('\n'.join(css))

for n in os.listdir(out):
    if not n.endswith('.html'): continue
    fp = os.path.join(out, n); h = open(fp, encoding='utf-8').read()
    for url, loc in remap.items(): h = h.replace(url, loc)
    h = re.sub(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\s*', '', h)
    h = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2[^"]*">', '<link rel="stylesheet" href="lib/polices.css">', h)
    h = h.replace('<head>', '<head><script>window.BELLUM_APP=1</script>', 1)
    open(fp, 'w', encoding='utf-8').write(h)
    reste = sorted(set(re.findall(r'https://(?:cdn|unpkg|fonts)[^\s"\')]+', h)))
    print(n, 'liens en ligne restants :', reste or 'aucun')
