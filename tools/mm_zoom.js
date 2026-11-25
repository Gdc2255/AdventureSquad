// 截小地图区域的放大图
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
  await evalJS(`(()=>{const g=${G}; g.startGame(0); g.levelStarted=true; return 1;})()`);
  await sleep(1200);
  // 小地图在设计坐标的右上角：MM_X/MM_Y 是 UI 坐标(左下原点)，换算成屏幕
  const clip = JSON.parse(await evalJS(`(()=>{
    const r=document.getElementById('GameCanvas').getBoundingClientRect();
    const v=cc.view.getViewportRect(); const s=cc.view.getScaleX(), sy=cc.view.getScaleY();
    const vis=cc.view.getVisibleSize(); const ox=(vis.width-960)/2, oy=(vis.height-640)/2;
    const DW=960,DH=640, COLS=84, ROWS = 30, MM=2.8;
    const mmX=DW-COLS*MM-16, mmY=DH-ROWS*MM-14;         // UI 坐标(左下)
    const w=COLS*MM+8, h=ROWS*MM+8;
    const sx=r.left+v.x+(ox+mmX-6)*s, syTop=r.top+r.height-(v.y+(oy+mmY+h-6)*sy);
    return JSON.stringify({x:Math.round(sx), y:Math.round(syTop), width:Math.round(w*s), height:Math.round(h*sy)});})()`));
  console.log('小地图屏幕区域:', clip);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 5 } });
  fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/mm_zoom.png', Buffer.from(shot.result.data, 'base64'));
  const full = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/full.png', Buffer.from(full.result.data, 'base64'));
  console.log('已导出 mm_zoom.png / full.png');
  process.exit(0);
})();
