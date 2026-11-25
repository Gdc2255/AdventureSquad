// 把 3 张随机地图拼成一张 PNG 用来看迷宫结构
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
  // 把 3 张随机地图拼成一张大图导出
  const dataUrl = await evalJS(`(()=>{
    const g = ${G};
    const COLS = 84, ROWS = 30;
    const S = 5;
    const cv = document.createElement('canvas');
    cv.width = COLS * S * 3; cv.height = ROWS * S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0c12'; ctx.fillRect(0,0,cv.width,cv.height);
    for (let k = 0; k < 3; k++) {
      let seed = ((k+1) * 2654435761) >>> 0;
      const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      g.map.gen(rng, 1);
      const m = g.map;
      const ox = k * COLS * S;
      for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
        const t = m.tiles[m.idx(cx,cy)];
        if (t === 1) continue;               // 墙不画
        let col = '#3a4258';                 // 地面
        if (t === 2) col = '#ff5a5a';        // 门
        if (t === 3) col = '#5aff7a';        // 出口
        if (m.roomOf[m.idx(cx,cy)] < 0 && t === 0) col = '#57637f'; // 走廊
        ctx.fillStyle = col;
        ctx.fillRect(ox + cx*S, cy*S, S, S);
      }
      // 标出房间轮廓
      ctx.strokeStyle = '#8fa2d0'; ctx.lineWidth = 1;
      for (const r of m.rooms) ctx.strokeRect(ox + r.x*S+0.5, r.y*S+0.5, r.w*S-1, r.h*S-1);
    }
    return cv.toDataURL('image/png');
  })()`);
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
    fs.writeFileSync('C:/Users/26775/AppData/Local/Temp/maps.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('地图已导出 maps.png');
  } else {
    console.log('导出失败:', dataUrl);
  }
  process.exit(0);
})();
