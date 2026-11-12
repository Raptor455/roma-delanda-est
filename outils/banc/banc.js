// Banc d'essai des batailles : 20 batailles types jouées en accéléré, comparées à la résolution automatique.
//
//   node outils/banc/banc.js                 toutes les batailles, joueur commandé par l'IA à doctrines
//   node outils/banc/banc.js simple          le joueur « joue simplement » : toute l'armée attaque, sans manœuvre
//   node outils/banc/banc.js passif          le joueur ne donne aucun ordre (mesure la riposte)
//   node outils/banc/banc.js ia hannibal     seulement les batailles dont le nom contient « hannibal »
//   BANC_CAMPS=1 node outils/banc/banc.js simple hannibal   comme en campagne : les armées sortent de leurs camps (plus long) ;
//                                            en mode simple le joueur laisse son armée se ranger puis attaque
//   BANC_PAR=4 (pages en parallèle), BANC_GRAINES=2 (tirages par bataille), BANC_TMAX=1500 (secondes de jeu)
//
// Pour chaque bataille : vainqueur, pertes de chaque camp (comptées comme au retour en campagne : fuyards à 30 %,
// en déroute à 15 %), durée, et ce que donnerait autoResolve (src/campagne/023-batailles.part) avec les mêmes forces.
// Rapport dans outils/banc/rapport/banc-<mode>.json. Hors ligne : CONTROLE_LIB comme pour outils/controle.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DEPOT = path.resolve(__dirname, '..', '..'), RAPPORT = path.join(__dirname, 'rapport');
const MODE = ['ia', 'simple', 'passif'].find(m => process.argv.includes(m)) || 'ia';
const FILTRE = process.argv.slice(2).filter(a => !['ia', 'simple', 'passif'].includes(a)).map(s => s.toLowerCase());
const PAR = +(process.env.BANC_PAR || 3), GRAINES = +(process.env.BANC_GRAINES || 1), TMAX = +(process.env.BANC_TMAX || 1500), CAMPS = !!process.env.BANC_CAMPS;
const TER = JSON.parse(fs.readFileSync(path.join(__dirname, 'terrains.json'), 'utf8'));
const BOUCLE = '/* ================= BOUCLE';
fs.mkdirSync(RAPPORT, { recursive: true });

// coût des régiments, comme power() de la campagne (men / UT.men * coût) ; les types hors UT reçoivent un coût voisin
const COUT = { lib: [600, 60], iber: [600, 50], gaul: [600, 40], sling: [300, 35], hcav: [300, 70], ncav: [300, 55], eleph: [16, 130], legion: [640, 60], velites: [300, 30], rcav: [300, 65], acav: [300, 55],
  hastati: [480, 50], principes: [480, 60], triarii: [240, 45], socii: [600, 50], phalange: [640, 65], hypasp: [480, 65], peltaste: [300, 35], cretois: [300, 35], compagnons: [300, 80], thessal: [300, 70],
  athoplites: [600, 60], thureo: [480, 45], hippeis: [300, 65], athpelt: [300, 35] };
const A = (...l) => l; // [type, nombre]
const HANNIBAL40 = A(['lib', 14], ['iber', 8], ['gaul', 6], ['hcav', 4], ['ncav', 4], ['sling', 2], ['eleph', 2]);
const SCIPION20 = A(['hastati', 5], ['principes', 5], ['triarii', 3], ['socii', 2], ['velites', 2], ['rcav', 2], ['acav', 1]);
const CARTH = n => A(['lib', Math.round(n * .35)], ['iber', Math.round(n * .2)], ['gaul', Math.round(n * .15)], ['hcav', Math.round(n * .1)], ['ncav', Math.round(n * .1)], ['sling', Math.max(1, Math.round(n * .1))]);
const ROME = n => A(['hastati', Math.round(n * .25)], ['principes', Math.round(n * .25)], ['triarii', Math.round(n * .1)], ['socii', Math.round(n * .15)], ['velites', Math.round(n * .1)], ['rcav', Math.max(1, Math.round(n * .1))], ['acav', Math.max(1, Math.round(n * .05))]);
const MACED = n => A(['phalange', Math.round(n * .45)], ['hypasp', Math.round(n * .15)], ['peltaste', Math.round(n * .1)], ['cretois', Math.max(1, Math.round(n * .05))], ['compagnons', Math.round(n * .1)], ['thessal', Math.round(n * .15)]);
const GAULE = n => A(['gaul', Math.round(n * .75)], ['hcav', Math.round(n * .15)], ['sling', Math.max(1, Math.round(n * .1))]);
const GRECS = n => A(['athoplites', Math.round(n * .6)], ['thureo', Math.round(n * .15)], ['athpelt', Math.round(n * .1)], ['hippeis', Math.max(1, Math.round(n * .15))]);
const NUMID = n => A(['ncav', Math.round(n * .6)], ['iber', Math.round(n * .2)], ['sling', Math.round(n * .2)]);
const BATAILLES = [
  { nom: 'Hannibal 40 contre Scipion 20, plaine', ter: 'Pô', pk: ['car', 'rom'], p: HANNIBAL40, e: SCIPION20 },
  { nom: 'Hannibal 40 contre Scipion 20, plaine à fleuve', ter: 'Aufide', pk: ['car', 'rom'], p: HANNIBAL40, e: SCIPION20 },
  { nom: 'Hannibal 40 contre Scipion 20, montagne', ter: 'Trébie', pk: ['car', 'rom'], p: HANNIBAL40, e: SCIPION20 },
  { nom: 'Scipion 20 contre Hannibal 40 (joueur romain, un contre deux)', ter: 'Pô', pk: ['rom', 'car'], p: SCIPION20, e: HANNIBAL40 },
  { nom: 'Carthage 20 contre Rome 20, plaine', ter: 'Pô', pk: ['car', 'rom'], p: CARTH(20), e: ROME(20) },
  { nom: 'Carthage 20 contre Rome 20, montagne', ter: 'Trébie', pk: ['car', 'rom'], p: CARTH(20), e: ROME(20) },
  { nom: 'Carthage 20 contre Rome 20, pont', ter: 'Pont', pk: ['car', 'rom'], p: CARTH(20), e: ROME(20) },
  { nom: 'Rome 20 contre Carthage 20, plaine (joueur romain)', ter: 'Pô', pk: ['rom', 'car'], p: ROME(20), e: CARTH(20) },
  { nom: 'Carthage 12 contre Rome 12, plaine', ter: 'Aufide', pk: ['car', 'rom'], p: CARTH(12), e: ROME(12) },
  { nom: 'Carthage 12 contre Rome 24 (un contre deux)', ter: 'Pô', pk: ['car', 'rom'], p: CARTH(12), e: ROME(24) },
  { nom: 'Carthage 30 contre Rome 20 (trois contre deux)', ter: 'Pô', pk: ['car', 'rom'], p: CARTH(30), e: ROME(20) },
  { nom: 'Macédoine 20 contre Rome 20, plaine', ter: 'Pô', pk: ['mac', 'rom'], p: MACED(20), e: ROME(20) },
  { nom: 'Rome 20 contre Macédoine 20, montagne (joueur romain)', ter: 'Trébie', pk: ['rom', 'mac'], p: ROME(20), e: MACED(20) },
  { nom: 'Gaulois 20 contre Rome 20, plaine', ter: 'Pô', pk: ['gau', 'rom'], p: GAULE(20), e: ROME(20) },
  { nom: 'Rome 20 contre Gaulois 30 (joueur romain, deux contre trois)', ter: 'Aufide', pk: ['rom', 'gau'], p: ROME(20), e: GAULE(30) },
  { nom: 'Athènes 16 contre Macédoine 16, plaine', ter: 'Pô', pk: ['ath', 'mac'], p: GRECS(16), e: MACED(16) },
  { nom: 'Carthage 16 contre Numides 16, plaine', ter: 'Pô', pk: ['car', 'num'], p: CARTH(16), e: NUMID(16) },
  { nom: 'Numides 16 contre Rome 16 (joueur numide)', ter: 'Aufide', pk: ['num', 'rom'], p: NUMID(16), e: ROME(16) },
  { nom: 'Carthage 8 contre Rome 8, petite bataille', ter: 'Pô', pk: ['car', 'rom'], p: CARTH(8), e: ROME(8) },
  { nom: 'Carthage 40 contre Rome 40, grande bataille', ter: 'Pô', pk: ['car', 'rom'], p: CARTH(40), e: ROME(40) },
];
const liste = l => { const out = [], c = {}; for (const [t, n] of l) for (let i = 0; i < n; i++) { c[t] = (c[t] || 0) + 1; out.push({ t, men: COUT[t][0], label: t + ' ' + c[t] }); } return out; };
const puissance = l => l.reduce((s, u) => s + u.men / COUT[u.t][0] * COUT[u.t][1], 0);
function auto(b) { // même formule qu'autoResolve : cote, puis pertes attendues du vainqueur et du vaincu
  const pa = puissance(b.p), pd = puissance(b.e) * (b.terrain === 'montagne' ? 1.2 : 1), p = pa * pa / (pa * pa + pd * pd), g = p >= .5, r = g ? p : 1 - p;
  return { cote: p, vainqueur: g ? 'joueur' : 'ennemi', pertesVainqueur: .08 + .25 * (1 - r), pertesVaincu: .5 };
}
function charge(sc) { const T = TER[sc.ter], p = liste(sc.p), e = liste(sc.e);
  return { v: 1, st: { day: 1 }, b: { title: sc.nom, desc: 'Banc d\'essai.', enemy: sc.pk[1], terrain: T.t.ter, p, e, pk: sc.pk }, t: T.t }; }

const LIB = process.env.CONTROLE_LIB;
function libFile(u) { if (!LIB) return null; const dirs = fs.readdirSync(LIB), find = (pkg, rel) => { const d = dirs.find(x => x.startsWith(pkg)); return d && path.join(LIB, d, 'package', rel); };
  const T = [[/d3-delaunay/, find('d3-delaunay', 'dist/d3-delaunay.min.js')], [/three\.min\.js/, find('three', 'build/three.min.js')], [/GLTFLoader/, find('three', 'examples/js/loaders/GLTFLoader.js')]];
  for (const [r, f] of T) if (r.test(u) && f && fs.existsSync(f)) return f; return null; }
function serveur() { const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); const f = path.join(DEPOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(DEPOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    let corps = fs.readFileSync(f); if (p === '/bataille.html') { const t = corps.toString('utf8'), i = t.lastIndexOf(BOUCLE); corps = Buffer.from(t.slice(0, i) + 'window.__ev=c=>eval(c);\n' + t.slice(i), 'utf8'); }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(corps); });
  return new Promise(ok => srv.listen(0, () => ok(srv))); }

// joué dans la page : avance la simulation jusqu'à l'écran de fin
function jouer({ mode, tmax }) {
  const ev = window.__ev, U = () => ev('units'), step = ev('(dt)=>step(dt)'), compte = s => U().filter(u => u.side === s).reduce((a, u) => a + (u.dead && !u.fled ? 0 : u.men * (u.fled ? .7 : u.routing ? .85 : 1)), 0);
  const tot = s => U().filter(u => u.side === s).reduce((a, u) => a + (u.men0 || u.men), 0);
  for (const u of U()) u.men0 = u.men; const m0 = [tot(0), tot(1)];
  { const b = document.getElementById('bDepGo'); if (b && b.offsetParent) b.click(); else ev('begin()'); } ev('paused=false');
  const ok = u => !u.dead && !u.routing && !u.pend, near = (u, L) => { let b = null, bd = 1e9; for (const e of L) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; b = e; } } return b; };
  function joueur(T) { if (mode === 'ia') { window.__iaB.tick(0); return; } if (mode === 'passif') return;
    // « jouer simplement » : toutes les 10 s, toute l'armée encore sans ordre marche sur l'ennemi le plus proche et l'attaque
    if (U().some(u => u.side === 0 && (u._wait || u._ex))) return; // avec les camps : on attend que l'armée soit sortie et rangée
    const mine = U().filter(u => u.side === 0 && ok(u)), foes = U().filter(u => u.side === 1 && ok(u)); if (!foes.length) return;
    for (const u of mine) { if (u.contacts.length || (u.order && u.order.type === 'attack' && ok(u.order.target))) continue; const n = near(u, foes); u.order = { type: 'attack', target: n, run: Math.hypot(n.x - u.x, n.y - u.y) < 150 }; } }
  let T = 0, bc = 0, sc = 0; const dt = .1, t0 = performance.now(), fin = document.getElementById('end');
  while (T < tmax) { step(dt); T += dt; bc -= dt; sc -= dt; if (mode === 'ia' ? bc <= 0 : sc <= 0) { bc = .8; sc = 10; joueur(T); } if (fin && !fin.hidden) break; if (ev('ended')) break; }
  const vivant = s => U().some(u => u.side === s && ok(u)), m1 = [compte(0), compte(1)];
  const titre = (document.getElementById('endT') || {}).textContent || '';
  return { duree: Math.round(T), fini: !!(fin && !fin.hidden), titre, vainqueur: /Victoire/.test(titre) ? 'joueur' : /Défaite/.test(titre) ? 'ennemi' : vivant(0) && !vivant(1) ? 'joueur' : vivant(1) && !vivant(0) ? 'ennemi' : 'indécis',
    pertes: [1 - m1[0] / m0[0], 1 - m1[1] / m0[1]], hommes: m0.map(Math.round), camp: [0, 1].map(sd => U().filter(u => u.side === sd && (u._wait || u._ex)).length), ms: Math.round(performance.now() - t0), doctrine: [(window.__iaB.sd[0] || {}).D && window.__iaB.sd[0].D.k, (window.__iaB.sd[1] || {}).D && window.__iaB.sd[1].D.k] };
}

(async () => {
  const srv = await serveur(), base = `http://localhost:${srv.address().port}/`, br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 760 } });
  await ctx.route(/^https?:\/\/(?!localhost)/, rt => { const u = rt.request().url(), f = libFile(u); if (f) return rt.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }); if (/fonts/.test(u)) return rt.fulfill({ body: '', contentType: 'text/css' }); return LIB ? rt.abort() : rt.continue(); });
  const taches = []; BATAILLES.forEach((sc, i) => { if (FILTRE.length && !FILTRE.every(f => sc.nom.toLowerCase().includes(f))) return; for (let g = 1; g <= GRAINES; g++) taches.push({ sc, i, g }); });
  const res = []; let k = 0;
  const pct = x => (x * 100).toFixed(0).padStart(3) + ' %';
  async function ouvrier() { while (k < taches.length) { const { sc, i, g } = taches[k++], c = charge(sc), a = auto(c.b); let p, r;
      try { p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
        await p.addInitScript(s => { let x = s * 9301 + 49297; Math.random = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }, g * 7 + i);
        await p.goto(base + 'bataille.html?banc=' + (CAMPS ? 2 : 1) + '#c=' + encodeURIComponent(JSON.stringify(c)), { waitUntil: 'load' });
        await p.waitForFunction(() => window.__bellum && window.__bellum.units && window.__bellum.units.length > 0 && typeof window.__ev === 'function', null, { timeout: 120000 }); await p.waitForTimeout(1200);
        if (CAMPS) { await p.waitForFunction(() => { const b = document.getElementById('bDepGo'); return b && b.offsetParent; }, null, { timeout: 30000 }); await p.waitForTimeout(300); } r = await p.evaluate(jouer, { mode: MODE, tmax: TMAX }); if (process.env.BANC_PHOTO) { await p.evaluate(() => { const c = window.__bellum.cam; c.tx = 1600; c.ty = 1000; c.dist = 5200; }); await p.waitForTimeout(700); await p.screenshot({ path: path.join(RAPPORT, 'banc-' + (i + 1) + '.png') }); } r.erreurs = [...new Set(errs)].slice(0, 3);
      } catch (e) { r = { echec: String(e.message || e).slice(0, 200) }; }
      if (p) await p.close().catch(() => {});
      const l = { n: i + 1, nom: sc.nom, graine: g, auto: a, ...r }; res.push(l);
      console.log(r.echec ? `ÉCHEC ${sc.nom} · ${r.echec}` : `${String(i + 1).padStart(2)} ${sc.nom}\n     joué : ${r.vainqueur.padEnd(8)} pertes joueur ${pct(r.pertes[0])}, ennemi ${pct(r.pertes[1])}, ${Math.floor(r.duree / 60)} min ${r.duree % 60} s${r.fini ? '' : ' (pas fini)'}` +
        `\n     auto : ${a.vainqueur.padEnd(8)} cote ${pct(a.cote)}, pertes du vainqueur ${pct(a.pertesVainqueur)}, du vaincu 35 à 65 %${r.erreurs && r.erreurs.length ? '\n     erreurs : ' + r.erreurs.join(' | ') : ''}`); } }
  await Promise.all(Array.from({ length: Math.min(PAR, taches.length) }, ouvrier));
  res.sort((a, b) => a.n - b.n || a.graine - b.graine);
  const bons = res.filter(r => !r.echec), acc = bons.filter(r => r.vainqueur === r.auto.vainqueur).length;
  const ecart = bons.filter(r => r.vainqueur === r.auto.vainqueur).map(r => Math.abs(r.pertes[r.vainqueur === 'joueur' ? 0 : 1] - r.auto.pertesVainqueur));
  console.log(`\nMode ${MODE} : ${bons.length} batailles, même vainqueur que l'automatique ${acc}/${bons.length}, écart moyen des pertes du vainqueur ${ecart.length ? (ecart.reduce((a, b) => a + b, 0) / ecart.length * 100).toFixed(0) : '?'} points.`);
  fs.writeFileSync(path.join(RAPPORT, `banc-${MODE}.json`), JSON.stringify(res, null, 1));
  await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
