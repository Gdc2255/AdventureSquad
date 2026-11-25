// 回归测试：主角用游戏原本的移动逻辑能不能走到每个房间
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
  const res = await evalJS(`(()=>{const g=${G}; const TILE=32;
    const report={maps:0, walks:0, failed:0, samples:[]};
    for(let round=0; round<10; round++){
      let seed=(round+1)*2654435761>>>0;
      const rng=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;};
      g.buildLevel(round+1);
      const m=g.map; m.lockedRoom=-1; m.smallCleared=true;   // 门全开
      report.maps++;
      const r0=m.rooms[0];
      // 从主角的实际出生点出发（房间中心可能有箱子）
      const start={x:g.player.x, y:g.player.y};
      for(let ti=1; ti<m.rooms.length; ti++){
        const t=m.rooms[ti];
        let tx=(t.x+Math.floor(t.w/2))*TILE+16, ty=(t.y+Math.floor(t.h/2))*TILE+16;
        if(m.solid(Math.floor(tx/TILE),Math.floor(ty/TILE))){ for(let cy=t.y+1;cy<t.y+t.h-1;cy++){ let done=false; for(let cx=t.x+1;cx<t.x+t.w-1;cx++){ if(!m.solid(cx,cy)){ tx=cx*TILE+16; ty=cy*TILE+16; done=true; break; } } if(done) break; } }
        // 用游戏自己的碰撞 + 距离场走位
        const p={x:start.x, y:start.y};
        let ok=false, stuck=0, lastD=1e9;
        let safeX=p.x, safeY=p.y;   // 和游戏一样记录安全位置
        for(let step=0; step<4000; step++){
          const cx=Math.floor(p.x/TILE), cy=Math.floor(p.y/TILE);
          const d0=Math.hypot(p.x-tx,p.y-ty);
          if(d0<24){ ok=true; break; }        // 已经走到目标附近（一个身位）
          m.computeFlow(Math.floor(tx/TILE), Math.floor(ty/TILE));
          const nx=m.bestStep(cx,cy);
          if(!nx) break;
          const wx=nx.cx*TILE+16, wy=nx.cy*TILE+16;
          let dx=wx-p.x, dy=wy-p.y;
          const len=Math.hypot(dx,dy)||1;
          const ux=dx/len, uy=dy/len;
          const before={x:p.x,y:p.y};
          if(!m.collides(p.x,p.y,10)){ safeX=p.x; safeY=p.y; }
          m.move(p, 10, ux * 6, uy * 6);
          g.rescue(p, safeX, safeY);      // 和游戏一样：每帧脱困
          const moved=Math.hypot(p.x-before.x,p.y-before.y);
          if(moved<0.05){ stuck++; if(stuck>60) break; } else stuck=0;
          const d=Math.hypot(p.x-tx,p.y-ty);
          lastD=Math.min(lastD,d);
          if(d<20){ ok=true; break; }
        }
        report.walks++;
        if(!ok){ report.failed++; if(report.samples.length<6) report.samples.push({round, target:ti, lastDist:Math.round(lastD)}); }
      }
    }
    return JSON.stringify(report);})()`);
  console.log(res);
  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
