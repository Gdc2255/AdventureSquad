// 回归测试：无尽模式 —— 清关自动进下一关、种子能复现同一局
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

  // 1) 开始界面有 3 个按钮
  await evalJS(`(()=>{const g=${G}; g.showMenu(); return 1;})()`);
  await sleep(600);
  console.log('开始界面:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({按钮:g.menuButtons.map(b=>b.title.string)});})()`));
  await snap('en_menu');

  // 2) 进无尽模式
  console.log('无尽模式:', await evalJS(`(()=>{const g=${G}; g.startGame(0,'endless');
    return JSON.stringify({mode:g.gameMode, seed:g.runSeed, 关卡:g.level, 敌人数:g.enemies.length,
      出口打开:g.map.exitOpen, 有出口节点:g.exitNode?g.exitNode.node.active:null});})()`));
  await sleep(700);

  // 3) 清光全图 -> 应该自动进第 2 关 + 弹强化
  console.log('清关后:', await evalJS(`(()=>{const g=${G};
    for(const e of g.enemies.slice()) g.damageEnemy(e,9999);
    return 'killed';})()`));
  await sleep(900);
  console.log('  结果:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({关卡:g.level, state:g.state, 敌人数:g.enemies.length,
      有强化卡:(g.upgradeCards||[]).length, 种子:g.runSeed, HUD:g.hudInfo?g.hudInfo.string:''});})()`));
  await snap('en_level2');

  // 4) 种子可复现：同一个种子跑出同样的地图
  console.log('种子复现:', await evalJS(`(()=>{const g=${G};
    const hash=(m)=>{let s=0;for(let i=0;i<m.tiles.length;i++)s=(s*31+m.tiles[i])>>>0;return s;};
    const seed=g.runSeed;
    // 用同一个种子重建第 1 关
    const m=g.map;
    const saved={tiles:m.tiles.slice(), rooms:m.rooms.length};
    g.runSeed=seed; g.buildLevel(1);
    const h1=hash(g.map);
    g.runSeed=seed; g.buildLevel(1);
    const h2=hash(g.map);
    g.buildLevel(2);
    return JSON.stringify({种子:seed, 两次生成一致:h1===h2, 第1关哈希:h1});})()`));

  // 5) 阵亡提示
  console.log('阵亡提示:', await evalJS(`(()=>{const g=${G};
    if(g.upgradeLayer){g.upgradeLayer.destroy();g.upgradeCards=[];}
    g.state=1; g.player.invuln=0; g.hurtPlayer(99);
    return JSON.stringify({state:g.state, 标题:g.ovTitle?g.ovTitle.string:null, 副标题:g.ovSub?g.ovSub.string:null});})()`));
  await snap('en_dead');
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
