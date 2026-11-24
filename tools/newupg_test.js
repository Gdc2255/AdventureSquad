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
  const evalJS = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    const ex = r.result && r.result.exceptionDetails;
    if (ex) return 'EXC: ' + String((ex.exception && ex.exception.description) || ex.text).split('\n')[0];
    return r.result && r.result.result && r.result.result.value;
  };
  const G = `cc.director.getScene().getChildByName('Game').getComponent('Game')`;
  await sleep(5000);

  // 1) 两套表都有这 11 张，且数值不同
  console.log('牌库检查:', await evalJS(`(()=>{const g=${G};
    const NEW=['铁壁','坚韧','反伤','暴伤','处决','疾影','磁铁','收割','嗜血','狂暴','复仇'];
    const c=g.allUpgrades, ch=g.allChallengeUpgrades;
    const missC=NEW.filter(n=>!c.some(u=>u.name===n));
    const missCh=NEW.filter(n=>!ch.some(u=>u.name===n));
    const same=NEW.filter(n=>{const a=c.find(u=>u.name===n), b=ch.find(u=>u.name===n); return a&&b&&a.desc===b.desc;});
    return JSON.stringify({经典总数:c.length, 挑战总数:ch.length, 经典缺:missC, 挑战缺:missCh, 两表描述相同的牌:same});})()`));

  // 2) 每张牌的 apply 是否改对了属性
  console.log('逐张生效:', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); const p=g.player;
    const U=g.allUpgrades;
    const get=n=>U.find(u=>u.name===n);
    const snapDefaults={shieldMax:0, invulnTime:1.15, thorns:0, critMul:2, execMul:1, dashCdTime:1.0, dashTime:0.18, magnetMul:1, heartRate:0.22, hpOnHit:0, berserkMul:1, reviveEvery:0};
    const snap=()=>({shieldMax:p.shieldMax, invulnTime:p.invulnTime, thorns:p.thorns, critMul:p.critMul,
      execMul:p.execMul, dashCdTime:p.dashCdTime, dashTime:p.dashTime, magnetMul:p.magnetMul,
      heartRate:p.heartRate, hpOnHit:p.hpOnHit, berserkMul:p.berserkMul, reviveEvery:p.reviveEvery});
    const out={};
    for(const n of ['铁壁','坚韧','反伤','暴伤','处决','疾影','磁铁','收割','嗜血','狂暴','复仇']){
      p.shield=0;p.shieldMax=0;p.invulnTime=1.15;p.thorns=0;p.critMul=2;p.execMul=1;
      p.dashCdTime=1.0;p.dashTime=0.18;p.magnetMul=1;p.heartRate=0.22;p.hpOnHit=0;p.berserkMul=1;p.reviveEvery=0;
      get(n).apply(p);
      const s=snap(); const changed=Object.keys(s).filter(k=>s[k]!==snapDefaults[k]);
      out[n]=changed.map(k=>k+'='+s[k]).join(',');
    }
    return JSON.stringify(out);})()`));

  // 3) 实际战斗效果
  console.log('护盾挡伤害:', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.shieldMax=1; p.shield=1; p.hp=5; p.invuln=0;
    g.hurtPlayer(2);
    return JSON.stringify({hp:p.hp, 护盾:p.shield, 无敌中:p.invuln>0});})()`));

  console.log('反伤(骑士):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.thorns=3;
    p.invuln=0; const es=g.enemies.slice(0,1); const e=es[0]; e.hp=999; e.maxHp=999;
    const hp0=e.hp;
    g.hurtPlayer(1, e);
    return JSON.stringify({敌人掉血:hp0-e.hp, 主角掉血:5-p.hp});})()`));

  console.log('反伤(游侠不该有):', await evalJS(`(()=>{const g=${G}; g.startGame(2,'classic'); g.levelStarted=true;
    const p=g.player; p.thorns=0;
    p.invuln=0; const e=g.enemies[0]; e.hp=999; e.maxHp=999;
    const hp0=e.hp; g.hurtPlayer(1, e);
    return JSON.stringify({敌人掉血:hp0-e.hp, 主角掉血:p.maxHp-p.hp});})()`));

  console.log('暴伤/处决/狂暴:', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; const e=g.enemies[0];
    // 暴伤：必暴击
    p.critChance=1; p.critMul=3; e.hp=999; e.maxHp=999; const h0=e.hp;
    g.damageEnemy(e, 10); const critDmg=h0-e.hp;
    // 处决：残血敌人
    p.critChance=0; p.execMul=3; e.hp=10; e.maxHp=100; const h1=e.hp;
    g.damageEnemy(e, 10); const execDmg=h1-e.hp;
    // 狂暴：自己残血
    p.berserkMul=2; p.hp=1; p.maxHp=5; e.hp=999; e.maxHp=999; const h2=e.hp;
    g.damageEnemy(e, 10); const berserkDmg=h2-e.hp;
    return JSON.stringify({暴击伤害:critDmg, 处决伤害:execDmg, 狂暴伤害:berserkDmg});})()`));

  console.log('嗜血(命中回血):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.hp=2; p.maxHp=5; p.hpOnHit=0.3;
    const e=g.enemies[0]; e.hp=999; e.maxHp=999;
    g.damageEnemy(e, 1);
    return JSON.stringify({命中后血量:Math.round(p.hp*100)/100});})()`));

  console.log('复仇(20杀换1次复活):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.reviveEvery=2;
    const es=g.enemies.slice(0,2); es.forEach(e=>g.killEnemy(e));
    const got=p.reviveStock; const near=g.enemies.length;
    // 死一次，看会不会复活
    p.hp=1; p.invuln=0; g.hurtPlayer(99);
    return JSON.stringify({杀满20次后复活次数:got, 死亡后血量:p.hp, 还活着:g.state===1, 剩余次数:p.reviveStock});})()`));


  console.log('磁铁(掉落物被吸过来):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.magnetMul=3;
    const es=g.enemies.slice(); es.forEach(x=>g.killEnemy(x));   // 造掉落物
    const k=g.pickups[0];
    if(!k) return 'no pickup';
    k.x=p.x+120; k.y=p.y; k.node.setPosition(k.x,k.y,0);
    const d0=Math.abs(k.x-p.x);
    g.updatePickups(0.05);
    const d1=Math.abs(k.x-p.x);
    // 对照：没有磁铁时
    p.magnetMul=1; k.x=p.x+120; k.y=p.y;
    g.updatePickups(0.05);
    const d2=Math.abs(k.x-p.x);
    return JSON.stringify({有磁铁_吸附前:Math.round(d0), 有磁铁_一帧后:Math.round(d1),
      无磁铁_一帧后:Math.round(d2), 被吸过来了:d1<d0});})()`));

  console.log('收割(回心掉率):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic'); g.levelStarted=true;
    const p=g.player; p.heartRate=0.55;
    let heart=0, coin=0, n=0;
    for(let i=0;i<40;i++){
      const before=g.pickups.length;
      const e=g.enemies.find(x=>!x.dead);
      if(!e) break;
      g.killEnemy(e);
      for(let k=before;k<g.pickups.length;k++){ n++; if(g.pickups[k].kind===0) heart++; else coin++; }
    }
    return JSON.stringify({掉落总数:n, 回心:heart, 金币:coin});})()`));

  console.log('铁壁(每关补满护盾):', await evalJS(`(()=>{const g=${G}; g.startGame(0,'classic');
    const p=g.player; p.shieldMax=2; p.shield=2;
    p.shield=0;                        // 用掉
    g.buildLevel(2);                  // 换关
    return JSON.stringify({换关后护盾:p.shield, 上限:p.shieldMax});})()`));

  console.log('错误:', logs.length ? logs.join('\n') : '无');
  process.exit(0);
})();
