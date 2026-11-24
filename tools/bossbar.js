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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[err] ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.clearBrowserCache');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
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
  await sleep(900);
  // 清光小怪（让 Boss 房开门），再把主角送到 Boss 房中间
  await evalJS(`(()=>{const g=${G};
    for(const e of g.enemies.slice()) if(e.kind!==4) g.damageEnemy(e,9999);
    const m=g.map; const br=m.rooms.findIndex(r=>r.isBoss);
    const b=m.rooms[br];
    g.player.x=(b.x+Math.floor(b.w/2))*32+16;
    g.player.y=(b.y+Math.floor(b.h/2))*32+16;
    g.player.vx=0; g.player.vy=0;
    return 'moved';})()`);
  await sleep(700);
  console.log('B1 真进 Boss 房:', await evalJS(`(()=>{const g=${G};
    const boss=g.enemies.find(e=>e.kind===4);
    return JSON.stringify({bossBar:g.hudBossBg.node.active, bossName:g.hudBossName.node.active,
      bossSmallBar: boss?boss.bar.node.active:null, curRoom:g.curRoom, state:g.state});})()`));

  await evalJS(`(()=>{const g=${G}; g.player.invuln=0; g.hurtPlayer(99); return g.player.hp;})()`);
  await sleep(600);
  console.log('B2 阵亡后:', await evalJS(`(()=>{const g=${G};
    const boss=g.enemies.find(e=>e.kind===4);
    return JSON.stringify({bossBar:g.hudBossBg.node.active, bossFill:g.hudBossFill.node.active, bossName:g.hudBossName.node.active,
      bossSmallBar: boss?boss.bar.node.active:null, state:g.state});})()`));

  // 走真实流程：把主角放到出口 -> 触发进入下一关
  await evalJS(`(()=>{const g=${G}; g.showMenu(); return 1;})()`);
  await sleep(400);
  await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true;
    for(const e of g.enemies.slice()) g.damageEnemy(e,9999);   // 全清 -> 出口开
    return 1;})()`);
  await sleep(600);   // 等出口真的打开
  await evalJS(`(()=>{const g=${G}; const m=g.map;
    g.player.x=(m.exitCx+0.5)*32; g.player.y=(m.exitCy+0.5)*32;
    return JSON.stringify({exitOpen:m.exitOpen, exitCx:m.exitCx});})()`);
  await sleep(1200);
  console.log('B3 走到出口（应已进下一关+升级界面）:', await evalJS(`(()=>{const g=${G};
    const boss=g.enemies.find(e=>e.kind===4);
    return JSON.stringify({bossBar:g.hudBossBg.node.active, bossName:g.hudBossName.node.active,
      bossSmallBar: boss?boss.bar.node.active:null, state:g.state});})()`));

  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
