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
  const res = await evalJS(`(()=>{const g=${G}; const COLS=84, ROWS = 30;
    const T_WALL=1, T_GATE=2, T_EMPTY=0;
    let stat={maps:0, deadEndTiles:0, uselessGates:0, wallHoles:0, oneDoorRooms:0, zeroDoorRooms:0, gatesOnWall:0};
    const sample={};
    for(let round=0; round<40; round++){
      let seed=(round+1)*2246822519>>>0;
      const rng=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;};
      const m=g.map; m.gen(rng,1);
      stat.maps++;
      const isOpen=(cx,cy)=>{ if(cx<0||cy<0||cx>=COLS||cy>=ROWS) return false;
        const t=m.tiles[cy*COLS+cx]; return t===T_EMPTY||t===T_GATE; };
      // 1) 走廊死胡同：走廊格(不在房间内)只有 1 个可走邻居
      for(let cy=0;cy<ROWS;cy++)for(let cx=0;cx<COLS;cx++){
        const i=cy*COLS+cx; const t=m.tiles[i];
        if(t!==T_EMPTY) continue;
        if(m.roomOf[i]>=0) continue;                 // 房间内不算
        let n=0;
        if(isOpen(cx+1,cy))n++; if(isOpen(cx-1,cy))n++; if(isOpen(cx,cy+1))n++; if(isOpen(cx,cy-1))n++;
        if(n<=1){ stat.deadEndTiles++; if(!sample.dead) sample.dead=[cx,cy]; }
      }
      // 2) 无用的门：门两侧(墙内/墙外)都不通
      for(let cy=0;cy<ROWS;cy++)for(let cx=0;cx<COLS;cx++){
        const i=cy*COLS+cx;
        if(m.tiles[i]!==T_GATE) continue;
        // 门是墙格，它的外侧(不是房间内的那一侧)必须通
        const inRoom=(cx-1>=0&&m.roomOf[cy*COLS+cx-1]>=0)||(cx+1<COLS&&m.roomOf[cy*COLS+cx+1]>=0)
          ||(cy-1>=0&&m.roomOf[(cy-1)*COLS+cx]>=0)||(cy+1<ROWS&&m.roomOf[(cy+1)*COLS+cx]>=0);
        let outside=0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx,ny=cy+dy; if(nx<0||ny<0||nx>=COLS||ny>=ROWS) continue;
          if(m.roomOf[ny*COLS+nx]>=0) continue;       // 房间内不算外侧
          if(isOpen(nx,ny)) outside++;
        }
        if(outside===0){ stat.uselessGates++; if(!sample.gate) sample.gate=[cx,cy]; }
      }
      // 3) 每个房间的门数
      for(const r of m.rooms){
        const n=r.gates.length/2;
        if(n===0) stat.zeroDoorRooms++;
        else if(n===1) stat.oneDoorRooms++;
      }
      // 4) 墙洞：墙格被走廊从外侧贴着 -> 统计走廊贴着房间墙的段数（走廊沿墙走）
      let hug=0;
      for(let cy=0;cy<ROWS;cy++)for(let cx=0;cx<COLS;cx++){
        const i=cy*COLS+cx; const t=m.tiles[i];
        if(t!==T_EMPTY||m.roomOf[i]>=0) continue;
        // 走廊格如果 4 邻居里有两个是墙，且其中之一属于房间环 -> 沿墙
        let walls=0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=cx+dx,ny=cy+dy; if(nx<0||ny<0||nx>=COLS||ny>=ROWS) continue;
          if(m.tiles[ny*COLS+nx]===T_WALL) walls++;
        }
        if(walls>=2) hug++;
      }
      stat.gatesOnWall+=hug;
    }
    return JSON.stringify({stat, sample});})()`);
  console.log(res);
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
