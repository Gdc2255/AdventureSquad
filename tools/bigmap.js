const fs = require('fs');
(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9222/json')).json(); if (targets.length) break; } catch (e) {} await new Promise(r => setTimeout(r, 500)); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.clearBrowserCache');
  await send('Page.navigate', { url: 'http://localhost:8099/index.html?t=' + Date.now() });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(5000);
  const evalJS = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    const ex = r.result && r.result.exceptionDetails;
    if (ex) return 'EXC: ' + String((ex.exception && ex.exception.description) || ex.text).split('\n')[0];
    return r.result && r.result.result && r.result.result.value;
  };
  const G = `cc.director.getScene().getChildByName('Game').getComponent('Game')`;
  const url = await evalJS(`(()=>{const g=${G}; const COLS=84, ROWS = 30;
    const S=11; const cv=document.createElement('canvas');
    cv.width=COLS*S; cv.height=ROWS*S; const ctx=cv.getContext('2d');
    ctx.fillStyle='#10131c'; ctx.fillRect(0,0,cv.width,cv.height);
    let seed=777; const rng=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;};
    const m=g.map; m.gen(rng,1);
    for(let cy=0;cy<ROWS;cy++)for(let cx=0;cx<COLS;cx++){
      const i=m.idx(cx,cy); const t=m.tiles[i]; let col=null;
      if(t===1) col='#2a3145';
      else if(m.props[i]>=0) col='#b06a1e';
      else if(t===2) col='#ff5566';
      else if(t===3) col='#55ff88';
      else if(m.roomOf[i]>=0) col='#3d4a66';
      else col='#6d7fa8';
      ctx.fillStyle=col; ctx.fillRect(cx*S,cy*S,S,S);
    }
    ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
    for(let k=0;k<m.rooms.length;k++){const r=m.rooms[k];
      ctx.strokeStyle= r.isBoss?'#ffd166':'#8fa2d0'; ctx.lineWidth=2;
      ctx.strokeRect(r.x*S+1,r.y*S+1,r.w*S-2,r.h*S-2);
      ctx.fillStyle= r.isBoss?'#ffd166':'#cfd8ee';
      ctx.fillText(r.isBoss?'BOSS':String(k),(r.x+r.w/2)*S,(r.y+r.h/2)*S+5);}
    return cv.toDataURL('image/png');})()`);
  fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/bigmap.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log('bigmap.png 已导出');
  process.exit(0);
})();
