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
  await sleep(6000);
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

  // 1) 音频资源是否加载成功
  console.log('音频加载:', await evalJS(`(()=>{const g=${G};
    const a=g.audio;
    const keys=Object.keys(a.clips||{});
    return JSON.stringify({已加载:keys.length, 样本:keys.slice(0,6)});})()`));

  // 2) 播放音效
  console.log('播放音效:', await evalJS(`(()=>{const g=${G};
    const before=(g.audio.clips&&Object.keys(g.audio.clips).length)||0;
    g.audio.play('hit', 1);
    g.audio.playMusic('bgmBattle', 0.5);
    return JSON.stringify({有hit:!!g.audio.clips.hit, 已加载数:before});})()`));
  await sleep(800);
  console.log('  BGM 状态:', await evalJS(`(()=>{const g=${G};
    const m=g.audio;
    return JSON.stringify({当前BGM:m.curMusic, 音乐音量:m.musicVol, 音效音量:m.sfxVol});})()`));

  // 3) 设置面板
  await evalJS(`(()=>{const g=${G}; g.showMenu(); return 1;})()`);
  await sleep(600);
  await evalJS(`(()=>{const g=${G}; g.showSettings(); return 1;})()`);
  await sleep(500);
  console.log('设置面板:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({有面板:!!g.settingsLayer, 按钮:g.settingsBtns.map(b=>b.id),
      显示:g.settingsVals.map(v=>v.string)});})()`));
  await snap('set_panel');
  await evalJS(`(()=>{const g=${G}; if(g.settingsLayer){g.settingsLayer.destroy(); g.settingsLayer=null;} return 1;})()`);
  await sleep(500);
  const s3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/menu2.png', Buffer.from(s3.result.data, 'base64'));

  // 4) 改音量
  console.log('调音量:', await evalJS(`(()=>{const g=${G};
    const b=g.settingsBtns.find(x=>x.id==='music+');
    const before=g.audio.musicVol;
    g.clickSettings.call(g);
    return 'skip';})()`));
  await evalJS(`(()=>{const g=${G};
    // 模拟点击「音效+」按钮（直接调 setSfxVolume 等价路径）
    g.audio.setSfxVolume(g.audio.sfxVol+0.1);
    g.refreshSettings();
    return 1;})()`);
  await sleep(300);
  console.log('  改后:', await evalJS(`(()=>{const g=${G};
    return JSON.stringify({音乐:g.audio.musicVol, 音效:g.audio.sfxVol, 面板显示:g.settingsVals.map(v=>v.string)});})()`));

  // 5) 震屏 + 伤害数字
  console.log('打击感:', await evalJS(`(()=>{const g=${G};
    g.startGame(0,'classic'); g.levelStarted=true;
    const e=g.enemies[0]; e.hp=9999; e.maxHp=9999;
    const fx0=g.floatTexts.length;
    g.damageEnemy(e, 7);
    return JSON.stringify({飘字新增:g.floatTexts.length-fx0, 震屏中:g.shakeT>0, 顿帧:g.hitStop});})()`));
  await sleep(300);
  console.log('  飘字内容:', await evalJS(`(()=>{const g=${G};
    const ft=g.floatTexts[0];
    return ft? ft.node.getComponent(cc.Label).string : 'none';})()`));
  await snap('set_juice');
  await evalJS();
  await sleep(500);
  await evalJS();
  await sleep(400);
  const s2=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/set_panel2.png', Buffer.from(s2.result.data,'base64'));
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
