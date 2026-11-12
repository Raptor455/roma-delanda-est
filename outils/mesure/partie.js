// Lance une partie dans un navigateur sans écran, avec l'accès de test window.__ev (comme outils/controle).
//   const { lancer } = require('./partie.js'); const P = await lancer('Carthage'); await P.ev('S.day'); await P.fermer();
// Hors ligne : CONTROLE_LIB comme pour outils/controle.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DEPOT = path.resolve(__dirname, '..', '..');
const BOUCLE = '/* ================= BOUCLE';
const LIB = process.env.CONTROLE_LIB;
function libFile(u) {
  if (!LIB) return null;
  const dirs = fs.readdirSync(LIB);
  const find = (pkg, rel) => { const d = dirs.find(x => x.startsWith(pkg) && fs.statSync(path.join(LIB, x)).isDirectory()); return d && path.join(LIB, d, 'package', rel); };
  const T = [[/d3-delaunay/, find('d3-delaunay', 'dist/d3-delaunay.min.js')], [/three\.min\.js/, find('three', 'build/three.min.js')],
    [/GLTFLoader/, find('three', 'examples/js/loaders/GLTFLoader.js')], [/peerjs/, find('peerjs', 'dist/peerjs.min.js')]];
  for (const [r, f] of T) if (r.test(u) && f && fs.existsSync(f)) return f;
  return null;
}
function serveur() {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html';
    const f = path.join(DEPOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(DEPOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    let corps = fs.readFileSync(f);
    if (/^\/(index|bataille)\.html$/.test(p)) { const t = corps.toString('utf8'), i = t.lastIndexOf(BOUCLE); if (i > 0) corps = Buffer.from(t.slice(0, i) + 'window.__ev=c=>eval(c);\n' + t.slice(i), 'utf8'); }
    r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(corps);
  });
  return new Promise(ok => srv.listen(0, () => ok(srv)));
}

async function lancer(peuple = 'Carthage', q = '') {
  const srv = await serveur(), base = `http://localhost:${srv.address().port}/`;
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
  if (LIB) await ctx.route(/^https?:\/\/(?!localhost)/, rt => { const u = rt.request().url(), f = libFile(u);
    if (f) return rt.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }); if (/fonts/.test(u)) return rt.fulfill({ body: '', contentType: 'text/css' }); return rt.abort(); });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
  await p.goto(base + 'index.html' + q); await p.waitForSelector('#chgNew', { state: 'visible', timeout: 120000 }); await p.waitForTimeout(1500);
  const ev = c => p.evaluate(c => window.__ev(c), c);
  await p.click('#chgNew'); await p.waitForTimeout(600);
  await p.evaluate(n => [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim().startsWith(n)).click(), peuple);
  await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim() === 'Commencer').click());
  await p.waitForFunction(() => typeof window.__ev === 'function' && !(document.querySelector('#chgNew') || {}).offsetParent, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim() === 'Commencer'); if (b) b.click(); });
  // fait passer n jours sans joueur : fenêtres fermées, batailles résolues automatiquement ; renvoie le nombre de batailles
  const jours = n => ev(`(()=>{let k=0;for(let i=0;i<${n * 4};i++){if(S.over)break;try{S.paused=false;tick(.25)}catch(e){}
      const m=document.getElementById('modal');if(m&&getComputedStyle(m).display!=='none'){try{closeM()}catch(e){m.style.display='none'}}
      if(S.cur){k++;try{applyResult(S.cur,autoResolve(S.cur))}catch(e){}S.cur=null}}return k})()`);
  return { p, ev, jours, errs, fermer: async () => { await br.close(); srv.close(); } };
}
module.exports = { lancer };
