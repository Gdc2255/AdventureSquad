## AdventureSquad v1.0.0

一个用 Cocos Creator 3.8.8 做的 2D 俯视角 roguelike 射击小游戏，玩法参考《元气骑士》。

### 怎么装

1. 下载下面两个文件（**必须放在同一个目录里**）：
   - `AdventureSquad-Setup-1.0.0.exe` —— 安装程序
   - `AdventureSquad-1.0.0.zip` —— 安装载荷
2. 双击 `AdventureSquad-Setup-1.0.0.exe`，点「开始安装」
3. 桌面上会出现「AdventureSquad」图标，双击开始游戏

装完得到：

```
%LOCALAPPDATA%\AdventureSquad\
  Game\              游戏本体（双击 play-game.bat 运行）
  Source\            项目源码（用 Cocos Creator 3.8.8 打开这个文件夹）
  安装与开发指引.txt   怎么玩 + 怎么继续开发
```

想直接试玩又不想装，可以只下载 `AdventureSquad-1.0.0.zip`，解压后进 `Game\` 双击 `play-game.bat`。

### 运行需要什么

游戏本体是网页版，需要一个本地 http 服务（浏览器的 `file://` 不允许读本地资源）：

- **Node.js**（推荐）https://nodejs.org ，或
- **Python** https://www.python.org

启动器会依次尝试这两个，都没有的话会提示你装一个。

### 玩法

| | |
|---|---|
| 模式 | **经典**（8 间房迷宫逐关推进，每关一个 Boss）、**挑战**（选牌库 + 纯 Boss 战）、**无尽**（一直打下去） |
| 角色 | 骑士（范围斩击，伤害 ×3）、法师（落点爆炸，伤害 ×4.5）、游侠（三把枪可换） |
| 操作 | WASD 移动 / 鼠标瞄准 / 左键攻击 / Shift 冲刺 / 1 2 3 换武器 / P 设置 / R 回主菜单 |

左上角会显示本局的**种子**，同一个种子能完整复现同一局，可以和朋友比成绩。

### 关于源码

`Source\` 里是完整的 Cocos Creator 工程，两个核心文件：

- `assets/scripts/Core.ts` —— 地图生成、瓦片碰撞
- `assets/scripts/Game.ts` —— 玩法全部在这里

用 Cocos Creator 3.8.8 打开 `Source\` 文件夹，等资源库导入完，打开 `assets/scenes/main.scene` 就能跑。

`Source\tools\` 里还有开发期用的回归测试脚本（需要构建一次 + 无头 Chrome），说明见 `tools/README.md`。

### 素材授权

美术和音效全部是 **CC0**（公共领域，可商用免署名）：

- Kenney —— [Roguelike RPG Pack](https://kenney.nl/assets/roguelike-rpg-pack)、[Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)、[Tiny Town](https://kenney.nl/assets/tiny-town)
- Kenney —— RPG Audio / Impact Sounds（音效）
- OpenGameArt —— 背景音乐

`boss2.png`（古木守卫）和 `boss4.png`（虚空祭司）是本项目用代码生成的。

代码以 **MIT** 授权发布。
