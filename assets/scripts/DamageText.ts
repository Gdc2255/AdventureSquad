import { Color, Graphics, HorizontalTextAlignment, Label, Node, UITransform } from 'cc';

/**
 * 飘字：伤害数字 / 提示文字。
 * 从指定位置往上飘一点并淡出。
 */
export class FloatText {
    node: Node;
    private g: Graphics;
    private label: Label;
    private t = 0;
    private life = 0.7;
    private vy = 46;
    private vx = 0;
    private baseY = 0;

    constructor(parent: Node, x: number, y: number, text: string, color: Color, size = 14) {
        this.node = new Node('floatText');
        this.node.layer = 0;   // 世界层节点
        this.node.setParent(parent);
        this.node.setPosition(x, y, 0);
        this.g = this.node.addComponent(Graphics);
        const t = this.node.addComponent(UITransform);
        t.setContentSize(60, 24);
        const lb = this.node.addComponent(Label);
        lb.fontSize = size;
        lb.lineHeight = size + 4;
        lb.color = color;
        lb.enableBold = true;
        lb.horizontalAlign = HorizontalTextAlignment.CENTER;
        lb.string = text;
        this.label = lb;
        this.baseY = y;
        this.vx = (Math.random() - 0.5) * 30;
    }

    update(dt: number): boolean {
        this.t += dt;
        const k = this.t / this.life;
        if (k >= 1) return false;
        this.vy -= 60 * dt;                       // 减速上飘
        this.node.setPosition(
            this.node.position.x + this.vx * dt,
            this.node.position.y + this.vy * dt,
            0,
        );
        // 淡出
        const a = 1 - k * k;
        const c = this.label.color;
        this.label.color = new Color(c.r, c.g, c.b, Math.max(0, Math.floor(a * 255)));
        return true;
    }

    dispose(): void {
        this.node.destroy();
    }
}
