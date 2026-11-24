# tools —— 开发辅助脚本

这些脚本不属于游戏本体，是**开发期的回归测试**和**美术工具**。
游戏本体只有 `assets/` 里的两个脚本文件（`Core.ts` 地图/碰撞、`Game.ts` 玩法）。

## 怎么用

测试脚本都是**无头浏览器**里跑真实构建产物，不是单元测试：

```bash
# 1) 构建游戏（产出 build/web-mobile/web-mobile）
"C:/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe" \
  --project "D:/cocos/AdventureSquad" \
  --build "platform=web-mobile;buildPath=D:/cocos/AdventureSquad/build/web-mobile;debug=false"

# 2) 起静态服务器
node tools/serve.js          # http://localhost:8099

# 3) 另开一个终端跑测试（需要 Chrome）
node tools/maze_check.js
```

> 测试脚本靠 **CDP（Chrome DevTools Protocol）** 驱动无头 Chrome：
> 用 `http://127.0.0.1:9222` 连上已在调试端口的 Chrome。
> 如果没起 Chrome，脚本会连不上（先 `chrome --headless=new --remote-debugging-port=9222`）。

## 回归测试（改完代码跑一遍）

| 脚本 | 检查什么 |
|---|---|
| `maze_check.js` | 迷宫不变量：没有死胡同走廊、没有无用的门、每个房间 ≥2 扇门 |
| `cut_test.js` | **Boss 房不能是「必经之路」**（否则有些房间只能穿 Boss 房才到，那局永远通不了） |
| `full_test.js` | 120 关真实流程的连通性 + Boss 血条状态机 |
| `walk_test.js` | 主角用游戏原本的移动逻辑能不能走到每个房间 |
| `enemy_test.js` | 每个房间的怪能不能找到主角（不会卡死在箱子角上） |
| `group_test.js` | 骑士/法师的**群体伤害**（一次攻击该清一片） |
| `clear_test.js` | 端到端：清光全图 → 走到出口 → 进下一关 |
| `endless_test.js` | 无尽模式：清关自动进下一关、种子可复现 |
| `shop_test.js` | 挑战模式选牌库（选 3 张 → 开战） |
| `newupg_test.js` | 22 张强化牌的属性是否都生效 |
| `audio_test.js` | 音频加载/播放、设置面板、伤害飘字、震屏 |

## 美术工具

| 脚本 | 作用 |
|---|---|
| `pixpng.js` | 自带的 **PNG 编码器**（zlib + CRC32，零依赖）+ 画图类（矩形/椭圆/描边/渐变） |
| `make_bosses.js` | 生成 Boss 像素图（古木守卫、虚空祭司）——`node tools/make_bosses.js` |
| `preview.js` | 把 PNG 放大 8 倍拼成预览图，方便肉眼挑素材 |
| `bigmap.js` / `mapdump.js` | 把整张地图导出成 PNG，看迷宫结构 |
| `mm_zoom.js` | 截小地图区域的放大图 |

## 辅助

| 脚本 | 作用 |
|---|---|
| `serve.js` | 本地静态服务器（给 `tools/` 里的测试用） |
| `bossbar.js` | Boss 血条的出现/隐藏时机 |

## 写新测试的套路

所有测试都是同一个骨架（见 `maze_check.js`）：

1. 用 CDP 连上无头 Chrome，`Page.navigate` 打开游戏；
2. `Runtime.evaluate` 拿到 `Game` 组件：`cc.director.getScene().getChildByName('Game').getComponent('Game')`；
3. 直接调游戏内部的方法/字段做断言；
4. 需要截图就 `Page.captureScreenshot`。

> **注意**：断言要用**游戏自己的规则**（`map.solid()` 之类），
> 别自己另写一套判定，否则测出来的东西和游戏实际行为对不上（这个坑踩过好几次）。
