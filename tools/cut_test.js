// 回归测试：Boss 房不能是「必经之路」（否则有些房间只能穿过 Boss 房才到，整局死锁）
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
  console.log(await evalJS(`(()=>{const g=${G}; const COLS=84, ROWS = 30;
    let badMaps=0, worst=0, sample=null, total=0;
    for(let round=0; round<40; round++){
      let seed=(round+1)*2246822519>>>0;
      const rng=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;};
      const m=g.map; m.gen(rng,1);
      total++;
      const br=m.rooms.findIndex(r=>r.isBoss);
      const bossRoom=m.rooms[br];
      // 把 boss 房的内部 + 它的门当成墙（进不去 boss 房的情况下）
      const blocked=new Uint8Array(COLS*ROWS);
      for(let cy=bossRoom.y;cy<bossRoom.y+bossRoom.h;cy++)
        for(let cx=bossRoom.x;cx<bossRoom.x+bossRoom.w;cx++) blocked[m.idx(cx,cy)]=1;
      for(const gt of bossRoom.gates) blocked[m.idx(gt.cx,gt.cy)]=1;
      // 从 0 号房洪水填充
      const r0=m.rooms[0];
      const s=m.idx(r0.x+1,r0.y+1);
      const reach=new Uint8Array(COLS*ROWS); reach[s]=1; const q=[s]; let head=0;
      while(head<q.length){const cur=q[head++];const cx=cur%COLS,cy=(cur/COLS)|0;
        const nb=[[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
        for(const [nx,ny] of nb){ if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;
          const ni=m.idx(nx,ny); if(reach[ni]||blocked[ni])continue; if(m.tiles[ni]===1)continue;
          reach[ni]=1;q.push(ni);}}
      const miss=[];
      for(let i=0;i<m.rooms.length;i++){ if(i===br)continue; const r=m.rooms[i]; let ok=false;
        for(let cy=r.y+1;cy<r.y+r.h-1&&!ok;cy++)for(let cx=r.x+1;cx<r.x+r.w-1&&!ok;cx++)
          if(reach[m.idx(cx,cy)])ok=true;
        if(!ok)miss.push(i);}
      if(miss.length){ badMaps++; if(miss.length>worst){worst=miss.length; sample={round,br,miss};} }
    }
    return JSON.stringify({maps:total, 有房间只能穿boss房才到: badMaps, worst, sample});})()`));
  process.exit(0);
})();
