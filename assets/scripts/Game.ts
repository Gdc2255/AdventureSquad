import {
    _decorator, Component, Node, Graphics, Sprite, SpriteFrame, Label, UITransform, Color, Vec2,
    input, Input, EventKeyboard, EventMouse, KeyCode, view, js, resources,
    HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
import {
    TILE, COLS, ROWS, DW, DH, MAP_W, MAP_H, T_EMPTY, T_WALL, T_GATE, T_EXIT, PROP_KEYS,
    CELL_COLS, CELL_ROWS,
    COL_SHADOW, COL_TEXT, COL_DARK, COL_HP, COL_HEART, COL_HEART_BG,
    COL_BULLET, COL_EBULLET, COL_GOLD, COL_GREEN, COL_FLASH, COL_HURT,
    MapGrid, mkNode, mkGfx, drawCircle, drawHeart, FILTER_POINT,
    TINT_FLOOR, TINT_FLOOR2, TINT_WALL, TINT_GRASS, TINT_PANEL,
} from './Core';
import { AudioSys } from './Audio';
import { FloatText } from './DamageText';

const { ccclass } = _decorator;

/** 小地图：每格多少像素 */
const MM_SCALE = 2.8;
const MM_X = DW - COLS * MM_SCALE - 16;
const MM_Y = DH - ROWS * MM_SCALE - 14;

/** 系统字体族：优先中文字体，找不到就回退默认 */
const FONT_CN = 'Microsoft YaHei, PingFang SC, SimHei, sans-serif';

/** 游戏状态 */
const ST_MENU = 0;
const ST_PLAY = 1;
const ST_UPGRADE = 2;
const ST_DEAD = 3;
const ST_SHOP = 4;    // 挑战模式：选牌库

/** 带种子的随机数（mulberry32）：同一个种子 = 完全相同的一局 */
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 经典模式的固定种子（= 1 号地图），整局都由它派生 */
const CLASSIC_SEED = 20240707;

const EK_SLIME = 0;
const EK_CASTER = 1;
const EK_BRUTE = 2;
const EK_GHOST = 3;
const EK_BOSS = 4;

/** 职业攻击方式 */
const ATK_GUN = 0;    // 射手：子弹（原来的枪）
const ATK_SLASH = 1;  // 骑士：近战斩击
const ATK_ORB = 2;    // 法师：法球飞出去后爆炸

/** 每关一套 Boss 造型：底图 + 名字 + 染色（轮换，每轮再微调色，保证每关都不一样） */
interface BossStyle {
    key: string;
    name: string;
    tint: Color;
}
const BOSS_STYLES: BossStyle[] = [
    { key: 'boss0', name: '霜 冠 领 主', tint: new Color(150, 205, 255) },
    { key: 'boss1', name: '炎 冠 君 王', tint: new Color(255, 170, 120) },
    { key: 'boss2', name: '古 木 守 卫', tint: new Color(210, 195, 130) },
    { key: 'boss3', name: '角 魔 将 军', tint: new Color(235, 145, 255) },
];

/** 挑战模式的 Boss：虚空祭司（三种攻击方式 + 三个阶段） */
const CHALLENGE_BOSS: BossStyle = { key: 'boss4', name: '虚 空 祭 司', tint: new Color(222, 196, 255) };

/** 挑战模式的强化牌库：只有这 3 种 */
const CHALLENGE_POOL_NAMES = ['力量', '急速', '暴击'];

/**
 * 虚空祭司的招式表（按阶段分组，**同阶段的招式等概率**抽）。
 * 阶段1 = 环形弹幕 / 召唤侍从 / 黑洞吸引 / 旋转螺旋
 * 阶段2 = 激光扫场 / 蓄力冲撞 / 虚空落石 / 螺旋逼近
 * 阶段3 = 双束交叉 / 召唤冲撞 / 领域落石 / 反向螺旋
 */
interface VoidMove {
    id: number;
    phase: number;
    name: string;
    dur: number;      // 持续时间
    cd: number;       // 结束后的冷却
}
const VOID_MOVES: VoidMove[] = [
    { id: 0, phase: 1, name: '环形弹幕', dur: 0.25, cd: 0.9 },
    { id: 1, phase: 1, name: '召唤侍从', dur: 0.25, cd: 3.5 },
    { id: 2, phase: 1, name: '黑洞吸引', dur: 2.4, cd: 3.6 },
    { id: 3, phase: 1, name: '旋转螺旋', dur: 2.6, cd: 1.4 },

    { id: 4, phase: 2, name: '激光扫场', dur: 3.0, cd: 2.2 },
    { id: 5, phase: 2, name: '蓄力冲撞', dur: 0.9, cd: 1.8 },
    { id: 6, phase: 2, name: '虚空落石', dur: 0.4, cd: 1.5 },
    { id: 7, phase: 2, name: '螺旋逼近', dur: 3.0, cd: 1.6 },

    { id: 8, phase: 3, name: '双束交叉', dur: 3.2, cd: 1.9 },
    { id: 9, phase: 3, name: '召唤冲撞', dur: 1.1, cd: 2.8 },
    { id: 10, phase: 3, name: '领域落石', dur: 3.0, cd: 2.4 },
    { id: 11, phase: 3, name: '反向螺旋', dur: 3.0, cd: 1.3 },
];

/** 需要的贴图（放在 assets/resources/knight/ 下） */
const SPRITE_KEYS = [
    'player', 'slime', 'caster', 'brute', 'ghost', 'person',
    'floor', 'grass', 'flowers', 'brick', 'wall', 'door', 'torch', 'arch',
    'crate', 'barrel', 'pot', 'rock', 'rubble', 'key', 'potion',
    'mushroom', 'bone', 'axe', 'coin', 'sword', 'wand', 'bush', 'hedge', 'fence', 'table', 'pillar', 'sign', 'skull',
    'boss0', 'boss1', 'boss2', 'boss3', 'boss4',
];

/** 武器 */
interface Weapon {
    name: string;
    key: string;
    dmg: number;
    cd: number;      // 射击间隔（秒）
    speed: number;   // 弹速
    count: number;   // 一次几发
    spread: number;  // 散射总角度（弧度）
    pierce: number;  // 穿透
    mag: number;     // 弹匣
    reload: number;  // 换弹秒数
    size: number;    // 子弹半径
    rotOff: number;   // 贴图自带朝向修正（贴图竖直朝上时为 -90）
    color: Color;
}

const WEAPONS: Weapon[] = [
    {
        name: '剑', key: 'sword', dmg: 1, cd: 0.16, speed: 640, count: 1, spread: 0,
        pierce: 0, mag: 12, reload: 1.0, size: 4, rotOff: -90, color: COL_BULLET,
    },
    {
        name: '斧', key: 'axe', dmg: 1, cd: 0.52, speed: 520, count: 5, spread: 0.62,
        pierce: 0, mag: 6, reload: 1.4, size: 4, rotOff: -135, color: new Color(255, 176, 120),
    },
    {
        name: '魔杖', key: 'wand', dmg: 2, cd: 0.30, speed: 430, count: 1, spread: 0,
        pierce: 1, mag: 10, reload: 1.2, size: 7, rotOff: -90, color: new Color(255, 140, 70),
    },
];

/** 可选角色 */
interface CharClass {
    key: string;
    name: string;
    desc: string;
    hp: number;
    speed: number;
    dmg: number;
    rate: number;
    mag: number;
    atk: number;      // 攻击方式
    weapon: string;   // 手里的武器贴图
    dmgMul: number;   // 伤害倍率
}

const CLASSES: CharClass[] = [
    { key: 'player', name: '骑 士', desc: '生命 5  ·  近战斩击  ·  高伤', hp: 5, speed: 225, dmg: 0, rate: 1, mag: 1, atk: ATK_SLASH, weapon: 'sword', dmgMul: 3 },
    { key: 'caster', name: '法 师', desc: '生命 3  ·  远程法球  ·  范围高伤', hp: 3, speed: 250, dmg: 1, rate: 1, mag: 0.8, atk: ATK_ORB, weapon: 'wand', dmgMul: 4.5 },   // 倍率 = 骑士的 1.5 倍
    { key: 'person', name: '游 侠', desc: '生命 4  ·  快速射击  ·  弹匣大', hp: 4, speed: 285, dmg: 0, rate: 1, mag: 1.6, atk: ATK_GUN, weapon: 'sword', dmgMul: 1 },
];

/** 强化 */
interface Upgrade {
    name: string;
    desc: string;
    icon: string;
    classes?: string[];      // 只给这些职业抽（不填 = 三个职业都有）
    apply: (p: Player) => void;
}

const UPGRADES: Upgrade[] = [
    { name: '力量', desc: '伤害 +1', icon: 'sword', apply: (p) => { p.dmgBonus += 1; } },
    { name: '急速', desc: '效率 +20%（攻击间隔 ×0.8）', icon: 'torch', apply: (p) => { p.rateMul *= 0.8; } },
    { name: '迅捷', desc: '移速 +15%', icon: 'person', apply: (p) => { p.speedMul *= 1.15; } },
    { name: '体魄', desc: '生命上限 +1 并回满', icon: 'potion', apply: (p) => { p.maxHp += 1; p.hp = p.maxHp; } },
    { name: '狙神', desc: '攻击距离 +1 格', icon: 'axe', apply: (p) => { p.rangeBonus += TILE; } },
    { name: '贯穿', desc: '穿透 +1', icon: 'key', apply: (p) => { p.pierce += 1; } },
    { name: '散射', desc: '每次多发 1 颗', icon: 'coin', apply: (p) => { p.extraShots += 1; } },
    { name: '暴击', desc: '暴击率 +15%（双倍伤害）', icon: 'axe', apply: (p) => { p.critChance += 0.15; } },
    { name: '吸血', desc: '击杀回复 1 点生命', icon: 'potion', apply: (p) => { p.lifesteal += 1; } },
    { name: '弹匣', desc: '弹匣容量 +30%', icon: 'barrel', apply: (p) => { p.magMul *= 1.3; } },
    { name: '弹跳', desc: '子弹撞墙会弹开', icon: 'rock', classes: ['person', 'caster'], apply: (p) => { p.bounce += 1; } },
    // —— 新增的 11 张 ——
    { name: '铁壁', desc: '护盾 +1，每关补回', icon: 'pillar', apply: (p) => { p.shieldMax += 1; p.shield = p.shieldMax; } },
    { name: '坚韧', desc: '受伤无敌 1.8s', icon: 'pillar', apply: (p) => { p.invulnTime = 1.8; } },
    { name: '反伤', desc: '被贴身攻击反弹 3 伤', icon: 'sword', classes: ['player'], apply: (p) => { p.thorns += 3; } },
    { name: '暴伤', desc: '暴击伤害 ×2 → ×3', icon: 'axe', apply: (p) => { p.critMul = 3; } },
    { name: '处决', desc: '残血敌人受伤 ×3', icon: 'skull', apply: (p) => { p.execMul = 3; } },
    { name: '疾影', desc: '冲刺冷却 0.5s', icon: 'person', apply: (p) => { p.dashCdTime = 0.5; p.dashTime = 0.26; } },
    { name: '磁铁', desc: '拾取范围 ×3', icon: 'coin', apply: (p) => { p.magnetMul *= 3; } },
    { name: '收割', desc: '回心掉率 22% → 55%', icon: 'potion', apply: (p) => { p.heartRate = 0.55; } },
    { name: '嗜血', desc: '命中回 0.3 生命', icon: 'potion', apply: (p) => { p.hpOnHit = 0.3; } },
    { name: '狂暴', desc: '残血时伤害 ×2', icon: 'brute', apply: (p) => { p.berserkMul = 2; } },
    { name: '复仇', desc: '拿上后每杀 20 敌得 1 次复活', icon: 'skull', apply: (p) => { p.reviveEvery = 20; } },
];

/**
 * 挑战模式专用的强化表：**数值比经典模式高一档**，而且和经典模式**互不相通**
 * （挑战模式只可能拿到这里的牌，经典模式只可能拿到上面的 UPGRADES）。
 * 挑战模式只有 3 张牌、面对一只 300 血的 Boss，所以每张牌都要有明显的体感。
 */
/**
 * 强化品质：3 = 传说（彩框）/ 2 = 史诗（金框）/ 1 = 稀有（银框）。
 * 选牌库按这个**从高到低排序**，越前面越强。
 */
const UPGRADE_TIER: { [name: string]: number } = {
    复仇: 3, 狂暴: 3, 暴伤: 3, 处决: 3, 暴击: 3,
    铁壁: 2, 贯穿: 2, 散射: 2, 弹跳: 2, 嗜血: 2, 弹匣: 2, 疾影: 2, 磁铁: 2, 反伤: 2, 狙神: 2,
    力量: 1, 急速: 1, 迅捷: 1, 体魄: 1, 坚韧: 1, 收割: 1, 吸血: 1,
};

const CHALLENGE_UPGRADES: Upgrade[] = [
    { name: '力量', desc: '伤害 +2', icon: 'sword', apply: (p) => { p.dmgBonus += 2; } },
    { name: '急速', desc: '效率 +30%（攻击间隔 ×0.7）', icon: 'torch', apply: (p) => { p.rateMul *= 0.7; } },
    { name: '迅捷', desc: '移速 +25%', icon: 'person', apply: (p) => { p.speedMul *= 1.25; } },
    { name: '体魄', desc: '生命上限 +2 并回满', icon: 'potion', apply: (p) => { p.maxHp += 2; p.hp = p.maxHp; } },
    { name: '狙神', desc: '攻击距离 +2 格', icon: 'axe', apply: (p) => { p.rangeBonus += TILE * 2; } },
    { name: '贯穿', desc: '穿透 +2', icon: 'key', apply: (p) => { p.pierce += 2; } },
    { name: '散射', desc: '每次多发 1 颗', icon: 'coin', apply: (p) => { p.extraShots += 1; } },
    { name: '暴击', desc: '暴击率 +25%（双倍伤害）', icon: 'axe', apply: (p) => { p.critChance += 0.25; } },
    { name: '吸血', desc: '击杀回复 1 点生命', icon: 'potion', apply: (p) => { p.lifesteal += 1; } },
    { name: '弹匣', desc: '弹匣容量 +55%', icon: 'barrel', apply: (p) => { p.magMul *= 1.55; } },
    { name: '弹跳', desc: '子弹撞墙弹 1 次', icon: 'rock', classes: ['person', 'caster'], apply: (p) => { p.bounce += 1; } },
    // —— 新增的 11 张（挑战模式数值略高）——
    { name: '铁壁', desc: '护盾 +2，每关补回', icon: 'pillar', apply: (p) => { p.shieldMax += 2; p.shield = p.shieldMax; } },
    { name: '坚韧', desc: '受伤无敌 2.2s', icon: 'pillar', apply: (p) => { p.invulnTime = 2.2; } },
    { name: '反伤', desc: '被贴身攻击反弹 5 伤', icon: 'sword', classes: ['player'], apply: (p) => { p.thorns += 5; } },
    { name: '暴伤', desc: '暴击伤害 ×2 → ×4', icon: 'axe', apply: (p) => { p.critMul = 4; } },
    { name: '处决', desc: '残血敌人受伤 ×4', icon: 'skull', apply: (p) => { p.execMul = 4; } },
    { name: '疾影', desc: '冲刺冷却 0.4s', icon: 'person', apply: (p) => { p.dashCdTime = 0.4; p.dashTime = 0.3; } },
    { name: '磁铁', desc: '拾取范围 ×5', icon: 'coin', apply: (p) => { p.magnetMul *= 5; } },
    { name: '收割', desc: '回心掉率 22% → 75%', icon: 'potion', apply: (p) => { p.heartRate = 0.75; } },
    { name: '嗜血', desc: '命中回 0.5 生命', icon: 'potion', apply: (p) => { p.hpOnHit = 0.5; } },
    { name: '狂暴', desc: '残血时伤害 ×2.5', icon: 'brute', apply: (p) => { p.berserkMul = 2.5; } },
    { name: '复仇', desc: '拿上后每杀 15 敌得 1 次复活', icon: 'skull', apply: (p) => { p.reviveEvery = 15; } },
];

/** 子弹 */
class Bullet {
    node: Node;
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    r = 4;
    dmg = 1;
    life = 1.3;
    fromPlayer = true;
    pierce = 0;
    bounce = 0;        // 还能弹几次墙
    hitIds: number[] = [];
    dead = false;

    constructor(parent: Node, x: number, y: number, vx: number, vy: number, fromPlayer: boolean, color: Color, size: number, pierce: number) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.fromPlayer = fromPlayer;
        this.r = size; this.pierce = pierce;
        const n = mkNode(parent, 'bullet');
        this.node = n;
        n.setPosition(x, y, 0);
        const g = mkGfx(n, 'glow');
        g.circle(0, 0, this.r);
        g.fillColor = color;
        g.fill();
        const core = mkGfx(n, 'core');
        core.circle(0, 0, this.r * 0.42);
        core.fillColor = Color.WHITE;
        core.fill();
    }

    dispose(): void {
        this.node.destroy();
    }
}

/** 掉落物：0 = 回心，1 = 金币 */
class Pickup {
    node: Node;
    x = 0;
    y = 0;
    r = 12;
    kind = 0;
    dead = false;

    constructor(parent: Node, kind: number, x: number, y: number, coin: SpriteFrame | null) {
        this.kind = kind; this.x = x; this.y = y;
        const n = mkNode(parent, 'pickup');
        this.node = n;
        n.setPosition(x, y, 0);
        if (kind === 0) {
            const g = mkGfx(n, 'heart');
            drawHeart(g, 0, 0, 9, COL_HEART);
        } else {
            const g = mkGfx(n, 'coin');
            g.circle(0, 0, 8);
            g.circle(0, 0, 4);
            g.fillColor = COL_GOLD;
            g.fill();
            g.strokeColor = new Color(196, 140, 30);
            g.lineWidth = 2;
            g.stroke();
        }
    }

    dispose(): void {
        this.node.destroy();
    }
}

/** 敌人：外层节点管位置，内层 sprite 管动画偏移 */
class Enemy {
    node: Node;
    spriteNode: Node;
    bar: Graphics;
    kind = 0;
    x = 0;
    y = 0;
    r = 12;
    hp = 2;
    maxHp = 2;
    speed = 92;
    dmg = 1;
    shootCd = 1.5;
    bob = 0;
    room = 0;
    wpX = 0;
    wpY = 0;
    wpValid = false;
    awake = false;   // 玩家进到这间房才醒（不然全图怪一起冲过来）
    flash = -1;      // 被暴击时的闪白时间（-1 = 没在闪）
    bossStyle: BossStyle | null = null;
    tinted = false;
    safeX = 0;       // 上一帧没卡住的位置（被卡住时退回这里）
    safeY = 0;
    stall = 0;       // 连续多久没靠近主角了（卡住检测）
    lastDist = 0;
    stallSide = 1;   // 卡住时往哪边绕（固定住，别每帧左右乱抖）
    wpAltTried = false;   // 卡住时是否已经改走过次优路线
    // —— Boss 专用 ——
    bossKind = 0;    // 0 = 普通 Boss（环形弹幕），1 = 虚空祭司（多段攻击）
    bossPhase = 1;   // 阶段 1/2/3
    invulnT = 0;     // 无敌时间（阶段切换）
    spiralA = 0;     // 螺旋弹幕角度
    ringCd = 0;      // 环形爆裂冷却
    chargeCd = 0;    // 冲撞冷却
    chargeT = 0;     // 冲撞剩余时间
    dashX = 0;
    dashY = 0;
    mx = 0;           // 本帧的移动方向（AI 写入）
    my = 0;
    atkMove = -1;     // 当前的招式编号
    atkT = 0;         // 当前招式剩余时间
    atkCd = 0;        // 到下一次出招的冷却
    fieldT = 0;       // 黑洞吸引剩余时间
    fieldX = 0;
    fieldY = 0;
    laserA = 0;       // 激光角度
    laserT = 0;       // 激光剩余时间
    dead = false;

    constructor(parent: Node, kind: number, x: number, y: number, sf: SpriteFrame, room: number, level: number) {
        this.kind = kind; this.x = x; this.y = y; this.room = room;
        if (kind === EK_SLIME) {
            this.hp = 2; this.maxHp = 2; this.speed = 88; this.r = 12; this.dmg = 1;
        } else if (kind === EK_CASTER) {
            this.hp = 1; this.maxHp = 1; this.speed = 66; this.r = 11; this.dmg = 1;
        } else if (kind === EK_BRUTE) {
            this.hp = 6; this.maxHp = 6; this.speed = 56; this.r = 15; this.dmg = 2;
        } else if (kind === EK_BOSS) {
            this.hp = 46 + 14 * level; this.maxHp = this.hp;
            this.speed = 52; this.r = 26; this.dmg = 2;
        } else {
            this.hp = 3; this.maxHp = 3; this.speed = 104; this.r = 11; this.dmg = 1;
        }
        const n = mkNode(parent, 'enemy');
        this.node = n;
        n.setPosition(x, y, 0);

        const sn = mkNode(n, 'sprite');
        this.spriteNode = sn;
        const sp = sn.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const size = kind === EK_BOSS ? TILE * 2 : TILE;
        sn.getComponent(UITransform)!.setContentSize(size, size);
        sp.spriteFrame = sf;

        this.bar = mkGfx(n, 'bar');
        this.bar.node!.setPosition(0, this.r + 9, 0);
        this.drawBar();
    }

    drawBar(): void {
        const w = this.r * 1.9;
        const ratio = Math.max(0, this.hp / this.maxHp);
        this.bar.clear();
        if (ratio > 0) {
            this.bar.rect(-w / 2, -2, w * ratio, 4);
            this.bar.fillColor = COL_HP;
            this.bar.fill();
        }
    }

    dispose(): void {
        this.node.destroy();
    }
}

/** 玩家 */
class Player {
    node: Node;
    spriteNode: Node;
    weaponNode: Node;
    x = 0;
    y = 0;
    r = 10;
    speed = 225;
    hp = 4;
    maxHp = 4;
    fireCd = 0;
    invuln = 0;
    dashCd = 0;
    dashT = 0;
    dashX = 1;
    dashY = 0;
    aim = 0;
    bob = 0;
    // 武器与强化
    weaponIdx = 0;
    ammo: number[] = [];
    reloadT = 0;
    dmgBonus = 0;
    rateMul = 1;
    speedMul = 1;
    bulletSpeedMul = 1;
    rangeBonus = 0;      // 攻击距离加成（像素，1 格 = 32）
    magMul = 1;
    extraShots = 0;
    pierce = 0;
    bounce = 0;       // 弹墙次数（弹跳强化）
    clsKey = '';    // 当前职业 key（限制某些强化只给特定职业）
    critChance = 0;   // 暴击率
    lifesteal = 0;    // 每次击杀回血
    atkType = ATK_GUN; // 攻击方式（由职业决定）
    dmgMul = 1;       // 伤害倍率（由职业决定）
    // —— 强化带来的属性 ——
    shield = 0;       // 当前护盾（抵挡伤害）
    shieldMax = 0;    // 护盾上限（每关开始补满）
    invulnTime = 1.15; // 受伤后的无敌时间
    critMul = 2;      // 暴击伤害倍率
    execMul = 1;      // 处决倍率（对残血敌人）
    berserkMul = 1;   // 狂暴倍率（自己残血时）
    thorns = 0;       // 反伤（骑士专属）
    hpOnHit = 0;      // 嗜血：每次命中回血
    dashCdTime = 1.0; // 冲刺冷却
    dashTime = 0.18;  // 冲刺时长
    magnetMul = 1;    // 磁铁：拾取范围倍率
    heartRate = 0.22; // 收割：回心掉率
    reviveEvery = 0;  // 复仇：每杀多少个怪获得一次复活
    reviveCounter = 0;
    reviveStock = 0;  // 手里攒着的复活次数

    constructor(parent: Node, sf: SpriteFrame, weaponSf: SpriteFrame) {
        const n = mkNode(parent, 'player');
        this.node = n;

        const shadow = mkGfx(n, 'shadow');
        shadow.node!.setPosition(0, -10, 0);
        shadow.ellipse(0, 0, 11, 5);
        shadow.fillColor = COL_SHADOW;
        shadow.fill();

        const sn = mkNode(n, 'sprite');
        this.spriteNode = sn;
        const sp = sn.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sn.getComponent(UITransform)!.setContentSize(TILE, TILE);
        sp.spriteFrame = sf;

        const wn = mkNode(n, 'weapon');
        this.weaponNode = wn;
        wn.setPosition(12, 0, 0);
        const wsp = wn.addComponent(Sprite);
        wsp.sizeMode = Sprite.SizeMode.CUSTOM;
        wn.getComponent(UITransform)!.setContentSize(18, 18);
        wsp.spriteFrame = weaponSf;
    }

    /** 应用所选角色的初始属性 */
    applyClass(c: CharClass): void {
        this.clsKey = c.key;
        this.atkType = c.atk;
        this.dmgMul = c.dmgMul;
        this.maxHp = c.hp;
        this.hp = c.hp;
        this.speed = c.speed;
        this.dmgBonus = c.dmg;
        this.rateMul = c.rate;
        this.magMul = c.mag;
        // **把上一局拿到的强化全部清掉**（重新开始应该从零开始）
        this.speedMul = 1;
        this.bulletSpeedMul = 1;
        this.rangeBonus = 0;
        this.extraShots = 0;
        this.pierce = 0;
        this.bounce = 0;
        this.critChance = 0;
        this.lifesteal = 0;
        // 新增的强化属性也要一起清掉
        this.shield = 0;
        this.shieldMax = 0;
        this.invulnTime = 1.15;
        this.critMul = 2;
        this.execMul = 1;
        this.berserkMul = 1;
        this.thorns = 0;
        this.hpOnHit = 0;
        this.dashCdTime = 1.0;
        this.dashTime = 0.18;
        this.magnetMul = 1;
        this.heartRate = 0.22;
        this.reviveEvery = 0;
        this.reviveCounter = 0;
        this.reviveStock = 0;
        this.ammo = WEAPONS.map((w) => Math.max(1, Math.round(w.mag * this.magMul)));
        this.reloadT = 0;
    }

    get reloading(): boolean {
        return this.reloadT > 0;
    }
}

/** 一次性特效（枪口火光） */
const FX_FLASH = 0;
const FX_SLASH = 1;
const FX_ORB = 2;
const FX_BOOM = 3;

class Fx {
    node: Node;
    g: Graphics;
    g2: Graphics | null = null;
    g3: Graphics | null = null;
    kind = FX_FLASH;
    t = 0;
    life = 0.08;
    x = 0;
    y = 0;
    tx = 0;
    ty = 0;
    vx = 0;         // 法球速度
    vy = 0;
    travel = 0;     // 已飞距离
    dist = 0;       // 飞行距离预算
    bounce = 0;     // 还能弹几次墙
    angle = 0;
    range = 0;
    arc = 0;
    radius = 0;
    color = new Color(255, 255, 255);

    constructor(parent: Node, x: number, y: number, kind: number, color: Color, layers = 1) {
        this.kind = kind;
        this.x = x;
        this.y = y;
        this.color = color;
        this.g = mkGfx(parent, 'fx');
        this.node = this.g.node!;
        this.node.setPosition(x, y, 0);
        if (layers > 1) this.g2 = mkGfx(this.node, 'fx2');
        if (layers > 2) this.g3 = mkGfx(this.node, 'fx3');
    }

    /** 画一段圆环带（剑气）：用折线拼多边形，不依赖 arc 的路径连接 */
    private band(g: Graphics, rIn: number, rOut: number, a0: number, a1: number, color: Color): void {
        if (rOut <= rIn) return;
        const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.1));
        g.moveTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
        for (let i = 1; i <= steps; i++) {
            const a = a0 + (a1 - a0) * (i / steps);
            g.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
        }
        for (let i = steps; i >= 0; i--) {
            const a = a0 + (a1 - a0) * (i / steps);
            g.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
        }
        g.fillColor = color;
        g.fill();
    }

    update(dt: number): boolean {
        this.t += dt;
        const k = this.t / this.life;
        if (k >= 1) {
            this.node.destroy();
            return false;
        }
        const g = this.g;
        g.clear();
        if (this.kind === FX_SLASH) {
            // 斩击：前方挥出的月牙剑光（判定是整圈范围伤害，但只画剑光，不画冲击环）
            const sweep = Math.min(1, k / 0.28);
            const fade = 1 - k * k;               // 前段亮、后段快速消失
            const half = (this.arc / 2) * sweep;
            const s0 = this.angle - half;
            const s1 = this.angle + half;
            const rOut = this.range;
            const rIn = this.range * 0.58;
            // 外圈：剑气柔光
            if (this.g2) {
                this.g2.clear();
                this.band(this.g2, rOut - 15, rOut, s0, s1, new Color(90, 180, 255, 110 * fade));
            }
            // 白色亮边
            if (this.g3) {
                this.g3.clear();
                this.band(this.g3, rOut - 4, rOut, s0, s1, new Color(255, 255, 255, 235 * fade));
            }
            // 内圈：挥出的剑光（月牙）
            this.band(g, rIn, rIn + 12, s0, s1, new Color(190, 240, 255, 220 * fade));
        } else if (this.kind === FX_ORB) {
            // 法球：位置由 Game 每帧更新（要支持撞墙反弹），这里只画
            g.circle(0, 0, this.radius);
            g.fillColor = new Color(this.color.r, this.color.g, this.color.b, 235);
            g.fill();
            g.circle(0, 0, this.radius * 0.55);
            g.strokeColor = new Color(255, 255, 255, 210);
            g.lineWidth = 2;
            g.stroke();
        } else if (this.kind === FX_BOOM) {
            // 爆炸：扩散的冲击环
            const r = this.radius * (0.3 + 0.8 * k);
            g.circle(0, 0, r);
            g.fillColor = new Color(this.color.r, this.color.g, this.color.b, Math.max(0, 95 * (1 - k)));
            g.fill();
            g.circle(0, 0, r);
            g.strokeColor = new Color(255, 240, 200, Math.max(0, 235 * (1 - k)));
            g.lineWidth = 3;
            g.stroke();
        } else {
            // 枪口火光
            const s = 1 - k;
            this.node.setScale(s, s);
            g.circle(0, 0, 8);
            g.fillColor = new Color(this.color.r, this.color.g, this.color.b, Math.max(0, 225 * (1 - k)));
            g.fill();
        }
        return true;
    }
}

/** 一张可选卡（角色 / 强化） */
class Card {
    node: Node;
    x = 0;
    y = 0;
    w = 260;
    h = 320;
    icon: Sprite;
    title: Label;
    desc: Label;
    panel: Graphics;

    constructor(parent: Node, x: number, y: number, w: number, h: number, title: string, desc: string, iconKey: string | null, sfs: { [k: string]: SpriteFrame }) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.node = mkNode(parent, 'card');
        this.node.setPosition(x + this.w / 2, y + this.h / 2, 0);
        this.panel = mkGfx(this.node, 'panel');
        this.panel.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 12);
        this.panel.fillColor = new Color(28, 32, 44, 240);
        this.panel.fill();
        this.panel.strokeColor = new Color(90, 100, 125, 255);
        this.panel.lineWidth = 3;
        this.panel.stroke();

        // 卡面元素按高度缩放，这样同一张卡能放大也能缩小（选牌库里用小卡）
        const k = this.h / 280;
        if (iconKey && sfs[iconKey]) {
            const sp = mkNode(this.node, 'icon');
            sp.setPosition(0, this.h / 2 - 86 * k, 0);
            const s = sp.addComponent(Sprite);
            s.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.getComponent(UITransform)!.setContentSize(72 * k, 72 * k);
            s.spriteFrame = sfs[iconKey];
        }
        this.title = this.mkText(this.node, 'title', 0, this.h / 2 - 142 * k, 26 * k, title);
        this.desc = this.mkText(this.node, 'desc', 0, this.h / 2 - 178 * k, 16 * k, desc);
    }

    private mkText(parent: Node, name: string, x: number, y: number, size: number, text: string): Label {
        const n = mkNode(parent, name);
        n.setPosition(x, y, 0);
        const t = n.getComponent(UITransform)!;
        t.setAnchorPoint(0.5, 0.5);
        t.setContentSize(this.w - 20, size + 8);
        const label = n.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = COL_TEXT;
        label.fontFamily = FONT_CN;
        label.enableWrapText = true;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.string = text;
        return label;
    }

    hit(mx: number, my: number): boolean {
        return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
    }
}

/** 菜单按钮（开始界面的「经典模式 / 挑战模式」） */
class MenuButton {
    node: Node;
    id = '';
    x = 0;
    y = 0;
    w = 300;
    h = 84;
    panel: Graphics;
    title: Label;
    sub: Label | null = null;

    constructor(parent: Node, x: number, y: number, w: number, h: number, id: string, title: string, sub: string) {
        this.x = x; this.y = y; this.w = w; this.h = h; this.id = id;
        this.node = mkNode(parent, 'btn');
        this.node.setPosition(x + w / 2, y + h / 2, 0);
        this.panel = mkGfx(this.node, 'panel');
        this.panel.roundRect(-w / 2, -h / 2, w, h, 14);
        this.panel.fillColor = new Color(26, 31, 45, 245);
        this.panel.fill();
        this.panel.strokeColor = new Color(112, 128, 170, 255);
        this.panel.lineWidth = 2;
        this.panel.stroke();
        const fs2 = Math.min(26, Math.max(14, Math.round(h * 0.5)));
        this.title = this.mkText(this.node, 'title', 0, sub ? 13 : 0, fs2, title);
        this.title.color = new Color(255, 232, 168);
        if (sub) {
            this.sub = this.mkText(this.node, 'sub', 0, -16, 14, sub);
            this.sub.color = new Color(168, 180, 210);
        }
    }

    private mkText(parent: Node, name: string, x: number, y: number, size: number, text: string): Label {
        const n = mkNode(parent, name);
        n.setPosition(x, y, 0);
        const t = n.getComponent(UITransform)!;
        t.setAnchorPoint(0.5, 0.5);
        t.setContentSize(this.w - 24, size + 8);
        const label = n.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = COL_TEXT;
        label.fontFamily = FONT_CN;
        label.enableWrapText = true;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.string = text;
        return label;
    }

    hit(mx: number, my: number): boolean {
        return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
    }
}

/**
 * 挑战模式的选牌库（模仿金铲铲之战「大橘大利」的**局外构筑**）：
 * 把你自己的牌库整副摊开，**每种强化只有一张**，从中挑 3 张出战卡组，
 * 不能重复选、没有刷牌。牌面按金铲铲的品级分色（银 / 金 / 彩）。
 */
class ShopUI {
    node: Node;
    cards: Card[] = [];
    pool: Upgrade[] = [];        // 整副牌库（每种一张）
    picked: number[] = [];       // 已选的牌（牌库下标）
    onConfirm: ((upgrades: Upgrade[]) => void) | null = null;
    private sfs: { [k: string]: SpriteFrame };
    private slotPanels: Graphics[] = [];
    private slotLabels: Label[] = [];
    private slotIcons: Sprite[] = [];
    private hint: Label;
    private confirmBtn: MenuButton;
    private scrollbar!: Graphics;
    private cardBaseX: number[] = [];   // 每张牌未滚动时的位置
    private cardBaseY: number[] = [];
    private contentH = 0;
    private maxScroll = 0;
    private scrollY = 0;
    private scrollTrackW = 6;
    private scrollViewH = 336;
    private rows = 1;          // 牌库总行数
    private visibleRows = 2;    // 一屏显示几行
    private rowH = 168;        // 行高（含间距）
    private scrollAccum = 0;    // 滚轮累积量（够半行就换一行）
    private viewBottom = 188;   // 牌库可视区下边界（正好 2 行）
    private viewTop = 524;      // 牌库可视区上边界

    constructor(parent: Node, sfs: { [k: string]: SpriteFrame }, pool: Upgrade[], onConfirm: (u: Upgrade[]) => void) {
        this.sfs = sfs;
        // **按品质从高到低排序**（传说 → 史诗 → 稀有）
        this.pool = pool.slice().sort((a, b) => (UPGRADE_TIER[b.name] || 0) - (UPGRADE_TIER[a.name] || 0));
        this.onConfirm = onConfirm;
        this.node = mkNode(parent, 'shopLayer');

        const dim = mkGfx(this.node, 'dim');
        const vis = view.getVisibleSize();
        dim.rect(-(vis.width - DW) / 2, -(vis.height - DH) / 2, vis.width, vis.height);
        dim.fillColor = new Color(6, 8, 14, 245);
        dim.fill();

        // 标题
        const title = this.mkLabel(this.node, 'title', DW / 2, DH - 66, 32, '挑 战 准 备', true);
        title.color = new Color(255, 226, 150);
        const sub = this.mkLabel(this.node, 'sub', DW / 2, DH - 98, 16,
            '从你的强化牌库里选 3 张（每种只有一张，不能重复选）', true);
        sub.color = new Color(170, 182, 212);

        // 牌库：整副摊开，**放进可滚动容器**（牌多了屏幕放不下，用滚轮上下翻）
        const cw = 132;
        const ch = 158;
        const gap = 10;
        const cols = 6;
        const rows = Math.max(1, Math.ceil(this.pool.length / cols));
        const gridW = cols * cw + (cols - 1) * gap;
        const rowH = ch + gap;
        // 可视区（牌池窗口）：高度正好是「整行高度 × 可见行数」，滚动按整行吸附
        const viewBottom = this.viewBottom;
        const viewTop = this.viewTop;
        const visibleRows = Math.max(1, Math.floor((viewTop - viewBottom) / rowH));
        const viewH = visibleRows * rowH;          // 正好整数行
        const viewW = gridW + 26;
        const x0 = (DW - gridW) / 2;

        // 牌直接摆在本层（不用 Mask 容器）：滚动时按可视范围显隐，效果一样且更稳
        this.cards = [];
        this.cardBaseX = [];
        this.cardBaseY = [];
        for (let i = 0; i < this.pool.length; i++) {
            const u = this.pool[i];      // 用排序后的牌库（品质从高到低）
            const r = Math.floor(i / cols);
            const col = i % cols;
            const cx = x0 + col * (cw + gap);
            const cy = viewTop - ch - r * rowH;   // cy 是底边：�� 0 行的顶边正好贴着 viewTop
            const c = new Card(this.node, cx, cy, cw, ch, u.name, u.desc, u.icon, sfs);
            this.cards.push(c);
            this.cardBaseX.push(cx);
            this.cardBaseY.push(cy);
        }
        this.rows = rows;
        this.visibleRows = visibleRows;
        this.rowH = rowH;
        this.contentH = (rows - 1) * rowH + ch;
        this.maxScroll = Math.max(0, (rows - visibleRows) * rowH);   // 只按整行滚
        this.scrollY = 0;
        this.scrollAccum = 0;

        // 滚动条（右侧）
        this.scrollbar = mkGfx(this.node, 'scrollbar');
        this.scrollbar.node.setPosition((DW - viewW) / 2 + viewW - 9, (viewBottom + viewTop) / 2, 0);
        this.scrollTrackW = 6;
        this.scrollViewH = viewH;

        // 已选槽位（3 个）
        const sw = 200;
        const sgap = 14;
        const stotal = 3 * sw + 2 * sgap;
        const sx0 = (DW - stotal) / 2;
        const slotY = 104;
        for (let i = 0; i < 3; i++) {
            const p = mkGfx(this.node, 'slot' + i);
            p.roundRect(sx0 + i * (sw + sgap), slotY, sw, 52, 10);
            p.fillColor = new Color(24, 28, 40, 240);
            p.fill();
            p.strokeColor = new Color(74, 84, 112, 255);
            p.lineWidth = 2;
            p.stroke();
            this.slotPanels.push(p);
            const lb = this.mkLabel(this.node, 'slotLb' + i, sx0 + i * (sw + sgap) + sw / 2 + 8, slotY + 26, 17, '', true);
            lb.color = new Color(210, 220, 245);
            this.slotLabels.push(lb);
            const ic = mkNode(this.node, 'slotIc' + i);
            ic.setPosition(sx0 + i * (sw + sgap) + 28, slotY + 26, 0);
            const sp = ic.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            ic.getComponent(UITransform)!.setContentSize(24, 24);
            sp.spriteFrame = sfs['sword'];
            ic.active = false;
            this.slotIcons.push(sp);
        }

        // 开始挑战
        this.confirmBtn = new MenuButton(this.node, (DW - 220) / 2, 16, 220, 50, 'confirm', '开 始 挑 战', '');
        this.hint = this.mkLabel(this.node, 'hint', DW / 2, slotY + 66, 15, '', true);
        this.hint.color = new Color(255, 214, 120);

        this.applyScroll();   // 先把超出可视范围的牌隐藏
        this.refresh();
    }

    /** 滚轮：上下滚动牌库（**一次滚轮 = 一整行**，所以看到的永远是整齐的几行） */
    scroll(delta: number): void {
        if (this.maxScroll <= 0) return;
        // Cocos 的 getScrollY() 和浏览器的 deltaY **符号相反**：
        // 往下滚滚（getScrollY < 0）应该看到更下面的牌 -> scrollY 增大
        const dir = delta > 0 ? -1 : 1;
        const next = this.scrollY + dir * this.rowH;
        if (next < 0 || next > this.maxScroll) return;
        this.scrollY = next;
        this.applyScroll();
    }

    /** 按滚动位置更新每张牌的位置，超出可视范围的隐藏掉 */
    private applyScroll(): void {
        const bottom = this.viewBottom;
        const top = this.viewTop;
        for (let i = 0; i < this.cards.length; i++) {
            const c = this.cards[i];
            const y = this.cardBaseY[i] + this.scrollY;      // 往下滚 = 内容上移
            c.y = y;
            c.node.setPosition(this.cardBaseX[i] + c.w / 2, y + c.h / 2, 0);
            // **整张卡都在可视区内才显示**（露出半张会压住下面的卡组槽位）
            // y 是卡片的「底边」，卡顶 = y + c.h
            c.node.active = (y + c.h <= top) && (y >= bottom);
        }
        // 滚动条
        this.scrollbar.clear();
        const trackH = this.scrollViewH;
        this.scrollbar.rect(-this.scrollTrackW / 2, -trackH / 2, this.scrollTrackW, trackH);
        this.scrollbar.fillColor = new Color(40, 46, 64, 200);
        this.scrollbar.fill();
        if (this.maxScroll > 0) {
            // 滑块按「行」跳（和卡片同步），一共 rows-visibleRows+1 个停靠位
            const stops = Math.max(1, this.rows - this.visibleRows + 1);
            const knobH = Math.max(26, trackH / stops);
            const idx = Math.round(this.scrollY / this.rowH);
            // 往下滚（scrollY 变大）滑块要往**下**走
            const knobY = trackH / 2 - knobH / 2 - (idx / Math.max(1, stops - 1)) * (trackH - knobH);
            this.scrollbar.rect(-this.scrollTrackW / 2, knobY - knobH / 2, this.scrollTrackW, knobH);
            this.scrollbar.fillColor = new Color(150, 170, 210, 255);
            this.scrollbar.fill();
        }
    }

    private mkLabel(parent: Node, name: string, x: number, y: number, size: number, text: string, bold: boolean): Label {
        const n = mkNode(parent, name);
        n.setPosition(x, y, 0);
        const t = n.getComponent(UITransform)!;
        t.setAnchorPoint(0.5, 0.5);
        t.setContentSize(DW, size + 8);
        const label = n.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = COL_TEXT;
        label.fontFamily = FONT_CN;
        label.enableWrapText = true;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.string = text;
        if (bold) label.enableBold = true;
        return label;
    }

    /** 品质配色（传说=彩 / 史诗=金 / 稀有=银） */
    private tierColor(u: Upgrade): Color {
        const t = UPGRADE_TIER[u.name] || 0;
        if (t >= 3) return new Color(226, 182, 84, 255);    // 传说：金
        if (t === 2) return new Color(198, 132, 255, 255);  // 史诗：紫
        return new Color(168, 186, 214, 255);               // 稀有：银
    }

    /** 刷新卡面状态 */
    refresh(): void {
        for (let i = 0; i < this.cards.length; i++) {
            const c = this.cards[i];
            const u = this.pool[i];
            const hit = this.picked.indexOf(i) >= 0;
            c.panel.fillColor = hit ? new Color(44, 62, 48, 250) : new Color(26, 30, 42, 245);
            c.panel.strokeColor = hit ? new Color(120, 230, 150, 255) : this.tierColor(u);
            c.panel.lineWidth = hit ? 4 : 2.5;
            c.panel.stroke();
            c.title.color = hit ? new Color(150, 240, 170) : new Color(235, 240, 250);
        }
        // 已选槽位
        for (let i = 0; i < 3; i++) {
            const idx = this.picked[i];
            const lb = this.slotLabels[i];
            const ic = this.slotIcons[i];
            if (idx >= 0) {
                const up = this.pool[idx];
                lb.string = up.name;
                ic.active = !!this.sfs[up.icon];
                if (this.sfs[up.icon]) ic.getComponent(Sprite)!.spriteFrame = this.sfs[up.icon];
                this.slotPanels[i].strokeColor = this.tierColor(up);
                this.slotPanels[i].stroke();
            } else {
                lb.string = '';
                ic.active = false;
                this.slotPanels[i].strokeColor = new Color(74, 84, 112, 255);
                this.slotPanels[i].stroke();
            }
        }
        this.hint.string = this.picked.length >= 3 ? '卡组成型，可以开战了！' : `已选 ${this.picked.length} / 3`;
        this.hint.color = this.picked.length >= 3 ? new Color(120, 230, 150) : new Color(255, 214, 120);
    }

    /** 点牌：选中 / 取消（不能重复选同一张） */
    toggle(i: number): void {
        const at = this.picked.indexOf(i);
        if (at >= 0) { this.picked.splice(at, 1); this.refresh(); return; }
        if (this.picked.length >= 3) return;
        this.picked.push(i);
        this.refresh();
    }

    canConfirm(): boolean {
        return this.picked.length === 3;
    }

    confirm(): void {
        if (!this.canConfirm() || !this.onConfirm) return;
        const ups = this.picked.map((i) => this.pool[i]).filter((u) => !!u) as Upgrade[];
        this.onConfirm(ups);
    }

    hitButton(mx: number, my: number): 'confirm' | null {
        if (this.confirmBtn.hit(mx, my)) return 'confirm';
        return null;
    }

    hitCard(mx: number, my: number): number {
        for (let i = 0; i < this.cards.length; i++) {
            if (this.cards[i].hit(mx, my)) return i;
        }
        return -1;
    }
}

/**
 * 游戏主控：所有内容都在代码里生成，没有预制体。
 */
@ccclass('Game')
export class Game extends Component {
    private canvas!: Node;
    private world!: Node;
    private ui!: Node;
    private floorLayer!: Node;
    private mapLayer!: Node;
    private decorLayer!: Node;
    private entityLayer!: Node;
    private fxLayer!: Node;
    private crosshair!: Graphics;
    private map = new MapGrid();

    private sfs: { [k: string]: SpriteFrame } = {};

    private player!: Player;
    private enemies: Enemy[] = [];
    private bullets: Bullet[] = [];
    private pickups: Pickup[] = [];
    private fx: Fx[] = [];
    private doorGlow: Graphics | null = null;

    private level = 1;
    private pendingLevel = 1;
    private camX = 0;
    private camY = 0;
    private curRoom = -1;          // 当前所在房间（走廊为 -1）
    private gateNodes: { node: Node; cx: number; cy: number; a: number; b: number }[] = [];
    private exitNode: Sprite | null = null;
    private hudMapBg!: Graphics;
    private hudMapDoor!: Graphics;
    private hudMapDoorLock!: Graphics;
    private hudMapPoint!: Graphics;
    private hudMapRooms!: Graphics;
    private hudMapPath!: Graphics;
    private hudMapExit!: Graphics;
    private hudMapPlayer!: Graphics;
    private hudMapCleared!: Graphics;
    private coins = 0;
    private kills = 0;
    private state = ST_MENU;
    private started = false;
    private pendingUpgrades: Upgrade[] = [];

    private keys: { [k: number]: boolean } = {};
    private lastPx = 0;
    private lastPy = 0;
    private flowTimer = 0;
    private flowTx = -1;
    private flowTy = -1;
    private safeX = 0;
    private safeY = 0;
    /** 主角这一关第一次动了没有：动了才正式开始，敌人之前原地待命 */
    private levelStarted = false;
    private mouse = new Vec2(DW / 2, DH / 2);
    private firing = false;

    private hudLayer!: Node;
    private hudBossBg!: Graphics;
    private hudBossFill!: Graphics;
    private hudBossName!: Label;
    private hudHpBg!: Graphics;
    private hudHpFill!: Graphics;
    private hudHpText!: Label;
    private hudInfo!: Label;
    private hudTip!: Label;
    private hudWeapon!: Sprite;
    private hudAmmo!: Graphics;
    private hudWeaponName!: Label;
    private overlay!: Node;
    private ovTitle!: Label;
    private ovSub!: Label;
    private menuLayer!: Node;
    private menuCards: Card[] = [];
    private menuButtons: MenuButton[] = [];
    private menuPage: 'start' | 'class' = 'start';
    private menuMode: 'classic' | 'challenge' | 'endless' = 'classic';
    private menuTitle!: Label;
    private upgradeLayer!: Node;
    private upgradeCards: Card[] = [];
    private upgradeTitle!: Label;

    private rng: () => number = makeRng((Math.random() * 0xffffffff) >>> 0);
    private runSeed = CLASSIC_SEED;      // 本局种子（可分享、可复现）
    private gameMode: 'classic' | 'challenge' | 'endless' = 'classic';
    private shop: ShopUI | null = null; // 挑战模式的选牌库
    /** 两套强化表（供图鉴 UI / 调试查询） */
    readonly allUpgrades: Upgrade[] = UPGRADES;
    readonly allChallengeUpgrades: Upgrade[] = CHALLENGE_UPGRADES;
    private bossFx!: Graphics;
    private audio!: AudioSys;      // 音频系统
    private settingsLayer: Node | null = null;   // 设置面板
    private settingsBtns: MenuButton[] = [];     // 设置面板里的按钮
    private settingsVals: Label[] = [];         // 设置面板里的数值文本
    private floatTexts: FloatText[] = [];   // 伤害飘字
    // —— 打击感 ——
    private shakeT = 0;             // 震屏剩余时间
    private shakeMag = 0;           // 震屏强度
    private shakeDur = 0.18;        // 震屏时长
    private hitStop = 0;            // 顿帧（命中瞬间冻结几帧）
    private showDmgNum = true;      // 是否显示伤害数字
    private shakeOn = true;         // 震屏开关
    private shieldRing!: Graphics;
    /** 虚空落石：预警 → 爆炸 */
    private pendingBlasts: { x: number; y: number; t: number; r: number }[] = [];

    onLoad(): void {
        this.canvas = this.node.scene!.getChildByName('Canvas')!;
        this.world = mkNode(this.canvas, 'World');
        this.world.setPosition(-DW / 2, -DH / 2, 0);
        this.ui = mkNode(this.canvas, 'UI');
        this.ui.setPosition(-DW / 2, -DH / 2, 0);

        this.floorLayer = mkNode(this.world, 'floorLayer');
        this.mapLayer = mkNode(this.world, 'mapLayer');
        this.decorLayer = mkNode(this.world, 'decorLayer');
        this.entityLayer = mkNode(this.world, 'entityLayer');
        this.fxLayer = mkNode(this.world, 'fxLayer');
        this.bossFx = mkGfx(this.fxLayer, 'bossFx');

        // 音频系统
        this.audio = new AudioSys(this.canvas);
        this.audio.load();
        this.loadSettings();
        this.crosshair = mkGfx(this.world, 'crosshair');
        this.shieldRing = mkGfx(this.world, 'shieldRing');

        this.loadAssets(() => {
            this.buildHud();
            this.buildFloor();
            this.player = new Player(this.entityLayer, this.sfs['player'], this.sfs['sword']);
            this.showMenu();
            this.started = true;
        });
    }

    // ------------------------------------------------------------------ 资源

    private loadAssets(done: () => void): void {
        let left = SPRITE_KEYS.length;
        if (left <= 0) { done(); return; }
        for (const k of SPRITE_KEYS) {
            resources.load(`knight/${k}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) {
                    sf.texture.setFilters(FILTER_POINT, FILTER_POINT);
                    this.sfs[k] = sf;
                }
                if (--left <= 0) done();
            });
        }
    }

    private mkSprite(parent: Node, name: string, key: string, size: number): Sprite {
        const n = mkNode(parent, name);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        n.getComponent(UITransform)!.setContentSize(size, size);
        sp.spriteFrame = this.sfs[key];
        return sp;
    }

    /** 地板：只铺可走的地方（房间 + 走廊），每关重建 */
    private buildFloor(): void {
        this.floorLayer.destroyAllChildren();
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                if (this.map.at(cx, cy) !== T_EMPTY) continue;
                const h = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
                const isBrick = (h % 17) === 0;
                const sp = this.mkSprite(this.floorLayer, 'f', isBrick ? 'brick' : 'floor', TILE);
                const v = 0.9 + ((h >>> 8) % 100) / 100 * 0.2;
                const base = isBrick ? TINT_FLOOR2 : TINT_FLOOR;
                sp.color = new Color(base.r * v, base.g * v, base.b * v);
                sp.node.setPosition(cx * TILE + TILE / 2, cy * TILE + TILE / 2, 0);
            }
        }
    }

    /** 四周压暗，做出地牢的纵深感 */
    private buildVignette(): void {
        const bands = 7;
        const bw = 26;
        for (let i = 0; i < bands; i++) {
            const a = 52 - i * 7;
            if (a <= 0) break;
            const g = mkGfx(this.ui, 'vig' + i);
            const o = i * bw;
            g.rect(o, o, DW - o * 2, bw);
            g.rect(o, DH - o - bw, DW - o * 2, bw);
            g.rect(o, o, bw, DH - o * 2);
            g.rect(DW - o - bw, o, bw, DH - o * 2);
            g.fillColor = new Color(0, 0, 0, a);
            g.fill();
        }
    }

    // ------------------------------------------------------------------ 输入

    onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    private onKeyDown(e: EventKeyboard): void {
        this.keys[e.keyCode] = true;
        if (e.keyCode === KeyCode.KEY_R && this.state === ST_DEAD) this.showMenu();
        if (e.keyCode === KeyCode.KEY_P) {
            if (this.settingsLayer) { this.settingsLayer.destroy(); this.settingsLayer = null; }
            else this.showSettings();
        }
        // 1 / 2 / 3 切武器
        if (this.state === ST_PLAY && this.player.atkType === ATK_GUN) {
            if (e.keyCode === KeyCode.DIGIT_1) this.switchWeapon(0);
            else if (e.keyCode === KeyCode.DIGIT_2) this.switchWeapon(1);
            else if (e.keyCode === KeyCode.DIGIT_3) this.switchWeapon(2);
        }
    }

    private onKeyUp(e: EventKeyboard): void {
        this.keys[e.keyCode] = false;
    }

    private onMouseMove(e: EventMouse): void {
        this.readMouse(e);
    }

    private onMouseDown(e: EventMouse): void {
        this.readMouse(e);
        if (e.getButton() !== 0) return;
        if (this.state === ST_MENU) { this.clickMenu(); return; }
        if (this.state === ST_UPGRADE) { this.clickUpgrade(); return; }
        if (this.state === ST_SHOP) { this.clickShop(); return; }
        this.firing = true;
    }

    /** 滚轮：选牌库里上下滚动牌库 */
    private onMouseWheel(e: EventMouse): void {
        if (this.state !== ST_SHOP || !this.shop) return;
        this.shop.scroll(e.getScrollY());
    }

    private onMouseUp(e: EventMouse): void {
        if (e.getButton() === 0) this.firing = false;
    }

    private readMouse(e: EventMouse): void {
        const p = e.getUILocation();
        this.mouse.set(p.x, p.y);
    }

    /**
     * 鼠标相对玩家的方向（用「屏幕/设计空间」算，不是世界坐标），
     * 这样摄像机在房间之间平移时，瞄准方向不会突然甩一下。
     */
    private get aimDir(): Vec2 {
        const vis = view.getVisibleSize();
        const ox = (vis.width - DW) / 2;
        const oy = (vis.height - DH) / 2;
        const p = this.player;
        const mx = this.mouse.x - ox;
        const my = this.mouse.y - oy;
        return new Vec2(mx - (p.x - this.camX), my - (p.y - this.camY));
    }

    /** 鼠标在 UI（设计）坐标系里的位置，卡片点击用 */
    private get mouseUI(): Vec2 {
        const vis = view.getVisibleSize();
        const ox = (vis.width - DW) / 2;
        const oy = (vis.height - DH) / 2;
        return new Vec2(this.mouse.x - ox, this.mouse.y - oy);
    }

    private keyDown(...codes: number[]): boolean {
        for (const c of codes) {
            if (this.keys[c]) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ 菜单 / 强化

    /** 第 level 关的 Boss 造型：底图轮换，每轮染色再微调，保证每关都不一样 */
    private bossStyleOf(level: number): BossStyle {
        const base = BOSS_STYLES[(level - 1) % BOSS_STYLES.length];
        const cycle = Math.floor((level - 1) / BOSS_STYLES.length);
        const k = 1 - cycle * 0.12;
        return {
            key: base.key,
            name: base.name,
            tint: new Color(
                Math.max(60, Math.min(255, base.tint.r * k)),
                Math.max(60, Math.min(255, base.tint.g * k)),
                Math.max(60, Math.min(255, base.tint.b * k)),
            ),
        };
    }

    /** 开始界面：先选模式（经典 / 挑战），再选职业 */
    private showMenu(): void {
        this.state = ST_MENU;
        this.audio.playMusic('bgmMenu', 0.5);
        if (this.hudLayer) this.hudLayer.active = false;
        this.hideOverlay();
        this.firing = false;
        this.menuPage = 'start';
        if (this.menuLayer) this.menuLayer.destroy();   // 别把上一层的菜单留在屏幕上
        this.menuLayer = mkNode(this.ui, 'menuLayer');
        const dim = mkGfx(this.menuLayer, 'dim');
        const vis = view.getVisibleSize();
        dim.rect(-(vis.width - DW) / 2, -(vis.height - DH) / 2, vis.width, vis.height);
        dim.fillColor = new Color(6, 8, 14, 235);
        dim.fill();

        this.menuTitle = this.mkLabel(this.menuLayer, 'title', DW / 2, DH - 92, 42, '骑 士 小 队', true);
        this.menuTitle.color = new Color(255, 226, 150);
        this.mkLabel(this.menuLayer, 'sub', DW / 2, DH - 128, 18, '选一个模式开始', true);

        this.menuButtons = [];
        const bw = 340;
        const bh = 84;
        this.menuButtons.push(new MenuButton(this.menuLayer, (DW - bw) / 2, 306, bw, bh, 'classic',
            '经 典 模 式', ''));
        this.menuButtons.push(new MenuButton(this.menuLayer, (DW - bw) / 2, 208, bw, bh, 'challenge',
            '挑 战 模 式', ''));
        this.menuButtons.push(new MenuButton(this.menuLayer, (DW - bw) / 2, 110, bw, bh, 'endless',
            '无 尽 模 式', ''));
        this.menuButtons.push(new MenuButton(this.menuLayer, DW - 132, 40, 92, 44, 'settings', '设 置', ''));
        this.mkLabel(this.menuLayer, 'hint', DW / 2, 74, 18, 'WASD 移动   ·   鼠标瞄准   ·   左键攻击   ·   Shift 冲刺', true);
    }

    /** 职业选择页 */
    private showClassPick(mode: 'classic' | 'challenge' | 'endless'): void {
        this.menuMode = mode;
        this.menuPage = 'class';
        if (this.menuLayer) this.menuLayer.destroy();
        this.menuLayer = mkNode(this.ui, 'menuLayer');
        const dim = mkGfx(this.menuLayer, 'dim');
        const vis = view.getVisibleSize();
        dim.rect(-(vis.width - DW) / 2, -(vis.height - DH) / 2, vis.width, vis.height);
        dim.fillColor = new Color(6, 8, 14, 235);
        dim.fill();

        this.menuTitle = this.mkLabel(this.menuLayer, 'title', DW / 2, DH - 92, 36, '选 择 你 的 英 雄', true);
        this.menuTitle.color = new Color(255, 226, 150);
        this.mkLabel(this.menuLayer, 'sub', DW / 2, DH - 126, 16,
            mode === 'classic' ? '经典模式 · 随机迷宫'
            : (mode === 'challenge' ? '挑战模式 · 纯 Boss 战' : '无尽模式 · 一直打下去'), true);

        this.menuCards = [];
        const cw = 240;
        const ch = 290;
        const gap = 30;
        const total = CLASSES.length * cw + (CLASSES.length - 1) * gap;
        const x0 = (DW - total) / 2;
        const y0 = 140;
        for (let i = 0; i < CLASSES.length; i++) {
            const c = CLASSES[i];
            const card = new Card(this.menuLayer, x0 + i * (cw + gap), y0, cw, ch, c.name, c.desc, c.key, this.sfs);
            this.menuCards.push(card);
        }
        this.menuButtons = [];
        this.menuButtons.push(new MenuButton(this.menuLayer, 90, 60, 150, 54, 'back', '返 回', ''));
        this.mkLabel(this.menuLayer, 'hint', DW / 2, 74, 15, '1/2/3 换武器   ·   WASD 移动   ·   左键射击   ·   Shift 冲刺', true);
    }

    /** 选牌库点击 */
    private clickShop(): void {
        if (!this.shop) return;
        const m = this.mouseUI;
        const btn = this.shop.hitButton(m.x, m.y);
        if (btn === 'confirm') { this.shop.confirm(); return; }
        const c = this.shop.hitCard(m.x, m.y);
        if (c >= 0) this.shop.toggle(c);
    }

    /** 设置面板：音乐音量 / 音效音量 / 震屏 / 伤害数字 */
    private showSettings(): void {
        if (this.settingsLayer) this.settingsLayer.destroy();
        this.settingsBtns = [];
        this.settingsVals = [];
        this.settingsLayer = mkNode(this.ui, 'settingsLayer');
        const dim = mkGfx(this.settingsLayer, 'dim');
        const vis = view.getVisibleSize();
        dim.rect(-(vis.width - DW) / 2, -(vis.height - DH) / 2, vis.width, vis.height);
        dim.fillColor = new Color(4, 6, 12, 240);
        dim.fill();
        const panel = mkGfx(this.settingsLayer, 'panel');
        panel.roundRect(DW / 2 - 260, DH / 2 - 196, 520, 392, 14);
        panel.fillColor = new Color(22, 26, 38, 250);
        panel.fill();
        panel.strokeColor = new Color(96, 110, 148, 255);
        panel.lineWidth = 2;
        panel.stroke();

        const title = this.mkLabel(this.settingsLayer, 'title', DW / 2, DH / 2 + 146, 26, '设 置', true);
        title.color = new Color(255, 226, 150);

        // 四行：标签靠左，控件靠右（MenuButton 的 x 是**左边缘**，不是中心！）
        const rowY = [92, 36, -20, -76];
        const names = ['音乐音量', '音效音量', '震 屏', '伤害数字'];
        const tag = ['mLbl', 'sLbl', 'kLbl', 'dLbl'];
        const val = ['mVal', 'sVal', 'kVal', 'dVal'];
        for (let i = 0; i < 4; i++) {
            const y = DH / 2 + rowY[i];
            this.mkLabel(this.settingsLayer, tag[i], DW / 2 - 180, y, 18, names[i], false);
            const v = this.mkLabel(this.settingsLayer, val[i], DW / 2 + 95, y, 18, '', true);
            v.color = new Color(255, 214, 120);
            this.settingsVals.push(v);
            if (i < 2) {
                // 音量：－ 数值 ＋
                this.settingsBtns.push(new MenuButton(this.settingsLayer, DW / 2 + 30, y - 17, 44, 34, i === 0 ? 'music-' : 'sfx-', '－', ''));
                this.settingsBtns.push(new MenuButton(this.settingsLayer, DW / 2 + 140, y - 17, 44, 34, i === 0 ? 'music+' : 'sfx+', '＋', ''));
            } else {
                // 开关
                this.settingsBtns.push(new MenuButton(this.settingsLayer, DW / 2 + 130, y - 17, 76, 34, i === 2 ? 'shake' : 'dmg', '开', ''));
            }
        }

        // 返回
        this.settingsBtns.push(new MenuButton(this.settingsLayer, DW / 2 - 90, DH / 2 - 160, 180, 46, 'close', '返 回', ''));

        this.refreshSettings();
    }

    /** 刷新设置面板的显示 */
    private refreshSettings(): void {
        if (this.settingsVals.length < 4) return;
        this.settingsVals[0].string = Math.round(this.audio.musicVol * 100) + '%';
        this.settingsVals[1].string = Math.round(this.audio.sfxVol * 100) + '%';
        this.settingsVals[2].string = '';
        this.settingsVals[3].string = '';
        for (const b of this.settingsBtns) {
            if (b.id === 'shake') b.title.string = this.shakeOn ? '开' : '关';
            if (b.id === 'dmg') b.title.string = this.showDmgNum ? '开' : '关';
        }
    }

    /** 设置面板的点击 */
    private clickSettings(): void {
        const m = this.mouseUI;
        for (const b of this.settingsBtns) {
            if (!b.hit(m.x, m.y)) continue;
            this.audio.play('click', 0.4);
            if (b.id === 'music-') this.audio.setMusicVolume(this.audio.musicVol - 0.1);
            else if (b.id === 'music+') this.audio.setMusicVolume(this.audio.musicVol + 0.1);
            else if (b.id === 'sfx-') this.audio.setSfxVolume(this.audio.sfxVol - 0.1);
            else if (b.id === 'sfx+') this.audio.setSfxVolume(this.audio.sfxVol + 0.1);
            else if (b.id === 'shake') { this.shakeOn = !this.shakeOn; this.saveSettings(); }
            else if (b.id === 'dmg') { this.showDmgNum = !this.showDmgNum; this.saveSettings(); }
            else if (b.id === 'close') {
                if (this.settingsLayer) { this.settingsLayer.destroy(); this.settingsLayer = null; }
                return;
            }
            this.refreshSettings();
            return;
        }
    }

    /** 设置存盘（音量由 AudioSys 自己存） */
    private saveSettings(): void {
        try {
            localStorage.setItem('kl_shake', this.shakeOn ? '1' : '0');
            localStorage.setItem('kl_dmg', this.showDmgNum ? '1' : '0');
        } catch (e) { /* 忽略 */ }
    }

    private loadSettings(): void {
        try {
            const sh = localStorage.getItem('kl_shake');
            const dm = localStorage.getItem('kl_dmg');
            if (sh !== null) this.shakeOn = sh === '1';
            if (dm !== null) this.showDmgNum = dm === '1';
        } catch (e) { /* 忽略 */ }
    }

    private clickMenu(): void {
        const m = this.mouseUI;
        if (this.settingsLayer) { this.clickSettings(); return; }
        this.audio.play('click', 0.4);
        for (const b of this.menuButtons) {
            if (!b.hit(m.x, m.y)) continue;
            if (b.id === 'back') { this.showMenu(); return; }
            if (b.id === 'classic') { this.showClassPick('classic'); return; }
            if (b.id === 'challenge') { this.showClassPick('challenge'); return; }
            if (b.id === 'endless') { this.showClassPick('endless'); return; }
            if (b.id === 'settings') { this.showSettings(); return; }
        }
        if (this.menuPage !== 'class') return;
        for (let i = 0; i < this.menuCards.length; i++) {
            if (this.menuCards[i].hit(m.x, m.y)) {
                this.startGame(i, this.menuMode);
                return;
            }
        }
    }

    private startGame(cls: number, mode: 'classic' | 'challenge' | 'endless'): void {
        this.menuLayer.destroy();
        this.gameMode = mode;
        this.coins = 0;
        this.kills = 0;
        this.level = 1;
        // 经典模式用固定种子（= 1 号地图），挑战模式随机
        this.runSeed = mode === 'classic' ? CLASSIC_SEED : ((Math.random() * 0xffffffff) >>> 0);
        this.player.applyClass(CLASSES[cls]);
        this.player.spriteNode.getComponent(Sprite)!.spriteFrame = this.sfs[CLASSES[cls].key];
        this.player.weaponNode.getComponent(Sprite)!.spriteFrame = this.sfs[CLASSES[cls].weapon];
        this.state = ST_PLAY;
        this.hudLayer.active = true;
        // 挑战模式：先选 3 张强化，再去打 Boss
        if (mode === 'challenge') {
            this.openShop();
            return;
        }
        this.buildLevel(1);
        this.audio.playMusic(this.gameMode === 'challenge' ? 'bgmBoss' : 'bgmBattle', 0.55);
    }

    /** 挑战模式的选牌库（模仿金铲铲「大橘大利」）：选 3 张强化，然后开战 */
    private openShop(): void {
        this.state = ST_SHOP;
        this.firing = false;
        if (this.hudLayer) this.hudLayer.active = false;
        if (this.shop) this.shop.node.destroy();
        // 挑战模式用**专用的强化表**（数值更高，和经典模式的牌互不相通）
        const pool = CHALLENGE_UPGRADES.filter((u) => !u.classes || u.classes.indexOf(this.player.clsKey) >= 0);
        this.shop = new ShopUI(this.ui, this.sfs, pool, (ups) => {
            for (const u of ups) u.apply(this.player);
            if (this.shop) { this.shop.node.destroy(); this.shop = null; }
            this.hudLayer.active = true;
            this.state = ST_PLAY;
            this.buildLevel(1);
        });
    }

    private showUpgrades(customPool?: Upgrade[]): void {
        this.state = ST_UPGRADE;
        this.audio.play('levelUp', 0.5);
        this.firing = false;
        // 随机抽 3 个不重复的强化（挑战模式可以指定牌库）
        // 只抽当前职业能用的强化（弹跳只给射手和法师）
        const pool = (customPool || UPGRADES.filter((u) => !u.classes || u.classes.indexOf(this.player.clsKey) >= 0)).slice();
        this.pendingUpgrades = [];
        for (let i = 0; i < 3 && pool.length; i++) {
            const k = Math.floor(this.rng() * pool.length);
            this.pendingUpgrades.push(pool.splice(k, 1)[0]);
        }
        this.upgradeLayer = mkNode(this.ui, 'upgradeLayer');
        const dim = mkGfx(this.upgradeLayer, 'dim');
        dim.rect(0, 0, DW, DH);
        dim.fillColor = new Color(6, 8, 14, 200);
        dim.fill();
        this.upgradeTitle = this.mkLabel(this.upgradeLayer, 'title', DW / 2, DH - 110, 34, '升 级 !', true);
        this.upgradeTitle.color = new Color(255, 226, 150);

        this.upgradeCards = [];
        const cw = 240;
        const ch = 280;
        const gap = 30;
        const total = this.pendingUpgrades.length * cw + (this.pendingUpgrades.length - 1) * gap;
        const x0 = (DW - total) / 2;
        const y0 = 150;
        for (let i = 0; i < this.pendingUpgrades.length; i++) {
            const u = this.pendingUpgrades[i];
            const card = new Card(this.upgradeLayer, x0 + i * (cw + gap), y0, cw, ch, u.name, u.desc, u.icon, this.sfs);
            this.upgradeCards.push(card);
        }
        this.mkLabel(this.upgradeLayer, 'hint', DW / 2, 100, 18, '点击一张强化卡', true);
    }

    private clickUpgrade(): void {
        const m = this.mouseUI;
        for (let i = 0; i < this.upgradeCards.length; i++) {
            if (this.upgradeCards[i].hit(m.x, m.y)) {
                this.pendingUpgrades[i].apply(this.player);
                this.audio.play('levelUp', 0.55);
                this.upgradeLayer.destroy();
                this.state = ST_PLAY;
                return;
            }
        }
    }

    // ------------------------------------------------------------------ 主循环

    update(dt: number): void {
        if (dt > 0.05) dt = 0.05;
        if (!this.started) return;
        // 顿帧：命中瞬间冻结一小会儿，手感更"实"
        if (this.hitStop > 0) {
            this.hitStop -= dt;
            this.updateHud();
            this.updateShake(dt);
            return;
        }
        this.updateSmallCleared();
        if (this.state === ST_PLAY) {
            this.updatePlay(dt);
        }
        this.updateHud();
        this.updateShake(dt);
        this.updateFloatTexts(dt);
    }

    /** 震屏：给世界节点加随机偏移 */
    private updateShake(dt: number): void {
        if (this.shakeT <= 0 || !this.shakeOn) {
            if (this.shakeT <= 0) {
                this.world.setPosition(-DW / 2 - this.camX, -DH / 2 - this.camY, 0);
            }
            return;
        }
        this.shakeT -= dt;
        const m = this.shakeMag * Math.max(0, this.shakeT) / this.shakeDur;
        this.world.setPosition(
            -DW / 2 - this.camX + (Math.random() - 0.5) * m * 2,
            -DH / 2 - this.camY + (Math.random() - 0.5) * m * 2,
            0,
        );
    }

    /** 触发震屏 */
    private shake(mag: number, dur = 0.18): void {
        if (!this.shakeOn) return;
        this.shakeMag = Math.max(this.shakeMag, mag);
        this.shakeDur = dur;
        this.shakeT = dur;
    }

    private curWeapon(): Weapon {
        return WEAPONS[this.player.weaponIdx];
    }

    private switchWeapon(i: number): void {
        if (i >= WEAPONS.length) return;
        this.player.weaponIdx = i;
        this.player.reloadT = 0;
        this.player.weaponNode.getComponent(Sprite)!.spriteFrame = this.sfs[WEAPONS[i].key];
    }

    private updatePlay(dt: number): void {
        const p = this.player;
        const dir = this.aimDir;

        // 移动输入
        let ix = 0;
        let iy = 0;
        if (this.keyDown(KeyCode.KEY_W, KeyCode.ARROW_UP)) iy += 1;
        if (this.keyDown(KeyCode.KEY_S, KeyCode.ARROW_DOWN)) iy -= 1;
        if (this.keyDown(KeyCode.KEY_A, KeyCode.ARROW_LEFT)) ix -= 1;
        if (this.keyDown(KeyCode.KEY_D, KeyCode.ARROW_RIGHT)) ix += 1;
        const len = Math.hypot(ix, iy);
        if (len > 0) { ix /= len; iy /= len; }

        // 冲刺
        p.dashCd -= dt;
        p.dashT -= dt;
        if (p.dashCd <= 0 && len > 0 && this.keyDown(KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT, KeyCode.SPACE)) {
            p.dashT = p.dashTime;
            p.dashCd = p.dashCdTime;
            p.dashX = ix;
            p.dashY = iy;
            p.invuln = Math.max(p.invuln, 0.28);
        }

        const spd = p.speed * p.speedMul;
        let vx = ix * spd;
        let vy = iy * spd;
        if (p.dashT > 0) {
            vx = p.dashX * spd * 2.4;
            vy = p.dashY * spd * 2.4;
        }
        if (!this.map.collides(p.x, p.y, p.r)) { this.safeX = p.x; this.safeY = p.y; }
        this.map.move(p, p.r, vx * dt, vy * dt);
        this.rescue(p, this.safeX, this.safeY);
        // 黑洞领域：把主角往中心拽
        const vb = this.enemies.find((e) => e.bossKind === 1 && e.fieldT > 0);
        if (vb) {
            const hx = vb.fieldX - p.x;
            const hy = vb.fieldY - p.y;
            const hd = Math.hypot(hx, hy) || 1;
            const hr = vb.atkMove === 10 ? 210 : 160;
            if (hd < hr) {
                const pull = 190 * (1 - hd / hr) * dt;
                this.map.move(p, p.r, (hx / hd) * pull, (hy / hd) * pull);
            }
        }
        p.node.setPosition(p.x, p.y, 0);
        // 主角第一次动 = 本关正式开始（之前敌人原地待命）
        if (!this.levelStarted) {
            const ddx = p.x - this.lastPx;
            const ddy = p.y - this.lastPy;
            if (ddx * ddx + ddy * ddy > 0.01) this.levelStarted = true;
        }
        this.lastPx = p.x;
        this.lastPy = p.y;
        p.bob += dt * (len > 0 ? 9 : 3);
        p.spriteNode.setPosition(0, Math.sin(p.bob) * 1.5, 0);

        // 瞄准 + 武器朝向
        if (dir.x * dir.x + dir.y * dir.y > 4) {
            p.aim = Math.atan2(dir.y, dir.x);
            p.weaponNode.setRotationFromEuler(0, 0, p.aim * 180 / Math.PI + this.curWeapon().rotOff);
        }

        // 换弹
        const w = this.curWeapon();
        if (p.reloading) {
            p.reloadT -= dt;
            if (p.reloadT <= 0) {
                p.reloadT = 0;
                p.ammo[p.weaponIdx] = Math.max(1, Math.round(w.mag * p.magMul));
            }
        }

        // 攻击（按职业分三种方式）
        p.fireCd -= dt;
        if (this.firing && p.fireCd <= 0) {
            if (p.atkType === ATK_SLASH) {
                p.fireCd = 0.5 * p.rateMul;
                this.slashAttack();
            } else if (p.atkType === ATK_ORB) {
                p.fireCd = 1.5 * p.rateMul;
                this.orbAttack();
            } else {
                // 射手：原来的枪 + 弹匣
                if (!p.reloading && p.ammo[p.weaponIdx] > 0) {
                    p.fireCd = w.cd * p.rateMul;
                    p.ammo[p.weaponIdx]--;
                    this.shoot(w);
                } else if (!p.reloading) {
                    p.reloadT = w.reload;
                }
            }
        }

        // 受击闪烁：变红而不是隐身
        if (p.invuln > 0) {
            p.invuln -= dt;
            const hurt = Math.floor(p.invuln * 20) % 2 === 0;
            p.spriteNode.getComponent(Sprite)!.color = hurt ? COL_HURT : Color.WHITE;
        } else {
            // 狂暴：残血时主角发红光
            const berserk = p.berserkMul > 1 && p.hp > 0 && p.hp < p.maxHp / 3;
            p.spriteNode.getComponent(Sprite)!.color = berserk ? new Color(255, 150, 130) : Color.WHITE;
        }
        // 铁壁：身上套一个护盾光环
        this.shieldRing.clear();
        if (p.shield > 0) {
            this.shieldRing.circle(0, 0, 21);
            this.shieldRing.strokeColor = new Color(130, 210, 255, 220);
            this.shieldRing.lineWidth = 2.5;
            this.shieldRing.stroke();
            this.shieldRing.circle(0, 0, 24);
            this.shieldRing.strokeColor = new Color(90, 160, 230, 110);
            this.shieldRing.lineWidth = 1.5;
            this.shieldRing.stroke();
        }
        this.shieldRing.node.setPosition(p.x, p.y, 0);

        this.updateCamera(dt);
        this.checkRoomClear();
        this.updateBullets(dt);
        this.updateFlow(dt);
        this.updateEnemies(dt);
        this.updateRoomLock();
        this.checkAllCleared();
        this.updatePickups(dt);
        this.updateExit();
        this.updateFx(dt);
        this.updateBlasts(dt);
        this.drawBossFx();
        this.updateCrosshair(p.x + dir.x, p.y + dir.y);
    }

    /** 虚空落石：预警结束 -> 爆炸 */
    private updateBlasts(dt: number): void {
        for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
            const b = this.pendingBlasts[i];
            b.t -= dt;
            if (b.t > 0) continue;
            this.pendingBlasts.splice(i, 1);
            const boom = new Fx(this.fxLayer, b.x, b.y, FX_BOOM, new Color(255, 140, 110));
            boom.radius = b.r;
            boom.life = 0.3;
            this.fx.push(boom);
            const p = this.player;
            if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.r) this.hurtPlayer(1);
        }
    }

    /** 画 Boss 的招式表现：激光 / 黑洞领域 / 落石预警 */
    private drawBossFx(): void {
        const g = this.bossFx;
        if (!g) return;
        g.clear();
        const boss = this.enemies.find((e) => e.bossKind === 1);
        if (!boss) {
            if (this.pendingBlasts.length) this.pendingBlasts.length = 0;
            return;
        }
        // 激光
        if (boss.laserT > 0) {
            const len = 760;
            const ex = boss.x + Math.cos(boss.laserA) * len;
            const ey = boss.y + Math.sin(boss.laserA) * len;
            g.moveTo(boss.x, boss.y); g.lineTo(ex, ey);
            g.strokeColor = new Color(255, 120, 240, 110);
            g.lineWidth = 18;
            g.stroke();
            g.moveTo(boss.x, boss.y); g.lineTo(ex, ey);
            g.strokeColor = new Color(255, 225, 255, 235);
            g.lineWidth = 5;
            g.stroke();
            if (boss.atkMove === 8) {
                // 双束交叉
                const ex2 = boss.x - Math.cos(boss.laserA) * len;
                const ey2 = boss.y - Math.sin(boss.laserA) * len;
                g.moveTo(boss.x, boss.y); g.lineTo(ex2, ey2);
                g.strokeColor = new Color(150, 200, 255, 110);
                g.lineWidth = 18;
                g.stroke();
                g.moveTo(boss.x, boss.y); g.lineTo(ex2, ey2);
                g.strokeColor = new Color(220, 240, 255, 235);
                g.lineWidth = 5;
                g.stroke();
            }
        }
        // 黑洞领域
        if (boss.fieldT > 0) {
            const r = boss.atkMove === 10 ? 96 : 70;
            g.circle(boss.fieldX, boss.fieldY, r);
            g.fillColor = new Color(36, 8, 56, 120);
            g.fill();
            g.circle(boss.fieldX, boss.fieldY, r);
            g.strokeColor = new Color(200, 120, 255, 200);
            g.lineWidth = 3;
            g.stroke();
            g.circle(boss.fieldX, boss.fieldY, r * 0.45);
            g.fillColor = new Color(120, 40, 170, 150);
            g.fill();
        }
        // 落石预警圈
        for (const b of this.pendingBlasts) {
            const k = Math.max(0, b.t / 0.9);
            g.circle(b.x, b.y, b.r * (1 - k) + 6);
            g.fillColor = new Color(255, 90, 90, 70);
            g.fill();
            g.circle(b.x, b.y, b.r);
            g.strokeColor = new Color(255, 130, 130, 220);
            g.lineWidth = 2;
            g.stroke();
        }
    }

    /** 骑士：近战斩击 —— 身前一个圆形范围，范围内全部敌人受伤 */
    private slashAttack(): void {
        const p = this.player;
        const range = 53 + p.rangeBonus + p.pierce * 12 + p.extraShots * 10;   // 狙神 -> 更远，贯穿 -> 更远，散射 -> 范围更大
        const arc = 1.7 + p.extraShots * 0.35;                   // 散射 -> 剑光更宽
        const fx = new Fx(this.fxLayer, p.x, p.y, FX_SLASH, new Color(205, 245, 255), 3);
        fx.angle = p.aim;
        fx.range = range;
        fx.arc = arc;
        fx.life = 0.24;
        this.fx.push(fx);
        this.audio.playOneOf(['slash', 'slash2', 'chop'], 0.5);
        // 范围判定：以自身为圆心，这一圈范围内的敌人**全部**受伤（不分方向）
        // 注意：必须遍历快照 —— 打死怪会立刻把敌人从数组里 splice 掉，
        // 直接遍历 this.enemies 会「杀一只跳一只」，看起来就像单体伤害。
        for (const e of this.enemies.slice()) {
            if (e.dead) continue;
            const dx = e.x - p.x;
            const dy = e.y - p.y;
            if (dx * dx + dy * dy > (range + e.r) * (range + e.r)) continue;
            this.damageEnemy(e, (1 + p.dmgBonus) * p.dmgMul);
        }
    }

    /** 法师：法球飞 3 格后爆炸（范围 2 格） */
    private orbAttack(): void {
        const p = this.player;
        const dist = (3 + p.pierce * 0.5) * TILE + p.rangeBonus;   // 狙神 -> 飞得更远，贯穿 -> 飞得更远
        const spd = 300 * p.bulletSpeedMul;            // 疾射 -> 飞得更快
        const fx = new Fx(this.fxLayer, p.x, p.y, FX_ORB, new Color(170, 120, 255));
        fx.vx = Math.cos(p.aim) * spd;
        fx.vy = Math.sin(p.aim) * spd;
        fx.dist = dist;                                // 飞行距离预算（飞满就爆）
        fx.bounce = p.bounce;                          // 弹跳强化
        fx.radius = 9;
        fx.life = 2.0;                                 // 超时兜底
        this.fx.push(fx);
        this.audio.play('glass', 0.45, 1.2);
    }

    /** 法球爆炸：范围 2 格的群体伤害 */
    private explode(x: number, y: number, radius: number): void {
        const p = this.player;
        const boom = new Fx(this.fxLayer, x, y, FX_BOOM, new Color(255, 170, 90));
        boom.radius = radius;
        boom.life = 0.3;
        this.fx.push(boom);
        this.audio.playOneOf(['explode', 'explode2'], 0.55);
        this.shake(6, 0.2);
        for (const e of this.enemies.slice()) {   // 快照遍历：打死怪会 splice 数组
            if (e.dead) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            if (dx * dx + dy * dy > (radius + e.r) * (radius + e.r)) continue;
            this.damageEnemy(e, (1 + p.dmgBonus) * p.dmgMul);
        }
    }

    /** 统一的伤害结算（含暴击） */
    private damageEnemy(e: Enemy, dmg: number): void {
        const p = this.player;
        if (e.invulnT > 0) return;      // Boss 换阶段的短暂无敌
        const isCrit = p.critChance > 0 && this.rng() < p.critChance;
        const shown = Math.round(dmg * (isCrit ? p.critMul : 1));
        // 伤害飘字
        if (this.showDmgNum) {
            const ft = new FloatText(this.entityLayer, e.x + (Math.random() - 0.5) * 12, e.y + e.r + 6,
                String(shown), isCrit ? new Color(255, 214, 90) : new Color(255, 245, 225), isCrit ? 17 : 14);
            this.floatTexts.push(ft);
        }
        // 命中音效
        this.audio.playOneOf(['hit', 'hit2', 'hitStone'], 0.55);
        // 震屏：只有骑士/法师会震，射手（子弹太密）完全不震
        if (p.atkType !== ATK_GUN) {
            this.shake(isCrit ? 7 : 3, isCrit ? 0.2 : 0.12);
        }
        // 狂暴：自己残血（<1/3）时伤害翻倍
        if (p.berserkMul > 1 && p.hp > 0 && p.hp < p.maxHp / 3) dmg *= p.berserkMul;
        // 处决：打残血敌人（<25%）伤害翻倍
        if (p.execMul > 1 && e.hp < e.maxHp * 0.25) dmg *= p.execMul;
        const crit = p.critChance > 0 && this.rng() < p.critChance;
        e.hp -= crit ? dmg * p.critMul : dmg;
        // 嗜血：攻击命中就回血（不用等击杀）
        if (p.hpOnHit > 0) p.hp = Math.min(p.maxHp, p.hp + p.hpOnHit);
        if (crit) e.flash = 0.14;
        e.drawBar();
        if (e.hp <= 0) this.killEnemy(e);
    }

    private shoot(w: Weapon): void {
        const p = this.player;
        this.levelStarted = true;   // 开枪也算正式开始
        const n = w.count + p.extraShots;
        const speed = w.speed * p.bulletSpeedMul;
        // 武器本身没有散射（剑）时，多发的子弹给个默认扇形角，不然会叠在一起
        const spread = w.spread > 0 ? w.spread : 0.34;
        for (let i = 0; i < n; i++) {
            let a = p.aim;
            if (n > 1) {
                const t = i / (n - 1) - 0.5;
                a += t * spread;
            }
            const bx = p.x + Math.cos(a) * 16;
            const by = p.y + Math.sin(a) * 16;
            const bl = new Bullet(
                this.entityLayer, bx, by,
                Math.cos(a) * speed, Math.sin(a) * speed, true,
                w.color, w.size, w.pierce + p.pierce,
            );
            bl.bounce = p.bounce;
            bl.life = 1.3 + p.rangeBonus / Math.max(1, speed);   // 狙神：子弹飞得更远
            this.bullets.push(bl);
        }
        this.fx.push(new Fx(this.fxLayer, p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, FX_FLASH, w.color));
        this.audio.playOneOf(['hitMetal', 'hit2'], 0.28, 1.1);
    }

    /** 摄像机平滑跟随主角（到地图边界就停） */
    private updateCamera(dt: number): void {
        const p = this.player;
        const tx = Math.max(0, Math.min(MAP_W - DW, p.x - DW / 2));
        const ty = Math.max(0, Math.min(MAP_H - DH, p.y - DH / 2));
        const k = Math.min(1, dt * 7);
        this.camX += (tx - this.camX) * k;
        this.camY += (ty - this.camY) * k;
        this.world.setPosition(-DW / 2 - this.camX, -DH / 2 - this.camY, 0);
        this.onEnterRoom();
    }

    /** 玩家进入/离开房间：进房刷怪 */
    private onEnterRoom(): void {
        const idx = this.map.roomIndexAt(this.player.x, this.player.y);
        if (idx === this.curRoom) return;
        // 进 Boss 房 -> 切 Boss 曲
        if (idx >= 0 && this.map.rooms[idx] && this.map.rooms[idx].isBoss) {
            this.audio.playMusic('bgmBoss', 0.6);
        }
        this.curRoom = idx;
        this.checkRoomClear();
    }

    /** 当前房间的怪是否清完（只用于小地图显示） */
    private checkRoomClear(): void {
        const cur = this.curRoom;
        if (cur < 0) return;
        const room = this.map.rooms[cur];
        if (!room || room.cleared) return;
        let alive = 0;
        for (const e of this.enemies) {
            if (e.room === cur) alive++;
        }
        if (alive > 0) return;
        room.cleared = true;
    }

    /**
     * 房门机制：玩家待的房间只要还有活怪，这间房的门就锁上，
     * 打完（清光）自动开门。这样既能自由穿行 hunt 剩下的怪，
     * 又保留了「进了房间就打一架」的节奏。
     */
    private updateRoomLock(): void {
        const cur = this.curRoom;
        let locked = -1;
        if (cur >= 0) {
            let alive = 0;
            for (const e of this.enemies) {
                if (e.room === cur) alive++;
            }
            if (alive > 0) locked = cur;
        }
        if (locked !== this.map.lockedRoom) {
            this.map.lockedRoom = locked;
            this.refreshGates();
        }
    }

    /** 通关条件：地图上的敌人全部清光 -> 出口开启 */
    private checkAllCleared(): void {
        if (this.gameMode === 'challenge') {
            // 挑战模式：打死 Boss 就算赢（召唤出来的小侍从不算）
            const boss = this.enemies.find((e) => e.kind === EK_BOSS);
            if (!boss && this.state === ST_PLAY) {
                this.state = ST_DEAD;
                this.showOverlay('挑 战 达 成', `种子 ${this.runSeed}    按 R 回到主菜单`);
            }
            return;
        }
        if (this.gameMode === 'endless') {
            // 无尽模式：**没有出口**，清光全图（含 Boss）立刻进下一关，难度递增
            if (this.enemies.length > 0 || this.state !== ST_PLAY) return;
            if (this.map.exitOpen) return;       // 本关已结算过
            this.map.exitOpen = true;
            this.pendingLevel = this.level + 1;
            this.buildLevel(this.pendingLevel);
            this.showUpgrades();
            return;
        }
        if (this.map.exitOpen) return;
        if (this.enemies.length > 0) return;
        this.map.exitOpen = true;
        this.refreshExit();
    }

    /** 某个房间刷怪 */
    private spawnRoomEnemies(roomIdx: number): void {
        const room = this.map.rooms[roomIdx];
        // Boss 房：刷一只 Boss + 少量小怪
        if (room.isBoss) {
            const challenge = this.gameMode === 'challenge';
            const style = challenge ? CHALLENGE_BOSS : this.bossStyleOf(this.level);
            const spot = challenge
                ? { x: room.cx * TILE + TILE / 2, y: room.cy * TILE + TILE / 2 }
                : this.map.randomFloor(this.rng, this.player.x, this.player.y, 3 * TILE, roomIdx);
            const boss = new Enemy(this.entityLayer, EK_BOSS, spot.x, spot.y, this.sfs[style.key], roomIdx, this.level);
            boss.bossStyle = style;
            if (challenge) {
                // 虚空祭司：血更厚，三阶段多攻击方式
                boss.bossKind = 1;
                boss.hp = 300;
                boss.maxHp = 300;
                boss.speed = 46;
                boss.r = 26;
            }
            this.enemies.push(boss);
            // 皇冠：一眼看出是 Boss（虚空祭司自己有角，不用皇冠）
            if (!challenge) {
                const crown = mkGfx(boss.node, 'crown');
                crown.node!.setPosition(0, (TILE * 2) / 2 + 7, 0);
                crown.moveTo(-13, 0); crown.lineTo(-13, 7); crown.lineTo(-7, 3); crown.lineTo(0, 9);
                crown.lineTo(7, 3); crown.lineTo(13, 7); crown.lineTo(13, 0);
                crown.fillColor = new Color(255, 214, 90);
                crown.fill();
                crown.strokeColor = new Color(150, 100, 20);
                crown.lineWidth = 1.5;
                crown.stroke();
            }
            // Boss 房里**只刷 Boss**，不再刷小怪：
            // 进 Boss 房的前置条件是「全图小怪清零」，房间里的怪被锁在门里面永远打不到，
            // 那样就死锁了（门永远开不了，这关过不去）。
            return;
        }
        const count = Math.min(6, 2 + Math.floor(this.level / 3));
        for (let i = 0; i < count; i++) {
            // 刷怪点必须离主角 2 格（64px）以外，不然一出生就能贴脸打
            const spot = this.map.randomFloor(this.rng, this.player.x, this.player.y, 2 * TILE, roomIdx);
            let kind = EK_SLIME;
            const r = this.rng();
            if (this.level >= 5 && r < 0.2) kind = EK_BRUTE;
            else if (this.level >= 3 && r < 0.42) kind = EK_GHOST;
            else if (this.level >= 2 && r < 0.62) kind = EK_CASTER;
            const key = kind === EK_SLIME ? 'slime' : kind === EK_CASTER ? 'caster' : kind === EK_BRUTE ? 'brute' : 'ghost';
            this.enemies.push(new Enemy(this.entityLayer, kind, spot.x, spot.y, this.sfs[key], roomIdx, this.level));
        }
    }

    /**
     * 脱困：身体陷进实心格（墙 / 箱子 / 刚锁上的门）后，两个轴都会被判阻挡，
     * 就再也动不了了。这里先退回上一帧的安全位置，不行就往四周找最近的空位。
     */
    private rescue(ent: { x: number; y: number; r: number }, sx: number, sy: number): void {
        if (!this.map.collides(ent.x, ent.y, ent.r)) return;
        if (!this.map.collides(sx, sy, ent.r)) { ent.x = sx; ent.y = sy; return; }
        for (let d = TILE / 2; d <= TILE * 3; d += TILE / 2) {
            for (let a = 0; a < 8; a++) {
                const ang = (a / 8) * Math.PI * 2;
                const nx = ent.x + Math.cos(ang) * d;
                const ny = ent.y + Math.sin(ang) * d;
                if (!this.map.collides(nx, ny, ent.r)) { ent.x = nx; ent.y = ny; return; }
            }
        }
    }

    /** 更新伤害飘字 */
    private updateFloatTexts(dt: number): void {
        for (let i = this.floatTexts.length - 1; i >= 0; i--) {
            if (!this.floatTexts[i].update(dt)) {
                this.floatTexts[i].dispose();
                this.floatTexts.splice(i, 1);
            }
        }
    }

    private updateFx(dt: number): void {
        for (let i = this.fx.length - 1; i >= 0; i--) {
            const f = this.fx[i];
            if (f.kind === FX_ORB) {
                // 法球按速度飞，撞墙会弹开（弹跳强化），飞满距离就爆炸
                const prevX = f.x;
                const prevY = f.y;
                let nx = f.x + f.vx * dt;
                let ny = f.y + f.vy * dt;
                if (this.map.solidAt(nx, ny)) {
                    nx = prevX;
                    ny = prevY;
                    if (f.bounce > 0) {
                        f.bounce--;
                        const cx = Math.floor(nx / TILE);
                        const cy = Math.floor(ny / TILE);
                        if (this.map.solid(cx + 1, cy) || this.map.solid(cx - 1, cy)) f.vx = -f.vx;
                        else if (this.map.solid(cx, cy + 1) || this.map.solid(cx, cy - 1)) f.vy = -f.vy;
                        else { f.vx = -f.vx; f.vy = -f.vy; }
                    } else {
                        // 没弹跳次数了：**就地爆炸**（不能把速度清零 —— 那样 travel 永远到不了 dist，法球就永远不会爆）
                        this.explode(f.x, f.y, (2 * TILE) + this.player.extraShots * 12);
                        f.node.destroy();
                        this.fx.splice(i, 1);
                        continue;
                    }
                }
                f.x = nx;
                f.y = ny;
                f.travel += Math.hypot(f.vx, f.vy) * dt;
                f.node.setPosition(f.x, f.y, 0);
                if (f.travel >= f.dist) {
                    this.explode(f.x, f.y, (2 * TILE) + this.player.extraShots * 12);
                    f.node.destroy();
                    this.fx.splice(i, 1);
                    continue;
                }
            }
            if (!f.update(dt)) {
                // 法球超时 -> 爆炸
                if (f.kind === FX_ORB) {
                    const r = (2 * TILE) + this.player.extraShots * 12;
                    this.explode(f.x, f.y, r);
                }
                this.fx.splice(i, 1);
            }
        }
    }

    private updateBullets(dt: number): void {
        const p = this.player;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const prevX = b.x;
            const prevY = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            b.node.setPosition(b.x, b.y, 0);

            let hit = b.life <= 0;
            // 撞墙：有「弹跳」强化就弹开（子弹撞墙后反向继续飞）
            if (!hit && this.map.solidAt(b.x, b.y)) {
                if (b.fromPlayer && b.bounce > 0) {
                    b.bounce--;
                    b.x = prevX;
                    b.y = prevY;
                    b.node.setPosition(b.x, b.y, 0);
                    const cx = Math.floor(b.x / TILE);
                    const cy = Math.floor(b.y / TILE);
                    if (this.map.solid(cx + 1, cy) || this.map.solid(cx - 1, cy)) b.vx = -b.vx;
                    else if (this.map.solid(cx, cy + 1) || this.map.solid(cx, cy - 1)) b.vy = -b.vy;
                    else { b.vx = -b.vx; b.vy = -b.vy; }
                    b.life = Math.max(b.life, 0.6);
                } else {
                    hit = true;
                }
            }
            if (!hit && b.fromPlayer) {
                for (const e of this.enemies.slice()) {   // 快照遍历：打死怪会 splice 数组
                    if (e.dead) continue;
                    const dx = e.x - b.x;
                    const dy = e.y - b.y;
                    if (dx * dx + dy * dy < (e.r + b.r) * (e.r + b.r)) {
                        // 暴击：一定几率双倍伤害
                        const crit = this.player.critChance > 0 && this.rng() < this.player.critChance;
                        this.damageEnemy(e, b.dmg * p.dmgMul);
                        hit = true;
                        if (e.dead) { /* 死了就不该再穿透 */ }
                        else if (b.pierce > 0) { b.pierce--; hit = false; }
                        break;
                    }
                }
            } else if (!hit && !b.fromPlayer) {
                const dx = p.x - b.x;
                const dy = p.y - b.y;
                if (dx * dx + dy * dy < (p.r + b.r) * (p.r + b.r)) {
                    this.hurtPlayer(b.dmg);
                    hit = true;
                }
            }

            if (hit) {
                b.dispose();
                this.bullets.splice(i, 1);
            }
        }
    }

    /** 统计全图小怪是否清光（Boss 不算） */
    private updateSmallCleared(): void {
        // Boss 房里的怪不计入「小怪清零」——否则死锁：
        // 进 Boss 房要先清光小怪，可小怪就在锁着的 Boss 房里，永远打不到。
        let bossRoom = -1;
        for (let i = 0; i < this.map.rooms.length; i++) {
            if (this.map.rooms[i].isBoss) { bossRoom = i; break; }
        }
        let alive = 0;
        for (const e of this.enemies) {
            if (e.kind === EK_BOSS) continue;
            if (e.room === bossRoom) continue;
            alive++;
        }
        this.map.smallCleared = alive === 0;
    }

    /** 定期重算到玩家的距离场（玩家换格子时立刻重算） */
    private updateFlow(dt: number): void {
        const tx = Math.floor(this.player.x / TILE);
        const ty = Math.floor(this.player.y / TILE);
        this.flowTimer -= dt;
        if (this.flowTimer <= 0 || tx !== this.flowTx || ty !== this.flowTy) {
            this.flowTimer = 0.2;
            this.flowTx = tx;
            this.flowTy = ty;
            this.map.computeFlow(tx, ty);
        }
    }

    /** 沿距离场朝玩家走（带路点，避免抖动） */
    private steerByPath(e: Enemy): { mx: number; my: number } {
        const cx = Math.floor(e.x / TILE);
        const cy = Math.floor(e.y / TILE);
        const cur = this.map.distAt(cx, cy);
        if (cur < 0) return { mx: 0, my: 0 };   // 没路（门关着），原地待命
        const near = Math.hypot(e.wpX - e.x, e.wpY - e.y) < 9;
        const wpDist = this.map.distAt(Math.floor(e.wpX / TILE), Math.floor(e.wpY / TILE));
        if (!e.wpValid || near || wpDist < 0 || wpDist >= cur || (e.stall > 0.5 && !e.wpAltTried)) {
            // 卡住的时候改走次优的那条路，绕开挡路的东西（比硬挪位置自然，不会瞬移）
            const useAlt = e.stall > 0.5 && !e.wpAltTried;
            const step = useAlt
                ? (this.map.bestStepAlt(cx, cy) || this.map.bestStep(cx, cy))
                : this.map.bestStep(cx, cy);
            if (!step) { e.wpValid = false; return { mx: 0, my: 0 }; }
            e.wpX = step.cx * TILE + TILE / 2;
            e.wpY = step.cy * TILE + TILE / 2;
            e.wpValid = true;
            e.wpAltTried = useAlt;
        }
        const dx = e.wpX - e.x;
        const dy = e.wpY - e.y;
        const len = Math.hypot(dx, dy) || 1;
        let mx = dx / len;
        let my = dy / len;
        // 卡住了（一直没法靠近主角）：稍微往侧面偏一点，蹭过箱子角。
        // 不绕的话，箱子斜角会让敌人永远卡在那间房里 -> 怪杀不掉 -> Boss 房进不去。
        if (e.stall > 0.5) {
            const k = Math.min(0.8, (e.stall - 0.5) * 1.6) * e.stallSide;
            mx += (-dy / len) * k;
            my += (dx / len) * k;
            const l = Math.hypot(mx, my) || 1;
            mx /= l;
            my /= l;
        }
        return { mx, my };
    }

    /**
     * 虚空祭司的 AI：三个阶段，三种攻击方式。
     *   阶段1：环形弹幕（慢、稀疏）+ 缓慢逼近
     *   阶段2：螺旋弹幕（双向旋转）+ 蓄力冲撞
     *   阶段3：反向螺旋 + 环形爆裂 + 更快的冲撞
     * 每次换阶段：短暂无敌 + 弹一次「三选一强化」（牌库固定 3 种）。
     */
    /**
     * 虚空祭司的 AI：三个阶段，每个阶段有 4 个招式，**同阶段招式等概率**抽取。
     *   阶段1：环形弹幕 / 召唤侍从 / 黑洞吸引 / 旋转螺旋
     *   阶段2：激光扫场 / 蓄力冲撞 / 虚空落石 / 螺旋逼近
     *   阶段3：双束交叉 / 召唤冲撞 / 领域落石 / 反向螺旋
     */
    private voidPriestAI(e: Enemy, dt: number): void {
        const p = this.player;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;

        // 阶段判定（血量三分之二、三分之一）
        const phase = e.hp > e.maxHp * 0.66 ? 1 : (e.hp > e.maxHp * 0.33 ? 2 : 3);
        if (phase !== e.bossPhase) {
            e.bossPhase = phase;
            e.invulnT = 1.1;      // 换阶段短暂无敌
            e.atkMove = -1;
            e.atkT = 0;
            e.atkCd = 1.2;
            e.fieldT = 0;
            e.chargeT = 0;
            this.ringShot(e, 14, 140);      // 换阶段的「怒吼」弹幕
        }

        // 默认移动：沿距离场缓慢逼近
        const path = this.steerByPath(e);
        e.mx = path.mx;
        e.my = path.my;

        // 冲撞进行中：只管冲
        if (e.chargeT > 0) {
            e.chargeT -= dt;
            e.mx = e.dashX;
            e.my = e.dashY;
            return;
        }

        // 招式计时
        if (e.atkCd > 0) e.atkCd -= dt;
        // 黑洞领域 / 激光的持续时间**必须在这里递减**，
        // 否则它们一旦触发就永远不会消失（看起来像 boss 一出来就挂着牵引圈）
        if (e.fieldT > 0) e.fieldT -= dt;
        if (e.laserT > 0) e.laserT -= dt;
        if (e.atkT > 0) {
            e.atkT -= dt;
            this.runVoidMove(e, phase, dt);
        } else if (e.atkCd <= 0) {
            // 本阶段的招式里等概率抽一个
            const pool: VoidMove[] = [];
            for (const m of VOID_MOVES) if (m.phase === phase) pool.push(m);
            const m = pool[Math.floor(this.rng() * pool.length) % pool.length];
            e.atkMove = m.id;
            e.atkT = m.dur;
            e.atkCd = m.dur + m.cd;
            this.startVoidMove(e, m, dx / dist, dy / dist);
        }
    }

    /** 出招的瞬间要做的事 */
    private startVoidMove(e: Enemy, m: VoidMove, nx: number, ny: number): void {
        switch (m.id) {
            case 0:     // 环形弹幕
                this.ringShot(e, 12, 150);
                break;
            case 1:     // 召唤侍从
                this.summonLings(e);
                break;
            case 2:     // 黑洞吸引
                e.fieldT = m.dur;
                e.fieldX = e.x;
                e.fieldY = e.y;
                break;
            case 4:     // 激光扫场
                e.laserT = m.dur;
                e.laserA = Math.atan2(this.player.y - e.y, this.player.x - e.x);
                break;
            case 5:     // 蓄力冲撞：先蓄力，再冲
                e.chargeT = 0.9;
                e.dashX = nx;
                e.dashY = ny;
                break;
            case 6:     // 虚空落石
                e.shootCd = 0.4;
                break;
            case 9:     // 召唤冲撞
                this.summonLings(e);
                e.chargeT = 1.1;
                e.dashX = nx;
                e.dashY = ny;
                break;
            case 10:    // 领域落石：先开领域
                e.fieldT = m.dur;
                e.fieldX = e.x;
                e.fieldY = e.y;
                e.shootCd = 0.4;
                break;
            case 8:     // 双束交叉
                e.laserT = m.dur;
                e.laserA = Math.atan2(this.player.y - e.y, this.player.x - e.x);
                break;
        }
    }

    /** 招式进行中 */
    private runVoidMove(e: Enemy, phase: number, dt: number): void {
        const p = this.player;
        switch (e.atkMove) {
            case 3:     // 旋转螺旋
            case 7: {   // 螺旋逼近（一边打一边贴脸）
                e.shootCd -= dt;
                if (e.shootCd <= 0) {
                    e.shootCd = 0.13;
                    e.spiralA += e.atkMove === 7 ? 0.38 : 0.32;
                    this.oneShot(e, e.spiralA, 185);
                    this.oneShot(e, e.spiralA + Math.PI, 185);
                }
                if (e.atkMove === 7) {
                    const dx = p.x - e.x;
                    const dy = p.y - e.y;
                    const d = Math.hypot(dx, dy) || 1;
                    e.mx = dx / d;
                    e.my = dy / d;
                }
                break;
            }
            case 4:     // 激光扫场
            case 8: {   // 双束交叉
                e.laserA += (e.atkMove === 8 ? 1.5 : 1.0) * dt;
                if (e.atkMove === 8) {
                    e.shootCd -= dt;
                    if (e.shootCd <= 0) {
                        e.shootCd = 0.9;
                        this.ringShot(e, 16, 130);
                    }
                }
                this.laserDamage(e, e.laserA);
                if (e.atkMove === 8) this.laserDamage(e, e.laserA + Math.PI);
                break;
            }
            case 6:     // 虚空落石
            case 10: {  // 领域落石（更密）
                e.shootCd -= dt;
                if (e.shootCd <= 0) {
                    e.shootCd = e.atkMove === 10 ? 0.5 : 0.8;
                    // 在主角附近预警
                    const tx = p.x + (this.rng() - 0.5) * 180;
                    const ty = p.y + (this.rng() - 0.5) * 180;
                    this.pendingBlasts.push({ x: tx, y: ty, t: 0.9, r: 46 });
                }
                break;
            }
            case 11: {  // 反向螺旋 + 环状爆裂
                e.shootCd -= dt;
                if (e.shootCd <= 0) {
                    e.shootCd = 0.12;
                    e.spiralA -= 0.5;
                    this.oneShot(e, e.spiralA, 200);
                    this.oneShot(e, e.spiralA + Math.PI, 200);
                }
                e.ringCd -= dt;
                if (e.ringCd <= 0) {
                    e.ringCd = 2.6;
                    this.ringShot(e, 18, 120);
                }
                break;
            }
            case 2:     // 黑洞吸引：持续时间由 fieldT 控制，这里不用做别的
                break;
        }
    }

    /** 召唤 2 只虚空侍从 */
    private summonLings(e: Enemy): void {
        for (let i = 0; i < 2; i++) {
            const a = this.rng() * Math.PI * 2;
            const x = e.x + Math.cos(a) * 46;
            const y = e.y + Math.sin(a) * 46;
            const m = new Enemy(this.entityLayer, EK_GHOST, x, y, this.sfs['ghost'], e.room, this.level);
            m.hp = 4;
            m.maxHp = 4;
            m.speed = 78;
            m.r = 11;
            m.awake = true;
            m.spriteNode.getComponent(Sprite)!.color = new Color(210, 140, 255);
            this.enemies.push(m);
        }
    }

    /** 激光：判定主角是否在光束上 */
    private laserDamage(e: Enemy, a: number): void {
        const p = this.player;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const len = 760;
        const t = dx * Math.cos(a) + dy * Math.sin(a);
        if (t < 0 || t > len) return;
        const px = dx - Math.cos(a) * t;
        const py = dy - Math.sin(a) * t;
        if (px * px + py * py < (p.r + 9) * (p.r + 9)) this.hurtPlayer(1);
    }

    /**
     * 普通 Boss 的弹幕间隔：
     *   经典模式 1.5 秒
     *   无尽模式 随关卡变快（2.0 → 最低 0.9 秒）
     *   挑战模式走虚空祭司那套（更快）
     */
    private bossFireInterval(): number {
        if (this.gameMode === 'endless') {
            return Math.max(0.9, 2.0 - (this.level - 1) * 0.06);
        }
        return 1.5;
    }

    /** 环形弹幕 */
    private ringShot(e: Enemy, n: number, spd: number): void {
        const base = this.rng() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const a = base + (i / n) * Math.PI * 2;
            this.bullets.push(new Bullet(this.entityLayer, e.x, e.y,
                Math.cos(a) * spd, Math.sin(a) * spd, false, new Color(206, 130, 255), 6, 0));
        }
    }

    /** 单发定向弹 */
    private oneShot(e: Enemy, a: number, spd: number): void {
        this.bullets.push(new Bullet(this.entityLayer, e.x, e.y,
            Math.cos(a) * spd, Math.sin(a) * spd, false, new Color(240, 190, 255), 5, 0));
    }

    private updateEnemies(dt: number): void {
        const p = this.player;
        for (const e of this.enemies) {
            if (e.dead) continue;
            if (e.room === this.curRoom) e.awake = true;
            if (!this.levelStarted || !e.awake) {
                // 本关还没开始 / 这间房还没被进过 -> 敌人原地待命
                e.spriteNode.setPosition(0, Math.sin(e.bob) * 1.2, 0);
                continue;
            }
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            // 卡住检测：追击型的怪一直没法靠近主角 = 被地形卡住了
            if (e.kind !== EK_CASTER && this.map.distAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE)) >= 0) {
                if (e.lastDist === 0 || dist < e.lastDist - 1) {
                    e.lastDist = dist;
                    e.stall = 0;
                    e.wpAltTried = false;
                } else {
                    if (e.stall === 0) e.stallSide = this.rng() < 0.5 ? 1 : -1;   // 选一边绕，别来回抖
                    e.stall += dt;
                }
            } else {
                e.stall = 0;
                e.lastDist = 0;
            }
            let mx = 0;
            let my = 0;

            if (e.kind === EK_CASTER) {
                if (dist < 190) { mx = -dx / dist; my = -dy / dist; }
                else if (dist > 270) { mx = dx / dist; my = dy / dist; }
                e.shootCd -= dt;
                if (e.shootCd <= 0 && dist < 460) {
                    e.shootCd = 1.8;
                    const sp = 230;
                    this.bullets.push(new Bullet(this.entityLayer, e.x, e.y, (dx / dist) * sp, (dy / dist) * sp, false, COL_EBULLET, 5, 0));
                }
            } else if (e.kind === EK_BOSS) {
                if (e.bossKind === 1) {
                    // 虚空祭司：三阶段、多攻击方式
                    this.voidPriestAI(e, dt);
                    mx = e.mx;
                    my = e.my;
                } else {
                    // Boss：环形弹幕 + 缓慢追击
                    const path = this.steerByPath(e);
                    mx = path.mx;
                    my = path.my;
                    e.shootCd -= dt;
                    if (e.shootCd <= 0 && dist < 760) {
                        e.shootCd = this.bossFireInterval();
                        const n = 12;
                        const base = e.bob * 0.6;
                        for (let i = 0; i < n; i++) {
                            const a = base + (i / n) * Math.PI * 2;
                            this.bullets.push(new Bullet(this.entityLayer, e.x, e.y,
                                Math.cos(a) * 165, Math.sin(a) * 165, false, new Color(255, 120, 200), 6, 0));
                        }
                    }
                }
            } else if (e.kind === EK_GHOST) {
                // 幽灵飘忽不定（但还是沿路走）
                const path = this.steerByPath(e);
                const wob = Math.sin(e.bob * 3) * 0.7;
                mx = path.mx + (-dy / dist) * wob;
                my = path.my + (dx / dist) * wob;
            } else {
                // 追击型：沿距离场走，不会被地形卡住
                const path = this.steerByPath(e);
                mx = path.mx;
                my = path.my;
            }

            if (e.invulnT > 0) e.invulnT -= dt;   // Boss 换阶段的短暂无敌
            if (e.flash > 0) {
                e.flash -= dt;
                e.spriteNode.setScale(1.3, 1.3);
                e.spriteNode.getComponent(Sprite)!.color = new Color(255, 220, 120);
            } else if (e.flash > -0.25) {
                e.flash = -1;
                e.spriteNode.setScale(1, 1);
                // 恢复原色（Boss 要恢复成它自己的染色）
                e.spriteNode.getComponent(Sprite)!.color = e.bossStyle ? e.bossStyle.tint : Color.WHITE;
            }
            e.bob += dt * 6;
            const spd = e.speed * (e.kind === EK_GHOST ? 1 + Math.sin(e.bob) * 0.4 : 1);
            if (!this.map.collides(e.x, e.y, e.r)) { e.safeX = e.x; e.safeY = e.y; }
            this.map.move(e, e.r, mx * spd * dt, my * spd * dt);
            this.rescue(e, e.safeX, e.safeY);
            e.node.setPosition(e.x, e.y, 0);
            e.spriteNode.setPosition(0, Math.sin(e.bob) * 2, 0);
            if (e.kind === EK_BOSS && e.bossStyle && !e.tinted) {
                e.tinted = true;
                e.spriteNode.getComponent(Sprite)!.color = e.bossStyle.tint;
            }

            if (dist < e.r + p.r) {
                this.hurtPlayer(e.dmg, e);      // 传来源：反伤要用
            }
        }
    }

    private updatePickups(dt: number): void {
        const p = this.player;
        const magnetR = 150 * p.magnetMul;      // 磁铁：吸附半径
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const k = this.pickups[i];
            const dx = p.x - k.x;
            const dy = p.y - k.y;
            const d2 = dx * dx + dy * dy;
            // 磁铁：还没进拾取范围就先往主角飞
            if (p.magnetMul > 1 && d2 < magnetR * magnetR && d2 > 1) {
                const d = Math.sqrt(d2);
                const pull = 300 * dt / Math.max(1, d * 0.12);
                k.x += (dx / d) * pull;
                k.y += (dy / d) * pull;
                k.node.setPosition(k.x, k.y, 0);
            }
            if (d2 < (p.r + k.r) * (p.r + k.r)) {
                if (k.kind === 0) {
                    p.hp = Math.min(p.maxHp, p.hp + 1);
                    this.audio.play('heart', 0.5);
                } else {
                    this.coins += 1;
                    this.audio.playOneOf(['coin', 'coin2'], 0.45);
                }
                k.dispose();
                this.pickups.splice(i, 1);
            }
        }
    }

    /** 走到出口 -> 生成下一关（藏在强化菜单背后，避免卡顿被看见）-> 三选一 */
    private updateExit(): void {
        if (this.gameMode === 'endless') return;   // 无尽模式没有出口
        if (!this.map.exitOpen) return;
        const dx = (this.map.exitCx + 0.5) * TILE - this.player.x;
        const dy = (this.map.exitCy + 0.5) * TILE - this.player.y;
        if (dx * dx + dy * dy < 44 * 44) {   // 触发半径放宽一点，贴到出口前就能过
            this.pendingLevel = this.level + 1;
            this.buildLevel(this.pendingLevel);
            this.showUpgrades();
        }
    }

    private updateCrosshair(wx: number, wy: number): void {
        this.crosshair.clear();
        this.crosshair.circle(wx, wy, 8);
        this.crosshair.moveTo(wx - 14, wy);
        this.crosshair.lineTo(wx - 10, wy);
        this.crosshair.moveTo(wx + 10, wy);
        this.crosshair.lineTo(wx + 14, wy);
        this.crosshair.moveTo(wx, wy - 14);
        this.crosshair.lineTo(wx, wy - 10);
        this.crosshair.moveTo(wx, wy + 10);
        this.crosshair.lineTo(wx, wy + 14);
        this.crosshair.strokeColor = new Color(255, 255, 255, 170);
        this.crosshair.lineWidth = 1.5;
        this.crosshair.stroke();
    }

    private hurtPlayer(dmg: number, src?: Enemy): void {
        const p = this.player;
        if (p.invuln > 0 || this.state !== ST_PLAY) return;
        // 铁壁：护盾抵挡一次伤害
        if (p.shield > 0) {
            p.shield--;
            p.invuln = 0.35;
            this.shieldBreak();
            return;
        }
        // 反伤（骑士专属）：把伤害弹回去
        if (p.thorns > 0 && src) {
            this.damageEnemy(src, p.thorns);
        }
        p.hp -= dmg;
        p.invuln = p.invulnTime;      // 坚韧：受伤后的无敌时间
        this.audio.playOneOf(['hurt', 'hitStone'], 0.6);
        this.shake(8, 0.25);
        this.hitStop = 0.05;
        if (p.hp <= 0) {
            // 复仇：攒够次数就原地复活
            if (p.reviveStock > 0) {
                p.reviveStock--;
                p.hp = p.maxHp;
                p.invuln = 1.6;
                this.reviveBlast();
                return;
            }
            p.hp = 0;
            this.state = ST_DEAD;
            if (this.gameMode === 'endless') {
                this.showOverlay('无 尽 结 束', `坚持到第 ${this.level} 关   击杀 ${this.kills}   种子 ${this.runSeed}    按 R 回到主菜单`);
            } else {
                this.showOverlay('你 阵 亡 了', `第 ${this.level} 关   金币 ${this.coins}   击杀 ${this.kills}    按 R 重新选择角色`);
            }
        }
    }

    /** 护盾被消耗时的表现 */
    private shieldBreak(): void {
        const p = this.player;
        const f = new Fx(this.fxLayer, p.x, p.y, FX_BOOM, new Color(140, 210, 255));
        f.radius = 34;
        f.life = 0.24;
        this.fx.push(f);
    }

    /** 复仇复活：清掉身边的敌人 */
    private reviveBlast(): void {
        const p = this.player;
        const f = new Fx(this.fxLayer, p.x, p.y, FX_BOOM, new Color(255, 230, 140));
        f.radius = 140;
        f.life = 0.45;
        this.fx.push(f);
        for (const e of this.enemies.slice()) {
            if (e.dead) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) < 140) this.damageEnemy(e, 9999);
        }
    }

    private killEnemy(e: Enemy): void {
        e.dead = true;
        this.kills += 1;
        const p = this.player;
        // 复仇：每杀够 N 个怪，获得一次原地复活（最多攒 2 次）
        if (p.reviveEvery > 0) {
            p.reviveCounter++;
            if (p.reviveCounter >= p.reviveEvery) {
                p.reviveCounter = 0;
                p.reviveStock = Math.min(2, p.reviveStock + 1);
            }
        }
        // 吸血：击杀回血
        if (p.lifesteal > 0) {
            p.hp = Math.min(p.maxHp, p.hp + p.lifesteal);
        }
        const idx = this.enemies.indexOf(e);
        if (idx >= 0) this.enemies.splice(idx, 1);
        e.dispose();

        const r = this.rng();
        // 收割：回心掉率可调
        if (r < p.heartRate) {
            this.pickups.push(new Pickup(this.entityLayer, 0, e.x, e.y, null));
        } else if (r < p.heartRate + 0.38) {
            this.pickups.push(new Pickup(this.entityLayer, 1, e.x, e.y, this.sfs['coin']));
        }
    }

    // ------------------------------------------------------------------ 关卡

    /** 生成一关：地图 + 画面 + 玩家出生点（房间 0,0）+ 首房间刷怪 */
    private buildLevel(level: number): void {
        this.level = level;
        // 种子化：同一局的每一关都由 runSeed 派生，地图/抽卡完全可复现
        this.rng = makeRng((this.runSeed + (level - 1) * 1000003) >>> 0);
        // 换关：Boss 血条先收起来（上一关的状态不能留到下一关）
        if (this.hudBossBg) {
            this.hudBossBg.node.active = false;
            this.hudBossFill.node.active = false;
            this.hudBossName.node.active = false;
        }
        for (const e of this.enemies) e.dispose();
        for (const b of this.bullets) b.dispose();
        for (const k of this.pickups) k.dispose();
        this.enemies.length = 0;
        this.bullets.length = 0;
        this.pickups.length = 0;

        // 挑战模式：一张竞技场，只有 Boss；经典模式：正常迷宫
        if (this.gameMode === 'challenge') {
            this.map.genArena(this.rng);
        } else {
            this.map.gen(this.rng, level);
        }
        this.buildFloor();
        this.drawMap();

        // 出生点：0 号房间中心（**绝不能是 Boss 房**——那房间要等小怪清零才开）
        let r0 = this.map.rooms[0];
        if (!r0 || r0.isBoss) {
            const alt = this.map.rooms.find(r => !r.isBoss);
            if (alt) r0 = alt;
        }
        let sx = (r0.x + r0.w / 2) * TILE;
        let sy = (r0.y + r0.h / 2) * TILE;
        if (this.gameMode === 'challenge') {
            // 竞技场：主角站在场地下方，Boss 在场地中央
            sx = (r0.cx) * TILE + TILE / 2;
            sy = (r0.y + 3) * TILE + TILE / 2;
        }
        if (this.map.solidAt(sx, sy)) {
            const spot = this.map.randomFloor(this.rng, sx, sy, 0, this.map.rooms.indexOf(r0));
            sx = spot.x; sy = spot.y;
        }
        const p = this.player;
        p.x = sx; p.y = sy;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.shield = p.shieldMax;      // 铁壁：护盾每关补满
        p.invuln = 0.6;
        p.node.setPosition(p.x, p.y, 0);

        // 摄像机对准出生点
        this.levelStarted = false;
        this.lastPx = this.player.x;
        this.lastPy = this.player.y;
        this.curRoom = -1;
        this.camX = Math.max(0, Math.min(MAP_W - DW, sx - DW / 2));
        this.camY = Math.max(0, Math.min(MAP_H - DH, sy - DH / 2));
        this.world.setPosition(-DW / 2 - this.camX, -DH / 2 - this.camY, 0);
        this.buildMinimap();
        // 所有房间的敌人一次性刷出来（从关卡开始就都存在，不是走到房间才出现）
        for (let i = 0; i < this.map.rooms.length; i++) {
            this.map.rooms[i].spawned = true;
            this.spawnRoomEnemies(i);
        }
        // 挑战模式：一进去就开打（不用等主角先动）
        if (this.gameMode === 'challenge') {
            this.levelStarted = true;
            for (const e of this.enemies) e.awake = true;
        }
        this.onEnterRoom();
    }

    // ------------------------------------------------------------------ 绘制

    private drawMap(): void {
        this.mapLayer.destroyAllChildren();
        this.decorLayer.destroyAllChildren();
        this.gateNodes.length = 0;

        // 墙：只画贴着可走区域的岩石（房间轮廓）
        const shadow = mkGfx(this.mapLayer, 'wallShadow');
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                if (this.map.at(cx, cy) !== T_WALL) continue;
                const near = this.map.at(cx + 1, cy) === T_EMPTY || this.map.at(cx - 1, cy) === T_EMPTY
                    || this.map.at(cx, cy + 1) === T_EMPTY || this.map.at(cx, cy - 1) === T_EMPTY;
                if (!near) continue;
                const sp = this.mkSprite(this.mapLayer, 'w', 'wall', TILE);
                sp.color = TINT_WALL;
                sp.node.setPosition(cx * TILE + TILE / 2, cy * TILE + TILE / 2, 0);
                if (this.map.at(cx, cy - 1) === T_EMPTY) {
                    shadow.rect(cx * TILE, cy * TILE - 8, TILE, 8);
                }
            }
        }
        shadow.fillColor = new Color(0, 0, 0, 80);
        shadow.fill();

        // 房门
        for (const room of this.map.rooms) {
            for (const gate of room.gates) {
                const sp = this.mkSprite(this.mapLayer, 'gate', 'door', TILE);
                sp.node.setPosition(gate.cx * TILE + TILE / 2, gate.cy * TILE + TILE / 2, 0);
                const gi = this.map.idx(gate.cx, gate.cy);
                this.gateNodes.push({
                    node: sp.node, cx: gate.cx, cy: gate.cy,
                    a: this.map.gateRoom[gi], b: this.map.gateRoomB[gi],
                });
            }
        }

        // 出口（无尽模式没有出口）
        this.exitNode = this.mkSprite(this.mapLayer, 'exit', 'door', TILE);
        if (this.gameMode === 'endless') this.exitNode.node.active = false;
        this.exitNode.node.setPosition(this.map.exitCx * TILE + TILE / 2, this.map.exitCy * TILE + TILE / 2, 0);
        if (this.map.exitCx === 0 || this.map.exitCx === COLS - 1) {
            this.exitNode.node.setRotationFromEuler(0, 0, 90);
        }
        this.doorGlow = mkGfx(this.mapLayer, 'exitGlow');
        this.doorGlow.node.setPosition(this.map.exitCx * TILE + TILE / 2, this.map.exitCy * TILE + TILE / 2, 0);
        // 挑战模式没有出口（打死 Boss 就赢）
        if (this.gameMode === 'challenge' || this.gameMode === 'endless') {
            this.exitNode.node.active = false;
            this.doorGlow.node.active = false;
        }
        this.refreshGates();
        this.refreshExit();

        // 装饰
        for (const d of this.map.decos) {
            const sp = this.mkSprite(this.decorLayer, 'd', d.key, TILE);
            if (d.key === 'grass' || d.key === 'flowers') sp.color = TINT_GRASS;
            sp.node.setPosition(d.cx * TILE + TILE / 2, d.cy * TILE + TILE / 2, 0);
        }
        // 实心道具
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                const pi = this.map.props[cy * COLS + cx];
                if (pi < 0) continue;
                const sp = this.mkSprite(this.decorLayer, 'p', PROP_KEYS[pi], TILE);
                sp.node.setPosition(cx * TILE + TILE / 2, cy * TILE + TILE / 2, 0);
            }
        }
    }

    /** 房门：房间清空后变成拱门并染绿 */
    private refreshGates(): void {
        for (const g of this.gateNodes) {
            const sp = g.node.getComponent(Sprite);
            if (!sp) continue;
            const ra = g.a >= 0 ? this.map.rooms[g.a] : null;
            const rb = g.b >= 0 ? this.map.rooms[g.b] : null;
            let locked = this.map.lockedRoom >= 0
                && (this.map.lockedRoom === g.a || this.map.lockedRoom === g.b);
            if (!locked && !this.map.smallCleared) {
                if ((ra && ra.isBoss) || (rb && rb.isBoss)) locked = true;
            }
            sp.spriteFrame = this.sfs['door'];
            if (!locked) this.audio.play('doorOpen', 0.4);
            // 锁着的门染暗红（表示出不去），能走的门保持原色
            sp.color = locked ? new Color(200, 110, 110) : Color.WHITE;
        }
    }

    /** 出口：全部房间清空后开启并发绿光 */
    private refreshExit(): void {
        if (!this.exitNode || !this.doorGlow) return;
        this.exitNode.spriteFrame = this.sfs[this.map.exitOpen ? 'arch' : 'door'];
        this.doorGlow.clear();
        if (this.map.exitOpen) {
            this.doorGlow.circle(0, 0, 28);
            this.doorGlow.fillColor = new Color(COL_GREEN.r, COL_GREEN.g, COL_GREEN.b, 90);
            this.doorGlow.fill();
        }
    }

    // ------------------------------------------------------------------ HUD

    private mkLabel(parent: Node, name: string, x: number, y: number, size: number, text: string, centered = false): Label {
        const n = mkNode(parent, name);
        n.setPosition(x, y, 0);
        const t = n.getComponent(UITransform)!;
        t.setAnchorPoint(centered ? 0.5 : 0, centered ? 0.5 : 0);
        t.setContentSize(DW, size + 10);
        const label = n.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = COL_TEXT;
        label.fontFamily = FONT_CN;
        label.enableWrapText = false;
        label.horizontalAlign = centered ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.LEFT;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.string = text;
        return label;
    }

    private buildHud(): void {
        this.buildVignette();
        this.hudLayer = mkNode(this.ui, 'hudLayer');
        const hl = this.hudLayer;
        // HUD 底板
        const top = mkGfx(hl, 'hudTop');
        top.rect(0, DH - 104, 430, 104);
        top.fillColor = TINT_PANEL;
        top.fill();
        const bot = mkGfx(hl, 'hudBot');
        bot.rect(0, 0, DW, 44);
        bot.fillColor = TINT_PANEL;
        bot.fill();
        const right = mkGfx(hl, 'hudRight');
        right.rect(DW - 190, 0, 190, 92);
        right.fillColor = TINT_PANEL;
        right.fill();

        // 小地图（右上角）
        this.hudMapBg = mkGfx(hl, 'mapBg');
        this.hudMapPath = mkGfx(hl, 'mapPath');
        this.hudMapRooms = mkGfx(hl, 'mapRooms');
        this.hudMapCleared = mkGfx(hl, 'mapCleared');
        this.hudMapDoor = mkGfx(hl, 'mapDoor');
        this.hudMapDoorLock = mkGfx(hl, 'mapDoorLock');
        this.hudMapPoint = mkGfx(hl, 'mapPoint');
        this.hudMapExit = mkGfx(hl, 'mapExit');
        this.hudMapPlayer = mkGfx(hl, 'mapPlayer');

        // Boss 血条（顶部居中，独一无二的样式）
        this.hudBossBg = mkGfx(hl, 'bossBg');
        this.hudBossFill = mkGfx(hl, 'bossFill');
        this.hudBossName = this.mkLabel(hl, 'bossName', DW / 2, 76, 20, '石 巨 像', true);
        this.hudBossName.color = new Color(255, 190, 190);

        this.hudHpBg = mkGfx(hl, 'hpBg');
        this.hudHpFill = mkGfx(hl, 'hpFill');
        this.hudHpText = this.mkLabel(hl, 'hpText', 174, DH - 50, 18, '');
        this.hudInfo = this.mkLabel(hl, 'info', 16, DH - 80, 22, '');
        this.hudTip = this.mkLabel(hl, 'tip', 16, 12, 18,
            'WASD 移动    鼠标瞄准    左键射击    Shift 冲刺    1/2/3 换武器');
        this.hudWeapon = this.mkSprite(hl, 'weapon', 'sword', 30);
        this.hudWeapon.node.setPosition(DW - 40, 60, 0);
        this.hudAmmo = mkGfx(hl, 'ammo');
        this.hudAmmo.node!.setPosition(DW - 155, 52, 0);
        this.hudWeaponName = this.mkLabel(hl, 'weaponName', DW - 80, 22, 16, '');

        this.overlay = mkNode(hl, 'overlay');   // 必须挂在 hudLayer 下：切菜单时才会一起隐藏
        const og = mkGfx(this.overlay, 'panel');
        og.rect(0, 0, DW, DH);
        og.fillColor = new Color(0, 0, 0, 170);
        og.fill();
        this.ovTitle = this.mkLabel(this.overlay, 'ovTitle', DW / 2, DH / 2 + 10, 44, '', true);
        this.ovSub = this.mkLabel(this.overlay, 'ovSub', DW / 2, DH / 2 - 44, 22, '', true);
        this.hideOverlay();
    }

    private showOverlay(title: string, sub: string): void {
        this.ovTitle.string = title;
        this.ovSub.string = sub;
        this.overlay.active = true;
    }

    private hideOverlay(): void {
        this.overlay.active = false;
    }

    /** 小地图：静态部分（底板+走廊+房间轮廓）每关画一次 */
    private buildMinimap(): void {
        // 不透明底板：不然后面的游戏世界会透出来，房间和走廊根本分不清
        this.hudMapBg.clear();
        this.hudMapBg.rect(MM_X - 10, MM_Y - 10, COLS * MM_SCALE + 20, ROWS * MM_SCALE + 20);
        this.hudMapBg.fillColor = new Color(10, 12, 18, 235);
        this.hudMapBg.fill();
        this.hudMapBg.rect(MM_X - 10, MM_Y - 10, COLS * MM_SCALE + 20, ROWS * MM_SCALE + 20);
        this.hudMapBg.strokeColor = new Color(90, 104, 140, 255);
        this.hudMapBg.lineWidth = 2;
        this.hudMapBg.stroke();

        this.hudMapPath.clear();
        this.hudMapRooms.clear();
        const s = MM_SCALE;
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                if (this.map.at(cx, cy) !== T_EMPTY) continue;
                if (this.map.roomOf[cy * COLS + cx] >= 0) continue;
                this.hudMapPath.rect(MM_X + cx * s, MM_Y + cy * s, s + 0.6, s + 0.6);
            }
        }
        this.hudMapPath.fillColor = new Color(108, 130, 178, 245);
        this.hudMapPath.fill();

        for (const room of this.map.rooms) {
            this.hudMapRooms.rect(MM_X + room.x * s, MM_Y + room.y * s, room.w * s, room.h * s);
        }
        this.hudMapRooms.fillColor = new Color(34, 40, 58, 240);
        this.hudMapRooms.fill();
        this.hudMapRooms.strokeColor = new Color(104, 116, 146, 240);
        this.hudMapRooms.lineWidth = 1.5;
        this.hudMapRooms.stroke();
    }

    /** 小地图动态部分：已清房间 / 门 / Boss 房 / 出口 / 玩家 */
    private drawMinimap(): void {
        const s = MM_SCALE;
        this.hudMapCleared.clear();
        for (const room of this.map.rooms) {
            if (!room.cleared) continue;
            this.hudMapCleared.rect(MM_X + room.x * s, MM_Y + room.y * s, room.w * s, room.h * s);
        }
        this.hudMapCleared.fillColor = new Color(46, 110, 68, 235);
        this.hudMapCleared.fill();

        // Boss 房标记
        this.hudMapExit.clear();
        for (const r of this.map.rooms) {
            if (!r.isBoss) continue;
            this.hudMapExit.rect(MM_X + r.x * s, MM_Y + r.y * s, r.w * s, r.h * s);
        }
        this.hudMapExit.fillColor = this.map.smallCleared ? new Color(214, 66, 66, 235) : new Color(96, 42, 42, 225);
        this.hudMapExit.fill();

        // 门：绿色 = 通，红色 = 锁着（这才是迷宫里最需要的信息）
        this.hudMapDoor.clear();
        this.hudMapDoorLock.clear();
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                const i = cy * COLS + cx;
                if (this.map.tiles[i] !== T_GATE) continue;
                const a = this.map.gateRoom[i];
                const b = this.map.gateRoomB[i];
                let locked = false;
                if (this.map.lockedRoom >= 0 && (this.map.lockedRoom === a || this.map.lockedRoom === b)) locked = true;
                if (!this.map.smallCleared) {
                    const ra = a >= 0 ? this.map.rooms[a] : null;
                    const rb = b >= 0 ? this.map.rooms[b] : null;
                    if ((ra && ra.isBoss) || (rb && rb.isBoss)) locked = true;
                }
                const g = locked ? this.hudMapDoorLock : this.hudMapDoor;
                g.rect(MM_X + cx * s, MM_Y + cy * s, s + 1, s + 1);
            }
        }
        this.hudMapDoor.fillColor = new Color(120, 240, 160, 255);
        this.hudMapDoor.fill();
        this.hudMapDoorLock.fillColor = new Color(240, 90, 90, 255);
        this.hudMapDoorLock.fill();

        // 出口（单独一层，别被 Boss 房的矩形擦掉）
        this.hudMapPoint.clear();
        this.hudMapPoint.circle(MM_X + (this.map.exitCx + 0.5) * s, MM_Y + (this.map.exitCy + 0.5) * s, 5);
        this.hudMapPoint.fillColor = this.map.exitOpen ? COL_GREEN : new Color(215, 90, 90);
        this.hudMapPoint.fill();

        this.hudMapPlayer.clear();
        this.hudMapPlayer.circle(MM_X + this.player.x / TILE * s, MM_Y + this.player.y / TILE * s, 4.5);
        this.hudMapPlayer.fillColor = Color.WHITE;
        this.hudMapPlayer.fill();
    }

    private updateHud(): void {
        const p = this.player;
        if (!p) return;
        this.drawMinimap();
        // 生命值：进度条
        const bw = 150;
        const bh = 16;
        const bx = 16;
        const by = DH - 48;
        const ratio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
        this.hudHpBg.clear();
        this.hudHpBg.rect(bx, by, bw, bh);
        this.hudHpBg.fillColor = new Color(18, 20, 28, 235);
        this.hudHpBg.fill();
        this.hudHpFill.clear();
        if (ratio > 0) {
            this.hudHpFill.rect(bx + 2, by + 2, (bw - 4) * ratio, bh - 4);
            this.hudHpFill.fillColor = ratio > 0.5 ? new Color(90, 210, 130) : ratio > 0.25 ? COL_GOLD : COL_HP;
            this.hudHpFill.fill();
        }
        this.hudHpFill.rect(bx, by, bw, bh);
        this.hudHpFill.strokeColor = new Color(150, 160, 190, 255);
        this.hudHpFill.lineWidth = 2;
        this.hudHpFill.stroke();
        // Boss 血条：只有玩家进了 Boss 大房间才出现；
        // 主角阵亡 / 升级界面 / 下一关开始时都要收起来，不能留着上一关的状态
        const boss = this.enemies.find((e) => e.kind === EK_BOSS);
        const bossRoom = boss ? boss.room : -1;
        const inBossRoom = bossRoom >= 0 && this.curRoom === bossRoom;
        const playing = this.state === ST_PLAY;
        const showBossBar = playing && !!boss && inBossRoom;
        this.hudBossBg.node.active = showBossBar;
        this.hudBossFill.node.active = showBossBar;
        this.hudBossName.node.active = showBossBar;
        // 大血条出现时，boss 身上那个小血条藏掉，避免两条重复
        if (boss) boss.bar.node!.active = playing && !inBossRoom;
        if (showBossBar) {
            const bw2 = 460;
            const bh2 = 18;
            const bx2 = (DW - bw2) / 2;
            const by2 = 50;
            const br = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
            this.hudBossBg.clear();
            this.hudBossBg.rect(bx2 - 3, by2 - 3, bw2 + 6, bh2 + 6);
            this.hudBossBg.fillColor = new Color(10, 6, 10, 235);
            this.hudBossBg.fill();
            this.hudBossFill.clear();
            if (br > 0) {
                this.hudBossFill.rect(bx2, by2, bw2 * br, bh2);
                this.hudBossFill.fillColor = new Color(196, 42, 62, 255);
                this.hudBossFill.fill();
                // 顶部高光
                this.hudBossFill.rect(bx2, by2 + bh2 - 4, bw2 * br, 3);
                this.hudBossFill.fillColor = new Color(255, 120, 130, 255);
                this.hudBossFill.fill();
            }
            // 分段刻度
            this.hudBossFill.rect(bx2, by2, bw2, bh2);
            this.hudBossFill.strokeColor = new Color(255, 130, 140, 255);
            this.hudBossFill.lineWidth = 2;
            this.hudBossFill.stroke();
            for (let i = 1; i < 8; i++) {
                this.hudBossFill.rect(bx2 + (bw2 / 8) * i, by2, 1, bh2);
                this.hudBossFill.fillColor = new Color(0, 0, 0, 150);
                this.hudBossFill.fill();
            }
            this.hudBossName.string = boss.bossStyle ? boss.bossStyle.name : 'B O S S';
        }

        this.hudHpText.string = p.hp + ' / ' + p.maxHp;
        this.hudHpText.color = ratio > 0.25 ? COL_TEXT : COL_HP;
        // 开局提示：主角动一下，这关才开始
        if (!this.levelStarted && this.state === ST_PLAY) {
            this.hudTip.string = '按 WASD / 方向键动一下 —— 这一关正式开始';
            this.hudTip.color = new Color(255, 226, 150);
        } else if (!this.map.smallCleared && this.state === ST_PLAY) {
            this.hudTip.string = '先清光地图上所有小怪，才能进入大房间挑战 Boss';
            this.hudTip.color = new Color(255, 200, 150);
        } else if (this.map.exitOpen && this.state === ST_PLAY) {
            this.hudTip.string = '全图敌人已清光！出口开启 —— 看右上角小地图上的绿点';
            this.hudTip.color = new Color(150, 255, 170);
        } else {
            this.hudTip.string = p.atkType === ATK_GUN
                ? 'WASD 移动    鼠标瞄准    左键射击    Shift 冲刺    1/2/3 换武器'
                : (p.atkType === ATK_SLASH
                    ? 'WASD 移动    鼠标瞄准    左键斩击（要贴近敌人）    Shift 冲刺'
                    : 'WASD 移动    鼠标瞄准    左键放魔法球    Shift 冲刺');
            this.hudTip.color = COL_TEXT;
        }
        // 剩余敌人 = 还要清的小怪数（Boss 有自己的血条 UI，不计入）
        let left = 0;
        for (const e of this.enemies) if (e.kind !== EK_BOSS) left++;
        this.hudInfo.string = `第 ${this.level} 关     金币 ${this.coins}     击杀 ${this.kills}     剩余小怪 ${left}     种子 ${this.runSeed}`;

        // 右下角：射手显示弹匣，骑士显示斩击冷却，法师显示充能
        if (p.atkType === ATK_GUN) {
            const w = this.curWeapon();
            this.hudWeapon.spriteFrame = this.sfs[w.key];
            const mag = Math.max(1, Math.round(w.mag * p.magMul));
            const cur = p.ammo[p.weaponIdx];
            this.hudAmmo.clear();
            this.hudAmmo.rect(0, 0, 120, 10);
            this.hudAmmo.fillColor = new Color(40, 44, 58, 255);
            this.hudAmmo.fill();
            if (p.reloading) {
                const k = 1 - p.reloadT / w.reload;
                this.hudAmmo.rect(0, 0, 120 * Math.max(0, Math.min(1, k)), 10);
                this.hudAmmo.fillColor = new Color(255, 210, 110, 255);
                this.hudAmmo.fill();
                this.hudWeaponName.string = '换 弹 中';
            } else {
                this.hudAmmo.rect(0, 0, 120 * Math.max(0, cur / mag), 10);
                this.hudAmmo.fillColor = cur > 0 ? COL_GOLD : COL_HP;
                this.hudAmmo.fill();
                // 右下角显示的是「弹夹」，不是武器名（武器看图标就知道）
                this.hudWeaponName.string = `弹夹  ${cur}/${mag}`;
            }
        } else {
            const isSlash = p.atkType === ATK_SLASH;
            this.hudWeapon.spriteFrame = this.sfs[isSlash ? 'sword' : 'wand'];
            const cdMax = (isSlash ? 0.5 : 1.5) * p.rateMul;
            const k = Math.max(0, Math.min(1, 1 - p.fireCd / cdMax));
            this.hudAmmo.clear();
            this.hudAmmo.rect(0, 0, 120, 10);
            this.hudAmmo.fillColor = new Color(40, 44, 58, 255);
            this.hudAmmo.fill();
            this.hudAmmo.rect(0, 0, 120 * k, 10);
            this.hudAmmo.fillColor = isSlash ? new Color(150, 220, 255, 255) : new Color(190, 140, 255, 255);
            this.hudAmmo.fill();
            this.hudWeaponName.string = isSlash ? '斩 击' : '充 能';
        }
    }
}

/**
 * 场景文件里用的是压缩后的 uuid，不同版本引擎注册脚本类 id 的方式不完全一致，
 * 这里把「完整 uuid」和「压缩 uuid」都登记一份，保证场景能正确找到这个组件。
 */
const SCRIPT_UUID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c02';
const SCRIPT_UUID_C = '1aKzxNXm9Ke4ydDh8qO0wC';
(js as any)._idToClass[SCRIPT_UUID] = Game;
(js as any)._idToClass[SCRIPT_UUID_C] = Game;
