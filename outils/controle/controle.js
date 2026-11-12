// Contrôle automatique de Roma Delenda Est : à lancer avant chaque version.
//
//   node outils/controle/controle.js            (depuis la racine du dépôt)
//   node outils/controle/controle.js rapide     (sans la campagne d'un an ni la partie à deux)
//
// Il sert les pages du dépôt sur un petit serveur local, ajoute en mémoire seulement un accès
// de test (window.__ev, juste avant le bloc BOUCLE), et vérifie :
//   1. que src/ et les pages concordent (outils/assembler.py --verifier) ;
//   2. que les neuf peuples démarrent et tiennent 60 jours ;
//   3. qu'un an de campagne de Carthage passe sans erreur (une défaite en règle compte comme une fin normale) ;
//   4. qu'une bataille Hannibal contre Scipion s'ouvre, se déploie et se joue 3 minutes ;
//   5. qu'une sauvegarde se reprend au bon jour (à mi-année) ;
//   6. qu'une partie à deux (deux onglets) reste synchronisée ;
//   7. que la première partie guidée (Cannes) amène une bataille en moins de 15 jours de jeu.
// Toute erreur JavaScript de la page fait échouer le contrôle. Le rapport et les captures
// vont dans outils/controle/rapport/.
//
// Hors ligne (ex. conteneur sans CDN) : CONTROLE_LIB=<dossier> où l'on a décompressé
// `npm pack three@0.128.0 d3-delaunay@6.0.4 peerjs@1.5.4` (un sous-dossier par paquet).

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const DEPOT = path.resolve(__dirname, '..', '..');
const RAPPORT = path.join(__dirname, 'rapport');
const RAPIDE = process.argv.includes('rapide');
const PEUPLES = ['Carthage', 'Rome', 'Macédoine', 'Syracuse', 'Athènes', 'Numidie', 'Gaulois', 'Pergame', 'Massalia'];
const BOUCLE = '/* ================= BOUCLE';

fs.mkdirSync(RAPPORT, { recursive: true });
const resultats = [];
const note = (nom, ok, detail) => { resultats.push({ nom, ok, detail }); console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom}${detail ? ' · ' + detail : ''}`); };

// ---------- bibliothèques hors ligne (facultatif)
const LIB = process.env.CONTROLE_LIB;
function libFile(re) {
  if (!LIB) return null;
  const dirs = fs.readdirSync(LIB);
  const find = (pkg, rel) => { const d = dirs.find(x => x.startsWith(pkg) && fs.statSync(path.join(LIB, x)).isDirectory()); return d && path.join(LIB, d, 'package', rel); };
  const T = [[/d3-delaunay/, find('d3-delaunay', 'dist/d3-delaunay.min.js')], [/three\.min\.js/, find('three', 'build/three.min.js')],
    [/GLTFLoader/, find('three', 'examples/js/loaders/GLTFLoader.js')], [/FBXLoader/, find('three', 'examples/js/loaders/FBXLoader.js')],
    [/NURBSCurve/, find('three', 'examples/js/curves/NURBSCurve.js')], [/NURBSUtils/, find('three', 'examples/js/curves/NURBSUtils.js')],
    [/fflate/, find('three', 'examples/js/libs/fflate.min.js')], [/peerjs/, find('peerjs', 'dist/peerjs.min.js')]];
  for (const [r, f] of T) if (r.test(re) && f && fs.existsSync(f)) return f;
  return null;
}

// ---------- serveur local : pages du dépôt + accès de test injecté en mémoire
function avecAcces(texte) { const i = texte.lastIndexOf(BOUCLE); return i < 0 ? texte : texte.slice(0, i) + 'window.__ev=c=>eval(c);\n' + texte.slice(i); }
function serveur() {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html';
    const f = path.join(DEPOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(DEPOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    let corps = fs.readFileSync(f);
    if (/^\/(index|bataille)\.html$/.test(p)) corps = Buffer.from(avecAcces(corps.toString('utf8')), 'utf8');
    r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(corps);
  });
  return new Promise(ok => srv.listen(0, () => ok(srv)));
}

async function main() {
  // 1. concordance src/ ↔ pages
  try { execFileSync('python3', [path.join(DEPOT, 'outils', 'assembler.py'), '--verifier'], { stdio: 'pipe' }); note('src/ et pages concordent', true); }
  catch (e) { note('src/ et pages concordent', false, String(e.stdout || e.message).trim().replace(/\n/g, ' ; ')); }

  const srv = await serveur(), port = srv.address().port, base = `http://localhost:${port}/`;
  const br = await chromium.launch(LIB ? {} : {});
  const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
  if (LIB) await ctx.route(/^https?:\/\/(?!localhost)/, rt => {
    const u = rt.request().url(), f = libFile(u);
    if (f) return rt.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' });
    if (/fonts/.test(u)) return rt.fulfill({ body: '', contentType: 'text/css' });
    return rt.abort();
  });
  const page = async (q = '') => {
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(String(e.message).slice(0, 300)));
    await p.goto(base + 'index.html' + q);
    await p.waitForSelector('#chgNew', { state: 'visible', timeout: 120000 });
    await p.waitForTimeout(1500);
    p.ev = c => p.evaluate(c => window.__ev(c), c);
    return p;
  };
  const commencer = async (p, peuple) => {
    await p.click('#chgNew'); await p.waitForTimeout(600);
    if (peuple) await p.evaluate(n => [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim().startsWith(n)).click(), peuple);
    await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim() === 'Commencer').click());
    await p.waitForFunction(() => typeof window.__ev === 'function' && !(document.querySelector('#chgNew') || {}).offsetParent, null, { timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4000);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim() === 'Commencer'); if (b) b.click(); });
  };
  // fait passer n jours, ferme les fenêtres qui s'ouvrent ; renvoie les exceptions levées par tick()
  const jours = (p, n) => p.ev(`(()=>{const err=[];for(let i=0;i<${n * 4};i++){if(S.over)break;try{S.paused=false;tick(.25)}catch(e){err.push(String(e&&e.message||e).slice(0,200))}
    const m=document.getElementById('modal');if(m&&getComputedStyle(m).display!=='none'){try{closeM()}catch(e){m.style.display='none'}}
    if(S.cur){try{applyResult(S.cur,autoResolve(S.cur))}catch(e){}S.cur=null}}return JSON.stringify({err:[...new Set(err)].slice(0,3),day:Math.round(S.day),over:!!S.over})})()`).then(JSON.parse);

  // 2. neuf peuples, 60 jours
  for (const peuple of PEUPLES) {
    let p;
    try {
      p = await page(); await commencer(p, peuple);
      const r = await jours(p, 60);
      const ok = !r.err.length && !p.errs.length && r.day >= 60;
      note(`${peuple} : démarrage et 60 jours`, ok, ok ? '' : JSON.stringify({ tick: r.err, page: p.errs.slice(0, 3), jour: r.day }));
    } catch (e) { note(`${peuple} : démarrage et 60 jours`, false, String(e.message || e).slice(0, 300)); if (p) await p.screenshot({ path: path.join(RAPPORT, `echec-${peuple}.png`) }).catch(() => {}); }
    if (p) { await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.close(); }
  }

  // 3. un an de campagne + 5. sauvegarde et reprise
  if (!RAPIDE) {
    let p;
    try {
      p = await page(); await commencer(p, 'Carthage');
      // sauvegarde et reprise à mi-année (un joueur qui ne fait rien peut perdre la partie avant la fin de l'année)
      const r1 = await jours(p, 180);
      const avant = await p.ev('S.paused=true;save();JSON.stringify({day:+S.day.toFixed(2),or:Math.round(S.gold.car),n:S.armies.length})').then(JSON.parse);
      await p.reload(); await p.waitForSelector('#chgCont', { state: 'visible', timeout: 120000 }); await p.click('#chgCont'); await p.waitForTimeout(2500);
      const apres = await p.evaluate(() => window.__ev('JSON.stringify({day:+S.day.toFixed(2),or:Math.round(S.gold.car),n:S.armies.length})')).then(JSON.parse);
      note('Sauvegarde et reprise', Math.abs(avant.day - apres.day) < 1 && avant.or === apres.or && avant.n === apres.n, `avant ${JSON.stringify(avant)} · après ${JSON.stringify(apres)}`);
      // le reste de l'année, après la reprise ; une défaite en règle (Sénat, Carthage prise) est une fin normale, pas une erreur
      const r2 = await jours(p, 365 - Math.floor(apres.day));
      const fin = await p.ev('JSON.stringify(S.over?{over:S.over,titre:S.overMsg&&S.overMsg.title}:null)').then(JSON.parse);
      const err = [...r1.err, ...r2.err];
      note('Carthage : un an de campagne', !err.length && !p.errs.length && (r2.day >= 365 || !!fin), (err.length || p.errs.length) ? JSON.stringify({ tick: err, page: p.errs.slice(0, 3) }) : fin ? `partie finie au jour ${r2.day} (${fin.titre || fin.over})` : `jour ${r2.day}`);
    } catch (e) { note('Carthage : un an de campagne / sauvegarde', false, String(e.message || e).slice(0, 300)); }
    if (p) { await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.close(); }
  }

  // 4. bataille Hannibal contre Scipion, en plaine
  {
    let p;
    try {
      p = await page(); await commencer(p, 'Carthage');
      await p.ev(`(()=>{const r=S.armies.filter(a=>a.side==='rom'&&!a.g).sort((a,b)=>b.units.length-a.units.length)[0];const H=S.armies.find(a=>a.name==='Hannibal');
        let best=null;for(let dx=-200;dx<=200;dx+=10)for(let dy=-200;dy<=200;dy+=10){const x=r.x+dx,y=r.y+dy;if(terrainAt(x,y)==='plaine'&&terrainAt(x+3,y+3)==='plaine'&&isLand(x,y)){const nn=nearestNode(x,y,n=>true);if(Math.hypot(nn.x-x,nn.y-y)>15){const d=Math.hypot(dx,dy);if(!best||d<best.d)best={x,y,d}}}}
        r.x=best.x;r.y=best.y;r.at=null;H.inG=false;H.at=null;H.x=r.x+3;H.y=r.y+3;S.cur={att:[H.id],def:[r.id],x:r.x+1.5,y:r.y+1.5,node:nearestNode(r.x,r.y,n=>true).i};S.paused=true;openBattle()})()`);
      await p.waitForTimeout(800); await p.click('#b3d');
      await p.waitForFunction(() => { const R = document.getElementById('chgB'); return R && R.classList.contains('pret'); }, null, { timeout: 60000 });
      await p.click('#chgBGo'); await p.waitForTimeout(2500);
      const f = p.frames().find(f => /bataille\.html/.test(f.url()));
      if (!f) throw new Error('la page de bataille ne s\'est pas ouverte');
      await f.waitForFunction(() => { const b = document.getElementById('bDepGo'); return b && b.offsetParent; }, null, { timeout: 30000 }); // on arrive directement au déploiement
      await f.evaluate(() => { const b = document.getElementById('bDepGo'); if (b) b.click(); }); await p.waitForTimeout(2000);
      const r = await f.evaluate(() => window.__ev(`(()=>{const B=window.__bellum;const tot=()=>{const s=[0,0];for(const u of B.units)s[u.side]+=u.men||0;return s.map(Math.round)};const a=tot();let err=null;
        try{const pas=dt=>(window.__pilote?window.__pilote.step:B.step)(dt); /* le pas complet (sortie des camps, déroute générale), pas celui figé dans __bellum */
          for(let i=0;i<7200;i++){pas(1/15);if(i%150===0){/* le joueur « joue simplement » : ses carrés libres marchent sur l'ennemi le plus proche (l'ennemi en défense, moins nombreux, ne vient pas de lui-même) */
          const E=B.units.filter(u=>u.side===1&&!u.dead&&!u.fled&&!u.routing&&!u.pend);for(const u of B.units){if(u.side!==0||u.dead||u.fled||u.routing||u.pend||u.order||u._wait||u._ex||!E.length)continue;let t=null,d=1e9;for(const e of E){const q=Math.hypot(e.x-u.x,e.y-u.y);if(q<d){d=q;t=e}}u.order={type:'attack',target:t}}}}}catch(e){err=String(e&&e.message||e).slice(0,200)}return JSON.stringify({a,b:tot(),n:B.units.length,err})})()`)).then(JSON.parse);
      await p.screenshot({ path: path.join(RAPPORT, 'bataille.png') });
      const ok = !r.err && !p.errs.length && r.n > 0 && r.b[0] < r.a[0] && r.b[1] < r.a[1];
      note('Bataille : ouverture, déploiement direct, 8 minutes de combat', ok, `Carthage ${r.a[0]} → ${r.b[0]}, Rome ${r.a[1]} → ${r.b[1]}` + (r.err ? ' · ' + r.err : '') + (p.errs.length ? ' · ' + p.errs.slice(0, 3).join(' | ') : ''));
    } catch (e) { note('Bataille : ouverture, déploiement direct, 8 minutes de combat', false, String(e.message || e).slice(0, 300)); if (p) await p.screenshot({ path: path.join(RAPPORT, 'echec-bataille.png') }).catch(() => {}); }
    if (p) { await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.close(); }
  }

  // 7. première partie guidée (Cannes) : règles simples, guide, et les consuls viennent livrer bataille
  {
    let p;
    try {
      p = await page(); await p.click('#chgNew'); await p.waitForTimeout(600);
      await p.click('#ppGo');
      await p.waitForFunction(() => typeof window.__ev === 'function' && document.getElementById('mGo') && /Première partie/.test(document.getElementById('mcard').innerText), null, { timeout: 90000 });
      await p.click('#mGo'); await p.waitForTimeout(800);
      const r = await p.ev(`(()=>{const d0=S.day,todo=nvTodoList().map(x=>x.t).join(' | ');for(let i=0;i<4*15&&!S.cur;i++){S.paused=false;tick(.25)}
        return JSON.stringify({jours:+(S.day-d0).toFixed(1),bataille:!!S.cur,simple:S.simple,guide:/Premiers pas 1/.test(todo)})})()`).then(JSON.parse);
      note('Première partie guidée : bataille en moins de 15 jours', r.bataille && r.simple === 1 && r.guide && !p.errs.length, JSON.stringify(r) + (p.errs.length ? ' · ' + p.errs.slice(0, 3).join(' | ') : ''));
    } catch (e) { note('Première partie guidée : bataille en moins de 15 jours', false, String(e.message || e).slice(0, 300)); if (p) await p.screenshot({ path: path.join(RAPPORT, 'echec-premiere.png') }).catch(() => {}); }
    if (p) { await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }); await p.close(); }
  }

  // 6. partie à deux entre deux onglets (connexion locale ?mplocal)
  if (!RAPIDE) {
    let A, B;
    try {
      A = await page('?mplocal'); B = await page('?mplocal');
      await A.click('#chgMp'); await A.waitForTimeout(600); await A.fill('#mpN', 'Hôte');
      await A.click('#mpH'); await A.waitForTimeout(2500);
      const code = await A.ev('MP.code');
      await B.click('#chgMp'); await B.waitForTimeout(600); await B.fill('#mpN', 'Invité');
      await B.evaluate(() => [...document.querySelectorAll('#mcard button')].find(b => b.innerText.trim() === 'Rejoindre').click()); await B.waitForTimeout(400);
      await B.fill('#mpC', code); await B.click('#mpJR'); await B.waitForTimeout(8000);
      await A.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent).find(b => b.innerText.trim() === 'Commencer'); if (b) b.click(); });
      await A.ev("try{closeM()}catch(e){};S.paused=false;S.speed=10"); await A.bringToFront(); await A.waitForTimeout(15000);
      await A.ev('S.paused=true'); await A.waitForTimeout(3000);
      const da = await A.ev('S.day'), db = await B.evaluate(() => window.__ev('S.day')), role = await B.evaluate(() => window.__ev('MP.role'));
      const ok = role === 'guest' && da > 2 && Math.abs(da - db) < 0.5 && !A.errs.length && !B.errs.length;
      note('Partie à deux : rejoindre et rester synchronisés', ok, `hôte jour ${da.toFixed(2)}, invité jour ${Number(db).toFixed(2)} (${role})` + (A.errs.length + B.errs.length ? ' · ' + [...A.errs, ...B.errs].slice(0, 3).join(' | ') : ''));
    } catch (e) { note('Partie à deux : rejoindre et rester synchronisés', false, String(e.message || e).slice(0, 300)); }
    for (const p of [A, B]) if (p) await p.close();
  }

  await br.close(); srv.close();
  fs.writeFileSync(path.join(RAPPORT, 'rapport.json'), JSON.stringify({ date: new Date().toISOString(), version: fs.readFileSync(path.join(DEPOT, 'VERSION.txt'), 'utf8').trim(), resultats }, null, 1));
  const ko = resultats.filter(r => !r.ok).length;
  console.log(ko ? `\n${ko} contrôle(s) en échec sur ${resultats.length}.` : `\nTout est vert : ${resultats.length} contrôles.`);
  process.exit(ko ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
