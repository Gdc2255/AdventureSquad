// 回归测试：挑战模式的选牌库（挑 3 张 → 开战）
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
    if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + String((m.params.exceptionDetails.exception || '').description || '').split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[err] ' + m.params.args.map(a => a.value ?? a.description).join(' '));
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
  const snap = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`C:/Users/26775/AppData/Local/Temp/${name}.png`, Buffer.from(s.result.data, 'base64'));
  };

  // 1) 开始界面（无小字）
  await evalJS(`(()=>{const g=${G}; g.showMenu(); return 1;})()`);
  await sleep(500);
  console.log('开始界面:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({按钮:g.menuButtons.map(b=>({t:b.title.string, 有小字:!!b.sub}))});})()`));
  await snap('s_start');

  // 2) 挑战模式 -> 选牌库
  console.log('挑战模式进选牌库:', await evalJS(`(()=>{const g=${G};
    g.startGame(0,'challenge');
    return JSON.stringify({state:g.state, 有选牌库:!!g.shop, 牌数:g.shop?g.shop.cards.length:0, 
      牌库内容:g.shop?g.shop.pool.map(u=>u.name):[]});})()`));
  await sleep(600);
  await snap('s_shop');

  // 3) 选 3 张 -> 确认 -> 进竞技场
  console.log('选牌:', await evalJS(`(()=>{const g=${G};
    g.shop.toggle(0); g.shop.toggle(2); g.shop.toggle(4);
    const before={已选:g.shop.picked.length, 能否开战:g.shop.canConfirm(), 提示:g.shop.hint.string};
    g.shop.confirm();
    return JSON.stringify(before);})()`));
  await sleep(300);
  await snap('s_shop_picked');
  await sleep(600);
  console.log('开战:', await evalJS(`(()=>{const g=${G}; const boss=g.enemies.find(e=>e.kind===4);
    return JSON.stringify({state:g.state, 敌人数:g.enemies.length, boss名:boss?boss.bossStyle.name:null,
      血量:boss?boss.hp:null, 强化已生效:{伤害加:g.player.dmgBonus, 急速:g.player.rateMul}});})()`));
  await snap('s_fight');

  // 4) 招式频率（等概率）：把 Boss 血量压到各阶段，跑一段时间统计招式
  await evalJS(`(()=>{const g=${G};
    const boss=g.enemies.find(e=>e.kind===4);
    window.__seen=new Set(); window.__counts={};
    window.__samp=setInterval(()=>{
      g.player.invuln=999; g.player.hp=g.player.maxHp;   // 测试期间主角无敌
      const b=g.enemies.find(e=>e.kind===4);
      if(!b) return;
      const id=b.atkMove;
      if(id>=0){ const k=b.bossPhase+'_'+id; window.__counts[k]=(window.__counts[k]||0)+1; window.__seen.add(k); }
    },40);
    window.__boss=boss;
    return 1;})()`);
  for (const frac of [0.9, 0.5, 0.2]) {
    await evalJS(`(()=>{window.__boss.hp=window.__boss.maxHp*${frac}; return 1;})()`);
    await sleep(26000);
  }
  console.log('招式统计:', await evalJS(`(()=>{clearInterval(window.__samp);
    const c=window.__counts;
    const p1=Object.keys(c).filter(k=>k[0]==='1'), p2=Object.keys(c).filter(k=>k[0]==='2'), p3=Object.keys(c).filter(k=>k[0]==='3');
    const names={0:'环形弹幕',1:'召唤侍从',2:'黑洞吸引',3:'旋转螺旋',4:'激光扫场',5:'蓄力冲撞',6:'虚空落石',7:'螺旋逼近',8:'双束交叉',9:'召唤冲撞',10:'领域落石',11:'反向螺旋'};
    const fmt=(arr)=>arr.map(k=>names[k.split('_')[1]]+'x'+c[k]).join(' ');
    return JSON.stringify({阶段1:fmt(p1), 阶段2:fmt(p2), 阶段3:fmt(p3)});})()`));
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
