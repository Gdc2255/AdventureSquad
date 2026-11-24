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

  // ===== 骑士：4 只真血量（2 血）的史莱姆围一圈，一次斩击应该全灭 =====
  await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true; return 1;})()`);
  await sleep(900);
  console.log('骑士（4 只 2 血史莱姆围一圈）:', await evalJS(`(()=>{const g=${G}; const p=g.player;
    g.enemies.slice(4).forEach(e=>g.killEnemy(e));
    const spots=[[50,0],[-50,0],[0,50],[0,-50]];
    g.enemies.forEach((e,i)=>{const s=spots[i]||[500,500];
      e.x=p.x+s[0]; e.y=p.y+s[1]; e.hp=2; e.maxHp=2; e.awake=false; e.speed=0;});
    p.aim=0;
    const k0=g.kills, n0=g.enemies.length;
    g.slashAttack();
    return JSON.stringify({斩杀:g.kills-k0, 剩敌:g.enemies.length, 原有:n0});})()`));

  // ===== 法师：4 只 2 血史莱姆围着法球落点，爆炸应该全灭 =====
  await evalJS(`(()=>{const g=${G}; g.startGame(1); g.levelStarted=true; return 1;})()`);
  await sleep(900);
  console.log('法师（4 只 2 血史莱姆围着落点）:', await evalJS(`(()=>{const g=${G}; const p=g.player; const m=g.map;
    g.enemies.slice(4).forEach(e=>g.killEnemy(e));
    p.aim=0;
    // 找一块开阔地：右边连续 4 格都不能是墙（法球撞墙会就地爆，得留出 3 格）
    let bx=0, by=0, found=false;
    for(let cy=2;cy<28&&!found;cy++)for(let cx=2;cx<60&&!found;cx++){
      let ok=true;
      for(let k=0;k<5;k++) if(m.solid(cx+k,cy)){ok=false;break;}
      if(ok && !m.solid(cx-1,cy) && !m.solid(cx,cy-1) && !m.solid(cx,cy+1)){ bx=cx; by=cy; found=true; }
    }
    if(!found) return 'no open spot';
    p.x=bx*32+16; p.y=by*32+16;
    const land={x:p.x+96,y:p.y};
    const spots=[[land.x+35,land.y],[land.x-35,land.y],[land.x,land.y+35],[land.x,land.y-35]];
    g.enemies.forEach((e,i)=>{const s=spots[i]||[land.x+500,land.y];
      e.x=s[0]; e.y=s[1]; e.hp=2; e.maxHp=2; e.awake=false; e.speed=0;});
    window.__k0=g.kills; window.__n0=g.enemies.length;
    g.orbAttack();
    return JSON.stringify({起点:[bx,by], 落点:[land.x,land.y]});})()`));
  await sleep(900);
  console.log('法师爆炸后:', await evalJS(`(()=>{const g=${G}; return JSON.stringify({斩杀:g.kills-window.__k0, 剩敌:g.enemies.length, 原有:window.__n0});})()`));

  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
