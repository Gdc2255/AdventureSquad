const fs = require('fs');
(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9222/json')).json(); if (targets.length) break; } catch (e) {} await new Promise(r => setTimeout(r, 500)); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + String((m.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
  };
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

  // 连跑 8 局：清光小怪 -> 进 Boss 房 -> 走到出口 -> 看是否进下一关
  for (let round = 1; round <= 8; round++) {
    await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true; return 1;})()`);
    await sleep(700);
    // 清光小怪（不算 Boss）
    await evalJS(`(()=>{const g=${G}; for(const e of g.enemies.slice()) g.damageEnemy(e,9999); return 1;})()`);
    await sleep(500);
    // 主角进 Boss 房，移到出口旁边
    const info = await evalJS(`(()=>{const g=${G}; const m=g.map;
      const br=m.rooms.findIndex(r=>r.isBoss); const room=m.rooms[br];
      g.player.x=(room.x+Math.floor(room.w/2))*32+16;
      g.player.y=(room.y+Math.floor(room.h/2))*32+16;
      g.player.invuln=999;
      // 站到出口正前方（出口所在墙的内侧那一格）
      const ex=m.exitCx, ey=m.exitCy;
      let tx=ex, ty=ey;
      if(m.roomOf[m.idx(ex,ey+1)]===br) ty=ey+1; else if(m.roomOf[m.idx(ex,ey-1)]===br) ty=ey-1;
      else if(m.roomOf[m.idx(ex+1,ey)]===br) tx=ex+1; else if(m.roomOf[m.idx(ex-1,ey)]===br) tx=ex-1;
      g.player.x=tx*32+16; g.player.y=ty*32+16;
      window.__tx=tx; window.__ty=ty;
      return JSON.stringify({exit:[ex,ey], stand:[tx,ty], exitOpen:m.exitOpen, smallCleared:m.smallCleared});})()`);
    await sleep(900);
    const after = await evalJS(`(()=>{const g=${G};
      return JSON.stringify({state:g.state, level:g.level, 升到:g.level});})()`);
    console.log(`第 ${round} 局 ${info} -> ${after}`);
  }
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
