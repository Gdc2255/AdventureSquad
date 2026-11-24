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

  // ===== A. 连通性：120 关，带道具，用游戏自己的 solid() =====
  console.log('A 连通性:', await evalJS(`(()=>{const g=${G}; const COLS=84, ROWS = 30;
    const bad=[];
    for(let lv=1; lv<=120; lv++){
      g.buildLevel(lv);
      const m=g.map; m.lockedRoom=-1; m.smallCleared=true;   // 门全开
      const sx=Math.floor(g.player.x/32), sy=Math.floor(g.player.y/32);
      let s0=m.idx(sx,sy);
      if(m.solid(sx,sy)){let ok=false;
        for(let r=1;r<=4&&!ok;r++)for(let dy=-r;dy<=r&&!ok;dy++)for(let dx=-r;dx<=r&&!ok;dx++){
          const nx=sx+dx,ny=sy+dy; if(!m.solid(nx,ny)){s0=m.idx(nx,ny);ok=true;}}}
      const reach=new Uint8Array(COLS*ROWS);
      const q=[s0]; reach[s0]=1; let head=0;
      while(head<q.length){const cur=q[head++];const cx=cur%COLS,cy=(cur/COLS)|0;
        const nb=[[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
        for(const [nx,ny] of nb){if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;
          const ni=m.idx(nx,ny); if(reach[ni])continue; if(m.solid(nx,ny))continue;
          reach[ni]=1;q.push(ni);}}
      const miss=[];
      for(let i=0;i<m.rooms.length;i++){const r=m.rooms[i];let ok=false;
        for(let cy=r.y+1;cy<r.y+r.h-1&&!ok;cy++)for(let cx=r.x+1;cx<r.x+r.w-1&&!ok;cx++)
          if(reach[m.idx(cx,cy)])ok=true;
        if(!ok)miss.push(i);}
      if(miss.length) bad.push({lv,miss});
    }
    return JSON.stringify({levels:120, badLevels:bad.length, sample:bad.slice(0,5)});})()`));

  // ===== B. Boss 血条状态 =====
  await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true; return 1;})()`);
  await sleep(900);
  console.log('B1 进 Boss 房:', await evalJS(`(()=>{const g=${G}; const m=g.map;
    const br=m.rooms.findIndex(r=>r.isBoss);
    g.curRoom=br;                        // 假装进了 Boss 房
    return 'set';})()`));
  await sleep(400);
  console.log('   血条显示中?', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({bossBar:g.hudBossBg.active, bossName:g.hudBossName.active, state:g.state});})()`));

  await evalJS(`(()=>{const g=${G}; g.hurtPlayer(99); return 1;})()`);
  await sleep(500);
  console.log('B2 主角阵亡后:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({bossBar:g.hudBossBg.active, bossFill:g.hudBossFill.active, bossName:g.hudBossName.active, state:g.state});})()`));

  await evalJS(`(()=>{const g=${G}; g.buildLevel(2); return 1;})()`);
  await sleep(400);
  console.log('B3 进入下一关:', await evalJS(`(()=>{const g=${G};
    const boss=g.enemies.find(e=>e.kind===4);
    return JSON.stringify({bossBar:g.hudBossBg.active, bossName:g.hudBossName.active, state:g.state, level:g.level,
      bossSmallBar: boss ? boss.bar.node.active : null});})()`));

  // 升级界面里也不该有
  await evalJS(`(()=>{const g=${G}; g.showUpgrades(); return 1;})()`);
  await sleep(300);
  console.log('B4 升级界面:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({bossBar:g.hudBossBg.active, state:g.state});})()`));

  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
