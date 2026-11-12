// Mesure de la pression romaine (étape 4 du plan de reprise) : une campagne de Carthage jouée par un joueur
// qui ne fait RIEN, et ce qui lui arrive mois par mois.
//
//   node outils/mesure/pression.js            (360 jours)
//   node outils/mesure/pression.js 720        (deux ans)
//   MESURE_PEUPLE=Rome node outils/mesure/pression.js   (autre peuple joué)
//   MESURE_AUTO=1 node outils/mesure/pression.js        (le camp du joueur est joué par l'IA : repère d'un joueur actif)
//
// Critère de l'étape 4 : le joueur passif perd des villes dans l'année et son or reste sous 1 000.
// Les batailles sont résolues automatiquement (autoResolve), les fenêtres fermées.
// Rapport : outils/mesure/rapport/pression-<peuple>.json (ignoré par git). Hors ligne : CONTROLE_LIB comme pour outils/controle.
const fs = require('fs'), path = require('path'), { lancer } = require('./partie.js');
const RAPPORT = path.join(__dirname, 'rapport');
const JOURS = +(process.argv[2] || 360), PEUPLE = process.env.MESURE_PEUPLE || 'Carthage';
fs.mkdirSync(RAPPORT, { recursive: true });

// relevé d'un mois, calculé dans la page
const RELEVE = `(()=>{const J=S.mirror?'rom':'car',E=J==='car'?'rom':'car';
  const villes=s=>N.filter(n=>!n.col&&ownerN(n.i)===s);
  const camp=s=>S.armies.filter(a=>a.side===s&&!a.dead&&!a.g);const hom=L=>L.reduce((x,a)=>x+a.units.reduce((y,u)=>y+(u.men||0),0),0);
  const zone=a=>{const n=nearestNode(a.x,a.y,()=>true);return n.lat<37.4&&n.lon>-6?'Afrique':n.lon<3.5&&n.lat<43.6?'Hispanie':typeof inItaly==='function'&&inItaly(a.x,a.y)?'Italie':n.lon>12&&n.lat<38.4?'Sicile':'ailleurs'};
  const R=camp(E).map(a=>({n:a.name,rg:a.units.length,z:zone(a),bouge:!!a.legs.length,ai:a.ai||'',siege:!!(a.at!=null&&S.siege[N[a.at].id]&&S.siege[N[a.at].id].a===a.id)}));
  const perdues=N.filter(n=>!n.col&&n.o0===J&&ownerN(n.i)!==J).map(n=>n.n);
  const sieges=Object.keys(S.siege||{}).filter(id=>ownerN(NI[id])===J).map(id=>N[NI[id]].n);
  let inc=null;try{const I=income(J);inc=I.inc-I.up}catch(e){}
  return JSON.stringify({jour:Math.round(S.day),or:Math.round(S.gold[J]),orE:Math.round(S.gold[E]),net:inc,villes:villes(J).length,villesE:villes(E).length,perdues,sieges,
    armeesE:R.length,hommesE:hom(camp(E)),armees:camp(J).length,mode:S.pol&&S.pol.mode,score:typeof warScore==='function'?warScore().v:null,R})})()`;

(async () => {
  const { ev, jours, errs, fermer } = await lancer(PEUPLE);
  const AUTO = !!process.env.MESURE_AUTO; if (AUTO) await ev('S.auto=true');
  const lignes = [JSON.parse(await ev(RELEVE))]; console.log(JSON.stringify(lignes[0]));
  let batailles = 0;
  for (let d = 0; d < JOURS; d += 30) {
    const b = await jours(30);
    batailles += b;
    const l = JSON.parse(await ev(RELEVE)); l.batailles = batailles; lignes.push(l);
    console.log(JSON.stringify({ ...l, R: l.R.map(a => `${a.n}:${a.rg}rg ${a.z}${a.siege ? ' siège' : a.bouge ? ' marche' : ''}`).join(' | ') }));
  }
  const journal = JSON.parse(await ev(`JSON.stringify((S.log||[]).slice(-300).map(l=>[Math.round(l.d!=null?l.d:l.day||0),String(l.t||l.m||l).slice(0,200)]))`).catch(() => '[]'));
  const fin = lignes[lignes.length - 1];
  const verdict = { villesPerdues: fin.perdues.length, orMax: Math.max(...lignes.map(l => l.or)), orFin: fin.or,
    critere: fin.perdues.length > 0 && Math.max(...lignes.map(l => l.or)) <= 1000 };
  console.log('VERDICT', JSON.stringify(verdict), 'erreurs', errs.length);
  fs.writeFileSync(path.join(RAPPORT, `pression-${PEUPLE}${AUTO ? '-auto' : ''}.json`), JSON.stringify({ verdict, lignes, journal, errs }, null, 1));
  await fermer();
})().catch(e => { console.error(e); process.exit(1); });
