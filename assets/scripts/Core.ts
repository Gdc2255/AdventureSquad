import { Color, Graphics, Layers, Node, UITransform } from 'cc';

/**
 * 素材统一为 16x16 像素图，瓦片按 2 倍放大 = 32px。
 * 地图用「区域 + 长廊」结构：先把画面切成大格子，每格放一个大小随机的房间，
 * 再用 L 形走廊把房间串起来（不是死板的等大格子房间）。
 */
export const TILE = 32;

/** 粗网格：一格 = 一个候选房间的范围 */
export const CELL_W = 21;
export const CELL_H = 15;
export const CELL_COLS = 4;
export const CELL_ROWS = 2;
export const COLS = CELL_W * CELL_COLS;   // 84 格
export const ROWS = CELL_H * CELL_ROWS;   // 30 格
export const MAP_W = COLS * TILE;         // 2688 px
export const MAP_H = ROWS * TILE;         // 1440 px
/** 设计分辨率（一屏） */
export const DW = 960;
export const DH = 640;

export const T_EMPTY = 0;   // 可走地面
export const T_WALL = 1;    // 实心岩石
export const T_GATE = 2;    // 房门（清空房间后开启）
export const T_EXIT = 3;    // 出口

/** gfx Filter.POINT（引擎未导出枚举，这里用数值） */
export const FILTER_POINT = 1;

/** 实心道具（会挡路） */
export const PROP_KEYS = ['crate', 'barrel', 'pot', 'table', 'pillar'];

export const COL_BG = new Color(18, 20, 28);
export const COL_FLOOR = new Color(38, 43, 56);
export const COL_SHADOW = new Color(0, 0, 0, 90);
/** 地板/墙体的贴图染色（贴图偏亮，压暗后角色才跳得出来） */
export const TINT_FLOOR = new Color(96, 106, 128);
export const TINT_FLOOR2 = new Color(90, 98, 118);
export const TINT_WALL = new Color(238, 242, 250);
export const TINT_GRASS = new Color(74, 94, 68);
export const TINT_PANEL = new Color(10, 12, 20, 165);
export const COL_TEXT = new Color(232, 238, 248);
export const COL_DARK = new Color(12, 14, 20);
export const COL_HP = new Color(235, 70, 70);
export const COL_HEART = new Color(255, 92, 132);
export const COL_HEART_BG = new Color(92, 96, 116);
export const COL_BULLET = new Color(255, 236, 150);
export const COL_EBULLET = new Color(255, 130, 130);
export const COL_GOLD = new Color(255, 206, 80);
export const COL_GREEN = new Color(90, 210, 130);
export const COL_FLASH = new Color(255, 240, 190);
export const COL_HURT = new Color(255, 120, 120);

/** 创建一个 2D 节点（UI_2D 层，必须挂在 Canvas 下面才会被渲染） */
export function mkNode(parent: Node, name: string): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    n.setParent(parent);
    const t = n.addComponent(UITransform);
    t.setContentSize(8, 8);
    return n;
}

export function mkGfx(parent: Node, name: string): Graphics {
    return mkNode(parent, name).addComponent(Graphics);
}

export function drawCircle(g: Graphics, x: number, y: number, r: number, fill: Color, stroke?: Color, lw = 2): void {
    g.clear();
    g.circle(x, y, r);
    g.fillColor = fill;
    g.fill();
    if (stroke) {
        g.strokeColor = stroke;
        g.lineWidth = lw;
        g.stroke();
    }
}

export function drawRect(g: Graphics, x: number, y: number, w: number, h: number, fill: Color): void {
    g.clear();
    g.rect(x, y, w, h);
    g.fillColor = fill;
    g.fill();
}

/** 画一个心形（两圆 + 三角，同色一次填充） */
export function drawHeart(g: Graphics, x: number, y: number, s: number, color: Color): void {
    g.clear();
    g.circle(x - s * 0.45, y + s * 0.25, s * 0.5);
    g.circle(x + s * 0.45, y + s * 0.25, s * 0.5);
    g.moveTo(x - s * 0.95, y + s * 0.15);
    g.lineTo(x, y - s * 0.95);
    g.lineTo(x + s * 0.95, y + s * 0.15);
    g.fillColor = color;
    g.fill();
}

/** 一个房间（区域） */
export interface RoomInfo {
    x: number; y: number; w: number; h: number;   // 外框（含 1 格墙）
    cx: number; cy: number;                        // 中心（格）
    cellX: number; cellY: number;                  // 所在的大格
    cleared: boolean;
    spawned: boolean;
    isBoss: boolean;                                // Boss 房（更大，离起点最远）
    gates: { cx: number; cy: number }[];
}

/**
 * 迷宫地图：多个大小不一的房间 + L 形走廊相连。
 * 走廊口是房门，清空所在房间后开启；出口在离起点最远的房间。
 */
export class MapGrid {
    tiles = new Uint8Array(COLS * ROWS);
    props = new Int8Array(COLS * ROWS);      // -1 = 无，>=0 是 PROP_KEYS 的下标
    gateRoom = new Int16Array(COLS * ROWS);  // 房门这头是哪个房间
    gateRoomB = new Int16Array(COLS * ROWS); // 房门那头（走廊另一端）是哪个房间
    roomOf = new Int16Array(COLS * ROWS);    // 格子属于哪个房间（走廊为 -1）
    decos: { cx: number; cy: number; key: string }[] = [];
    rooms: RoomInfo[] = [];
    exitCx = 0;
    exitCy = 0;
    exitOpen = false;
    /** 寻路用的距离场：dist[i] = 到目标的步数，-1 表示走不到 */
    dist = new Int32Array(COLS * ROWS);
    /** 当前被关在哪个房间里（该房间还有活怪时门会锁上），-1 = 没锁 */
    lockedRoom = -1;
    /** 全图小怪是否已清光（没清完之前进不去 Boss 房） */
    smallCleared = false;
    /** 已经挖过长廊的房间对（"a,b"），用来避免重复连同一对房间 */
    private linked = new Set<string>();
    private bfsQueue = new Int32Array(COLS * ROWS);

    idx(cx: number, cy: number): number {
        return cy * COLS + cx;
    }

    at(cx: number, cy: number): number {
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return T_WALL;
        return this.tiles[cy * COLS + cx];
    }

    /** 房间索引：玩家所在位置属于哪个房间，走廊返回 -1 */
    roomIndexAt(x: number, y: number): number {
        const cx = Math.floor(x / TILE);
        const cy = Math.floor(y / TILE);
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;
        return this.roomOf[cy * COLS + cx];
    }

    solid(cx: number, cy: number): boolean {
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
        const i = cy * COLS + cx;
        const t = this.tiles[i];
        if (t === T_WALL) return true;
        if (t === T_GATE) {
            const a = this.gateRoom[i];
            const b = this.gateRoomB[i];
            // 1) 玩家所在的房间还有活怪 -> 这间房的门锁上
            if (this.lockedRoom >= 0 && (this.lockedRoom === a || this.lockedRoom === b)) return true;
            // 2) Boss 房：全图小怪没清完之前，门锁着（进不去挑战 Boss）
            if (!this.smallCleared) {
                if (a >= 0 && this.rooms[a] && this.rooms[a].isBoss) return true;
                if (b >= 0 && this.rooms[b] && this.rooms[b].isBoss) return true;
            }
            return false;
        }
        if (t === T_EXIT) return !this.exitOpen;
        return this.props[i] >= 0;
    }

    solidAt(x: number, y: number): boolean {
        return this.solid(Math.floor(x / TILE), Math.floor(y / TILE));
    }

    // -------------------------------------------------------------- 生成

    gen(rng: () => number, level: number): void {
        this.tiles.fill(T_WALL);
        this.props.fill(-1);
        this.gateRoom.fill(-1);
        this.roomOf.fill(-1);
        this.decos.length = 0;
        this.rooms.length = 0;
        this.exitOpen = false;
        this.linked.clear();

        // 0) 离起点最远的格子 = Boss 房（房间更大）
        let bossCell = 0;
        let farD = -1;
        for (let i = 0; i < CELL_COLS * CELL_ROWS; i++) {
            const rx = i % CELL_COLS;
            const ry = Math.floor(i / CELL_COLS);
            const d = rx * rx + ry * ry;
            if (d > farD) { farD = d; bossCell = i; }
        }

        // 1) 每个粗格子放一个大小随机的房间（Boss 房几乎占满整格）
        for (let ry = 0; ry < CELL_ROWS; ry++) {
            for (let rx = 0; rx < CELL_COLS; rx++) {
                const ox = rx * CELL_W;
                const oy = ry * CELL_H;
                const isBoss = (ry * CELL_COLS + rx) === bossCell;
                const w = isBoss ? CELL_W - 2 : 8 + Math.floor(rng() * (CELL_W - 13));
                // Boss 房留 2 行的余量，保证「格子间隙」那两行永远是空的（走廊拐弯要用）
                const h = isBoss ? CELL_H - 3 : 7 + Math.floor(rng() * (CELL_H - 12));
                const x = isBoss ? ox + 1 : ox + 2 + Math.floor(rng() * (CELL_W - w - 3));
                const y = isBoss ? oy + 1 : oy + 2 + Math.floor(rng() * (CELL_H - h - 3));
                const room: RoomInfo = {
                    x, y, w, h,
                    cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2),
                    cellX: rx, cellY: ry,
                    cleared: false, spawned: false, isBoss, gates: [],
                };
                this.rooms.push(room);
                // 挖房间内部
                for (let cy = y + 1; cy < y + h - 1; cy++) {
                    for (let cx = x + 1; cx < x + w - 1; cx++) {
                        this.tiles[this.idx(cx, cy)] = T_EMPTY;
                        this.roomOf[this.idx(cx, cy)] = this.rooms.length - 1;
                    }
                }
            }
        }

        // 2) 连通：随机生成树 + 少量额外环路
        const cellIdx = (rx: number, ry: number) => ry * CELL_COLS + rx;
        const connected = new Array(CELL_COLS * CELL_ROWS).fill(false);
        const stack: number[] = [0];
        connected[0] = true;
        while (stack.length) {
            const cur = stack[stack.length - 1];
            const rx = cur % CELL_COLS;
            const ry = Math.floor(cur / CELL_COLS);
            const cand: number[] = [];
            if (rx > 0) cand.push(cellIdx(rx - 1, ry));
            if (rx < CELL_COLS - 1) cand.push(cellIdx(rx + 1, ry));
            if (ry > 0) cand.push(cellIdx(rx, ry - 1));
            if (ry < CELL_ROWS - 1) cand.push(cellIdx(rx, ry + 1));
            // 随机打乱后，找一个「还没连通」的邻居（不能随便挑到已连通的就把栈弹掉，
            // 否则会漏掉房间，导致某些房间没有长廊）
            for (let i = cand.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
            }
            let nxt = -1;
            for (const cd of cand) {
                if (!connected[cd]) { nxt = cd; break; }
            }
            if (nxt < 0) { stack.pop(); continue; }
            connected[nxt] = true;
            stack.push(nxt);
            this.connectRooms(rng, this.rooms[cur], this.rooms[nxt]);
        }
        // 额外环路，让迷宫不是纯树（只连「正交」相邻的格子，斜着连会挖出没用的走廊）
        const extra = 4 + Math.floor(rng() * 4);
        for (let i = 0; i < extra; i++) {
            const rx = Math.floor(rng() * CELL_COLS);
            const ry = Math.floor(rng() * CELL_ROWS);
            const horiz = rng() < 0.5;
            const rx2 = horiz ? rx + (rng() < 0.5 ? 1 : -1) : rx;
            const ry2 = horiz ? ry : ry + (rng() < 0.5 ? 1 : -1);
            if (rx2 < 0 || ry2 < 0 || rx2 >= CELL_COLS || ry2 >= CELL_ROWS) continue;
            this.connectRooms(rng, this.rooms[cellIdx(rx, ry)], this.rooms[cellIdx(rx2, ry2)]);
        }

        // 2.5) 连通性自检 + 修补：万一还有房间连不上，直接补一条长廊
        this.ensureConnected(rng);

        // 2.6) 每个房间至少 2 扇门：只有一个门的房间是死胡同，打完怪只能原路返回
        this.ensureDoors(rng);

        // 2.7) Boss 房不能是「必经之路」：它要等全图小怪清零才开，
        // 如果有房间只能穿过 boss 房才能到，那些怪就永远打不到 -> 整局通不了关。
        this.ensureBossNotRequired(rng);

        // 3) 房间边框上被走廊挖开的格子 = 房门
        for (const room of this.rooms) {
            const ring: { cx: number; cy: number }[] = [];
            for (let cx = room.x; cx < room.x + room.w; cx++) {
                ring.push({ cx, cy: room.y });
                ring.push({ cx, cy: room.y + room.h - 1 });
            }
            for (let cy = room.y + 1; cy < room.y + room.h - 1; cy++) {
                ring.push({ cx: room.x, cy });
                ring.push({ cx: room.x + room.w - 1, cy });
            }
            for (const t of ring) {
                if (this.at(t.cx, t.cy) !== T_GATE) continue;
                room.gates.push(t);
            }
        }

        // 4) 出口：Boss 房的墙上（Boss 守着出口）
        let far = 0;
        for (let i = 0; i < this.rooms.length; i++) {
            if (this.rooms[i].isBoss) { far = i; break; }
        }
        const fr = this.rooms[far];
        const free: { cx: number; cy: number }[] = [];
        // **不能放在房间角落**：角落的出口玩家挤不进去（两面墙会把人推开，
        // 离出口中心还差一点点，触发不了 -> 这关永远过不去）
        const isCorner = (cx: number, cy: number): boolean =>
            (cx === fr.x || cx === fr.x + fr.w - 1) && (cy === fr.y || cy === fr.y + fr.h - 1);
        for (let cx = fr.x; cx < fr.x + fr.w; cx++) {
            if (this.at(cx, fr.y) === T_WALL && !isCorner(cx, fr.y)) free.push({ cx, cy: fr.y });
            if (this.at(cx, fr.y + fr.h - 1) === T_WALL && !isCorner(cx, fr.y + fr.h - 1)) free.push({ cx, cy: fr.y + fr.h - 1 });
        }
        for (let cy = fr.y + 1; cy < fr.y + fr.h - 1; cy++) {
            if (this.at(fr.x, cy) === T_WALL) free.push({ cx: fr.x, cy });
            if (this.at(fr.x + fr.w - 1, cy) === T_WALL) free.push({ cx: fr.x + fr.w - 1, cy });
        }
        if (free.length) {
            const e = free[Math.floor(rng() * free.length)];
            this.exitCx = e.cx;
            this.exitCy = e.cy;
            this.tiles[this.idx(e.cx, e.cy)] = T_EXIT;
        } else {
            this.exitCx = fr.cx;
            this.exitCy = fr.cy;
        }

        // 5) 房间里的装饰与道具
        for (const room of this.rooms) {
            const n = 3 + Math.floor(rng() * 4);
            for (let i = 0; i < n; i++) {
                const cx = room.x + 1 + Math.floor(rng() * (room.w - 2));
                const cy = room.y + 1 + Math.floor(rng() * (room.h - 2));
                if (this.at(cx, cy) !== T_EMPTY) continue;
                const r = rng();
                const key = r < 0.4 ? 'grass' : r < 0.6 ? 'flowers' : r < 0.75 ? 'rubble' : r < 0.85 ? 'bone' : r < 0.93 ? 'mushroom' : 'rock';
                this.decos.push({ cx, cy, key });
            }
            const pn = 1 + Math.floor(rng() * 3);
            for (let i = 0; i < pn; i++) {
                const cx = room.x + 1 + Math.floor(rng() * (room.w - 2));
                const cy = room.y + 1 + Math.floor(rng() * (room.h - 2));
                if (this.at(cx, cy) !== T_EMPTY) continue;
                // 门口一格别放箱子：否则箱子会把门的通道堵死，
                // 那间房就永远进不去 -> 里面的怪杀不掉 -> 小怪永远不清零 -> Boss 房进不去
                if (this.nearExit(cx, cy)) continue;      // 出口旁边别放箱子
                if (this.nearGate(cx, cy)) continue;
                this.props[this.idx(cx, cy)] = Math.floor(rng() * PROP_KEYS.length);
            }
        }

        // 5.5) 兜底：万一还有房间被道具堵死，撤掉那个房间的道具
        for (let pass = 0; pass < 4; pass++) {
            const bad = this.unreachableRooms();
            if (!bad.length) break;
            for (const ri of bad) {
                const r = this.rooms[ri];
                for (let cy = r.y + 1; cy < r.y + r.h - 1; cy++) {
                    for (let cx = r.x + 1; cx < r.x + r.w - 1; cx++) {
                        this.props[this.idx(cx, cy)] = -1;
                    }
                }
            }
        }
    }

    /** 这格是不是紧挨着出口（出口前要能站人） */
    private nearExit(cx: number, cy: number): boolean {
        return (cx === this.exitCx && Math.abs(cy - this.exitCy) === 1)
            || (cy === this.exitCy && Math.abs(cx - this.exitCx) === 1);
    }

    /** 这格是不是紧挨着房门（门口通道不能被箱子占） */
    private nearGate(cx: number, cy: number): boolean {
        if (this.at(cx - 1, cy) === T_GATE) return true;
        if (this.at(cx + 1, cy) === T_GATE) return true;
        if (this.at(cx, cy - 1) === T_GATE) return true;
        if (this.at(cx, cy + 1) === T_GATE) return true;
        return false;
    }

    /** 生成时用的「能不能走」（忽略门锁和出口状态，只看墙和道具） */
    private walkableGen(cx: number, cy: number): boolean {
        if (!cx2ok(cx, cy)) return false;
        const i = this.idx(cx, cy);
        if (this.tiles[i] === T_WALL) return false;
        return this.props[i] < 0;
    }

    /** 哪些房间从第一个房间走不到（道具堵死通道时用） */
    private unreachableRooms(): number[] {
        const reach = new Uint8Array(COLS * ROWS);
        const q = new Int32Array(COLS * ROWS);
        let head = 0;
        let tail = 0;
        const r0 = this.rooms[0];
        const s = this.idx(r0.cx, r0.cy);
        reach[s] = 1;
        q[tail++] = s;
        while (head < tail) {
            const cur = q[head++];
            const cx = cur % COLS;
            const cy = (cur / COLS) | 0;
            for (let d = 0; d < 4; d++) {
                const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
                const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (!this.walkableGen(nx, ny)) continue;
                const ni = this.idx(nx, ny);
                if (reach[ni]) continue;
                reach[ni] = 1;
                q[tail++] = ni;
            }
        }
        const bad: number[] = [];
        for (let i = 0; i < this.rooms.length; i++) {
            const r = this.rooms[i];
            let ok = false;
            for (let cy = r.y + 1; cy < r.y + r.h - 1 && !ok; cy++) {
                for (let cx = r.x + 1; cx < r.x + r.w - 1 && !ok; cx++) {
                    if (reach[this.idx(cx, cy)]) ok = true;
                }
            }
            if (!ok) bad.push(i);
        }
        return bad;
    }

    /** 房间边框那一圈 */
    private onRing(r: RoomInfo, cx: number, cy: number): boolean {
        if (cx < r.x || cx >= r.x + r.w || cy < r.y || cy >= r.y + r.h) return false;
        return cx === r.x || cx === r.x + r.w - 1 || cy === r.y || cy === r.y + r.h - 1;
    }

    /**
     * 挑战模式：一张巨大的竞技场（中间只有一只 Boss，没有小怪）。
     * 场地就是一间大房间，四周留墙，中间摆几根柱子当掩体。
     */
    genArena(rng: () => number): void {
        this.tiles.fill(T_WALL);
        this.props.fill(-1);
        this.gateRoom.fill(-1);
        this.roomOf.fill(-1);
        this.decos.length = 0;
        this.rooms.length = 0;
        this.exitOpen = false;
        this.linked.clear();

        const w = 36;
        const h = 22;
        const x = Math.floor((COLS - w) / 2);
        const y = Math.floor((ROWS - h) / 2);
        const room: RoomInfo = {
            x, y, w, h,
            cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2),
            cellX: 0, cellY: 0,
            cleared: false, spawned: false, isBoss: true, gates: [],
        };
        this.rooms.push(room);
        for (let cy = y + 1; cy < y + h - 1; cy++) {
            for (let cx = x + 1; cx < x + w - 1; cx++) {
                this.tiles[this.idx(cx, cy)] = T_EMPTY;
                this.roomOf[this.idx(cx, cy)] = 0;
            }
        }
        // 四根柱子当掩体（对称排成菱形）
        const midX = x + Math.floor(w / 2);
        const midY = y + Math.floor(h / 2);
        for (const d of [[-9, -5], [9, -5], [-9, 5], [9, 5]]) {
            this.tiles[this.idx(midX + d[0], midY + d[1])] = T_WALL;
        }
        // 场地装饰（碎石、骨头）
        for (let i = 0; i < 26; i++) {
            const cx = x + 2 + Math.floor(rng() * (w - 4));
            const cy = y + 2 + Math.floor(rng() * (h - 4));
            if (this.at(cx, cy) !== T_EMPTY) continue;
            this.decos.push({ cx, cy, key: rng() < 0.55 ? 'rubble' : 'bone' });
        }
        this.exitCx = midX;
        this.exitCy = midY;
    }

    /**
     * 在两间房之间挖走廊：房间 → 格子间隙 → 房间。
     *
     * 房间之间恒定留 2 格宽的「间隙」（列方向/行方向），走廊在间隙里可以拐个弯，
     * 所以**不管两间房在垂直于连线的方向上是否重叠，都一定能连上**。
     * （旧写法要求两房重叠，否则静默放弃这条连接 → 某些房间根本没有长廊。）
     */
    private connectRooms(rng: () => number, a: RoomInfo, b: RoomInfo): boolean {
        const dx = Math.sign(b.cellX - a.cellX);
        const dy = Math.sign(b.cellY - a.cellY);
        if (dx !== 0 && dy !== 0) return false;   // 斜邻不连
        if (dx === 0 && dy === 0) return false;
        const ia = this.rooms.indexOf(a);
        const ib = this.rooms.indexOf(b);
        if (dx !== 0) {
            // 横向相邻：间隙在「列」方向，gx / gx+1 两列
            const L = dx > 0 ? a : b;               // 左边的房间
            const R = dx > 0 ? b : a;               // 右边的房间
            const gx = (L.cellX + 1) * CELL_W - 1;
            const yL = L.y + 1 + Math.floor(rng() * (L.h - 3));
            const yR = R.y + 1 + Math.floor(rng() * (R.h - 3));
            this.carveH(L.x + L.w - 1, gx + 1, yL);   // 左房右墙 → 间隙
            this.carveV(yL, yR, gx);                 // 间隙里拐弯
            this.carveH(gx, R.x, yR);                 // 间隙 → 右房左墙
            this.linkGate(L.x + L.w - 1, yL, ia, ib);
            this.linkGate(L.x + L.w - 1, yL + 1, ia, ib);
            this.linkGate(R.x, yR, ia, ib);
            this.linkGate(R.x, yR + 1, ia, ib);
            this.linked.add(this.linkKey(ia, ib));
            return true;
        }
        // 纵向相邻：间隙在「行」方向，gy / gy+1 两行
        const T = dy > 0 ? a : b;                   // 上面的房间
        const B = dy > 0 ? b : a;                   // 下面的房间
        const gy = (T.cellY + 1) * CELL_H - 1;
        const xT = T.x + 1 + Math.floor(rng() * (T.w - 3));
        const xB = B.x + 1 + Math.floor(rng() * (B.w - 3));
        this.carveV(T.y + T.h - 1, gy + 1, xT);       // 上房下墙 → 间隙
        this.carveH(xT, xB, gy);                     // 间隙里拐弯
        this.carveV(gy, B.y, xB);                     // 间隙 → 下房上墙
        this.linkGate(T.y + T.h - 1, xT, ia, ib);
        this.linkGate(T.y + T.h - 1, xT + 1, ia, ib);
        this.linkGate(B.y, xB, ia, ib);
        this.linkGate(B.y, xB + 1, ia, ib);
        this.linked.add(this.linkKey(ia, ib));
        return true;
    }

    private linkKey(a: number, b: number): string {
        return a < b ? `${a},${b}` : `${b},${a}`;
    }

    /** 相邻格子里的房间 */
    private cellNeighbors(room: RoomInfo): number[] {
        const out: number[] = [];
        const i = this.rooms.indexOf(room);
        if (room.cellX > 0) out.push(i - 1);
        if (room.cellX < CELL_COLS - 1) out.push(i + 1);
        if (room.cellY > 0) out.push(i - CELL_COLS);
        if (room.cellY < CELL_ROWS - 1) out.push(i + CELL_COLS);
        return out;
    }

    /**
     * Boss 房不能是「必经之路」。
     * Boss 房要等全图小怪清零才开门，如果某个房间只能**穿过 boss 房**才能到达，
     * 那间房的怪就永远打不到 -> 小怪永远不清零 -> boss 房永远开不了 -> 整局死锁。
     * 这里检查「去掉 boss 房后其余房间是否仍然连通」，不通就补一条绕过 boss 房的长廊。
     */
    private ensureBossNotRequired(rng: () => number): void {
        for (let pass = 0; pass < 24; pass++) {
            // 房间邻接图（两间房之间有长廊就连一条边）
            const adj: number[][] = this.rooms.map(() => []);
            this.linked.forEach((key) => {
                const [a, b] = key.split(',').map(Number);
                adj[a].push(b);
                adj[b].push(a);
            });
            const br = this.rooms.findIndex(r => r.isBoss);
            // 去掉 boss 房，从 0 号房做 BFS
            const seen = new Set<number>([0]);
            const q = [0];
            while (q.length) {
                const cur = q.pop()!;
                for (const nb of adj[cur]) {
                    if (nb === br || seen.has(nb)) continue;
                    seen.add(nb);
                    q.push(nb);
                }
            }
            const miss: number[] = [];
            for (let i = 0; i < this.rooms.length; i++) {
                if (i !== br && !seen.has(i)) miss.push(i);
            }
            if (!miss.length) return;      // 去掉 boss 房也照样全通 ✓
            // 把够不到的房间接到够得到的房间上（必须是正交相邻的格子才挖得了走廊）
            let fixed = false;
            for (const mi of miss) {
                for (const n of this.cellNeighbors(this.rooms[mi])) {
                    if (n === br) continue;            // 不能靠 boss 房当中转
                    if (!seen.has(n)) continue;        // 要接一个够得到的
                    if (this.linked.has(this.linkKey(mi, n))) continue;
                    if (this.connectRooms(rng, this.rooms[mi], this.rooms[n])) { fixed = true; break; }
                }
                if (fixed) break;
            }
            if (!fixed) return;
        }
    }

    /**
     * 每个房间至少 2 扇门：只有一个门的房间是「死胡同」，
     * 打完怪只能原路返回，来回跑很烦。这里给它再接一条长廊。
     */
    private ensureDoors(rng: () => number): void {
        for (let pass = 0; pass < 3; pass++) {
            let changed = false;
            for (let i = 0; i < this.rooms.length; i++) {
                const room = this.rooms[i];
                // 这个房间的门还没统计（gate 收集在后面），先用地图上的门格数
                let gates = 0;
                for (let cx = room.x; cx < room.x + room.w; cx++) {
                    if (this.at(cx, room.y) === T_GATE) gates++;
                    if (this.at(cx, room.y + room.h - 1) === T_GATE) gates++;
                }
                for (let cy = room.y + 1; cy < room.y + room.h - 1; cy++) {
                    if (this.at(room.x, cy) === T_GATE) gates++;
                    if (this.at(room.x + room.w - 1, cy) === T_GATE) gates++;
                }
                if (gates >= 4) continue;      // 已经有 2 扇门
                for (const n of this.cellNeighbors(room)) {
                    if (n < 0 || n >= this.rooms.length) continue;
                    if (this.linked.has(this.linkKey(i, n))) continue;   // 已经连过了
                    if (this.connectRooms(rng, room, this.rooms[n])) { changed = true; break; }
                }
            }
            if (!changed) break;
        }
    }

    /** 登记一个门格子的两端房间（gateRoom / gateRoomB） */
    private linkGate(cx: number, cy: number, a: number, b: number): void {
        if (!cx2ok(cx, cy)) return;
        const i = this.idx(cx, cy);
        if (this.tiles[i] !== T_GATE) return;
        this.gateRoom[i] = a;
        this.gateRoomB[i] = b;
    }

    /**
     * 连通性自检 + 修补：从第一个房间出发洪水填充（门当成通路），
     * 如果有房间完全走不到，就给它和某个走得到的邻居补一条长廊。
     */
    private ensureConnected(rng: () => number): void {
        for (let pass = 0; pass < 30; pass++) {
            const reach = new Uint8Array(COLS * ROWS);
            const q = new Int32Array(COLS * ROWS);
            let head = 0;
            let tail = 0;
            const r0 = this.rooms[0];
            const s0 = this.idx(r0.cx, r0.cy);
            reach[s0] = 1;
            q[tail++] = s0;
            while (head < tail) {
                const cur = q[head++];
                const cx = cur % COLS;
                const cy = (cur / COLS) | 0;
                for (let d = 0; d < 4; d++) {
                    const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
                    const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                    if (!cx2ok(nx, ny)) continue;
                    const ni = this.idx(nx, ny);
                    if (reach[ni]) continue;
                    if (this.tiles[ni] === T_WALL) continue;
                    reach[ni] = 1;
                    q[tail++] = ni;
                }
            }
            // 哪些房间走不到
            const roomReach: boolean[] = [];
            for (let i = 0; i < this.rooms.length; i++) {
                const r = this.rooms[i];
                let ok = false;
                for (let cy = r.y + 1; cy < r.y + r.h - 1 && !ok; cy++) {
                    for (let cx = r.x + 1; cx < r.x + r.w - 1 && !ok; cx++) {
                        if (reach[this.idx(cx, cy)]) ok = true;
                    }
                }
                roomReach.push(ok);
            }
            let missing = -1;
            for (let i = 0; i < this.rooms.length && missing < 0; i++) {
                if (!roomReach[i]) missing = i;
            }
            if (missing < 0) return;   // 全部连通 ✓
            // 补一条长廊：优先接到「已经走得到」的邻居房间
            const r = this.rooms[missing];
            const nb: number[] = [];
            if (r.cellX > 0) nb.push(missing - 1);
            if (r.cellX < CELL_COLS - 1) nb.push(missing + 1);
            if (r.cellY > 0) nb.push(missing - CELL_COLS);
            if (r.cellY < CELL_ROWS - 1) nb.push(missing + CELL_COLS);
            let fixed = false;
            for (const n of nb) {
                if (n < 0 || n >= this.rooms.length) continue;
                if (!roomReach[n]) continue;          // 邻居自己也是孤立的，先跳过
                if (this.connectRooms(rng, r, this.rooms[n])) { fixed = true; break; }
            }
            if (!fixed) {
                // 没有已连通的正交邻居：随便连一个，下一轮再修
                for (const n of nb) {
                    if (n < 0 || n >= this.rooms.length) continue;
                    if (this.connectRooms(rng, r, this.rooms[n])) { fixed = true; break; }
                }
            }
            if (!fixed) return;
        }
    }

    private carveH(x0: number, x1: number, y: number): void {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        for (let x = lo; x <= hi; x++) {
            for (let d = 0; d < 2; d++) {
                this.carveTile(x, y + d);
            }
        }
    }

    private carveV(y0: number, y1: number, x: number): void {
        const lo = Math.min(y0, y1);
        const hi = Math.max(y0, y1);
        for (let y = lo; y <= hi; y++) {
            for (let d = 0; d < 2; d++) {
                this.carveTile(x + d, y);
            }
        }
    }

    /** 挖一格：如果是房间边框，就变成房门 */
    private carveTile(cx: number, cy: number): void {
        if (!cx2ok(cx, cy)) return;
        const i = this.idx(cx, cy);
        if (this.tiles[i] === T_GATE) return;
        let owner = -1;
        for (const r of this.rooms) {
            if (this.onRing(r, cx, cy)) { owner = this.rooms.indexOf(r); break; }
        }
        if (owner >= 0) {
            this.tiles[i] = T_GATE;
            this.gateRoom[i] = owner;
            this.gateRoomB[i] = owner;
        } else {
            this.tiles[i] = T_EMPTY;
        }
    }

    // -------------------------------------------------------------- 寻路

    /**
     * 从目标格做一次 BFS，算出全场到目标的距离。
     * 所有敌人共用这一张距离场，比每个敌人各跑一次搜索便宜得多。
     * 关闭的房门算实心，所以没开的门那头的敌人会原地待命。
     */
    computeFlow(tx: number, ty: number): void {
        this.dist.fill(-1);
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
        if (this.solid(tx, ty)) {
            // 目标格子不可走（极少���），退一步找最近的可走格
            let found = false;
            for (let r = 1; r <= 2 && !found; r++) {
                for (let dy = -r; dy <= r && !found; dy++) {
                    for (let dx = -r; dx <= r && !found; dx++) {
                        const nx = tx + dx, ny = ty + dy;
                        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
                        if (this.solid(nx, ny)) continue;
                        tx = nx; ty = ny; found = true;
                    }
                }
            }
            if (!found) return;
        }
        const q = this.bfsQueue;
        let head = 0;
        let tail = 0;
        const start = this.idx(tx, ty);
        this.dist[start] = 0;
        q[tail++] = start;
        while (head < tail) {
            const cur = q[head++];
            const cx = cur % COLS;
            const cy = (cur / COLS) | 0;
            const nd = this.dist[cur] + 1;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
                    const ni = ny * COLS + nx;
                    if (this.dist[ni] >= 0) continue;
                    if (this.solid(nx, ny)) continue;
                    // 不允许斜着穿墙角
                    if (dx !== 0 && dy !== 0) {
                        if (this.solid(cx + dx, cy) || this.solid(cx, cy + dy)) continue;
                    }
                    this.dist[ni] = nd;
                    q[tail++] = ni;
                }
            }
        }
    }

    /** 某个格子的距离（-1 = 走不到） */
    distAt(cx: number, cy: number): number {
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;
        return this.dist[cy * COLS + cx];
    }

    /** 从 (cx,cy) 出发，下一步该往哪走（距离最小的邻居） */
    bestStep(cx: number, cy: number): { cx: number; cy: number } | null {
        const cur = this.distAt(cx, cy);
        if (cur < 0) return null;
        let bx = -1;
        let by = -1;
        let bd = cur;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                const nd = this.distAt(nx, ny);
                if (nd < 0 || nd >= bd) continue;
                if (dx !== 0 && dy !== 0) {
                    if (this.solid(cx + dx, cy) || this.solid(cx, cy + dy)) continue;
                }
                bd = nd;
                bx = nx;
                by = ny;
            }
        }
        if (bx < 0) return null;
        return { cx: bx, cy: by };
    }

    /**
     * 次优走法：除了 bestStep 之外的另一个邻居（距离场里第二小的）。
     * 敌人卡在箱子角上时，改走另一条路绕过去（比硬挪位置自然，不会瞬移）。
     */
    bestStepAlt(cx: number, cy: number): { cx: number; cy: number } | null {
        const cur = this.distAt(cx, cy);
        if (cur < 0) return null;
        let b1x = -1, b1y = -1, b1d = cur;
        let b2x = -1, b2y = -1, b2d = cur;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                const nd = this.distAt(nx, ny);
                if (nd < 0) continue;
                if (dx !== 0 && dy !== 0) {
                    if (this.solid(cx + dx, cy) || this.solid(cx, cy + dy)) continue;
                }
                if (nd < b1d) {
                    b2x = b1x; b2y = b1y; b2d = b1d;
                    b1x = nx; b1y = ny; b1d = nd;
                } else if (nd < b2d) {
                    b2x = nx; b2y = ny; b2d = nd;
                }
            }
        }
        return b2x >= 0 ? { cx: b2x, cy: b2y } : null;
    }

    /** 圆与瓦片/道具的碰撞检测 */
    collides(x: number, y: number, r: number): boolean {
        const c0 = Math.floor((x - r) / TILE);
        const c1 = Math.floor((x + r) / TILE);
        const r0 = Math.floor((y - r) / TILE);
        const r1 = Math.floor((y + r) / TILE);
        for (let cy = r0; cy <= r1; cy++) {
            for (let cx = c0; cx <= c1; cx++) {
                if (!this.solid(cx, cy)) continue;
                const bx = cx * TILE;
                const by = cy * TILE;
                const nx = Math.max(bx, Math.min(x, bx + TILE));
                const ny = Math.max(by, Math.min(y, by + TILE));
                const dx = x - nx;
                const dy = y - ny;
                if (dx * dx + dy * dy < r * r) return true;
            }
        }
        return false;
    }

    /** 分轴移动，撞墙可以沿墙滑动 */
    move(pos: { x: number; y: number }, r: number, dx: number, dy: number): void {
        if (dx !== 0 && !this.collides(pos.x + dx, pos.y, r)) pos.x += dx;
        if (dy !== 0 && !this.collides(pos.x, pos.y + dy, r)) pos.y += dy;
    }

    /** 找一个离 (px,py) 至少 dist 像素、且可以站的格子中心 */
    randomFloor(rng: () => number, px: number, py: number, dist: number, roomIdx?: number): { x: number; y: number } {
        for (let tries = 0; tries < 500; tries++) {
            let cx = 1 + Math.floor(rng() * (COLS - 2));
            let cy = 1 + Math.floor(rng() * (ROWS - 2));
            if (roomIdx !== undefined && this.roomOf[cy * COLS + cx] !== roomIdx) continue;
            if (this.solid(cx, cy)) continue;
            const x = cx * TILE + TILE / 2;
            const y = cy * TILE + TILE / 2;
            const ddx = x - px;
            const ddy = y - py;
            if (ddx * ddx + ddy * ddy >= dist * dist) return { x, y };
        }
        return { x: px, y: py };
    }
}

function cx2ok(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
}
