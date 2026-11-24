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
  await sleep(4500);
  const evalJS = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    const ex = r.result && r.result.exceptionDetails;
    if (ex) return 'EXC: ' + String((ex.exception && ex.exception.description) || ex.text).split('\n')[0];
    return r.result && r.result.result && r.result.result.value;
  };
  const G = `cc.director.getScene().getChildByName('Game').getComponent('Game')`;
  await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true; return 1;})()`);
  await sleep(1000);

  const rows = [];
  for (let ri = 0; ri < 12; ri++) {
    // 主角进到第 ri 号房间
    await evalJS(`(()=>{const g=${G}; const m=g.map; const r=m.rooms[${ri}];
      g.player.x=(r.x+Math.floor(r.w/2))*32+16;
      g.player.y=(r.y+Math.floor(r.h/2))*32+16;
      g.player.hp=g.player.maxHp; g.player.invuln=99;   // 别被怪打死
      return 1;})()`);
    await sleep(3500);   // 让怪跑过来（真实游戏循环）
    const r = await evalJS(`(()=>{const g=${G}; const m=g.map;
      const roomIdx=${ri};
      const es=g.enemies.filter(e=>e.room===roomIdx);
      // 法师怪本来就会保持距离，不算卡住
      const far=es.filter(e=>e.kind!==1 && Math.hypot(e.x-g.player.x,e.y-g.player.y)>170);
      const room=m.rooms[roomIdx];
      return JSON.stringify({room:roomIdx, n:es.length, far:far.length,
        player:[Math.round(g.player.x),Math.round(g.player.y)], curRoom:g.curRoom,
        roomBox:[room.x,room.y,room.w,room.h],
        es:es.map(e=>({k:e.kind,d:Math.round(Math.hypot(e.x-g.player.x,e.y-g.player.y)),
          p:[Math.round(e.x),Math.round(e.y)], awake:e.awake, stall:Math.round(e.stall*10)/10}))});})()`);
    rows.push(r);
    console.log(r);
  }
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
