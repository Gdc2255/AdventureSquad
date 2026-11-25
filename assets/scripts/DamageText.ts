import { Color, HorizontalTextAlignment, Label, LabelOutline, Node, UITransform } from 'cc';
import { mkNode } from './Core';

/**
 * 飘字：命中时冒出的伤害数字，上飘一点再淡出。
 *
 * 注意：节点必须用 Core.mkNode 建 —— 它保证先加 UITransform 再加渲染组件。
 * 手动 addComponent(Graphics) 会让引擎自动补一个 UITransform，
 * 之后再手动加就成了两个 transform，Label 布局错乱、数字画不出来。
 */
export class FloatText {
    node: Node;
    private label: Label;
    private t = 0;
    private life = 0.9;
    private vy = 52;
    private vx = 0;

    constructor(parent: Node, x: number, y: number, text: string, color: Color, size = 20) {
        this.node = mkNode(parent, 'floatText');
        this.node.setPosition(x, y, 0);
        const t = this.node.getComponent(UITransform)!;
        t.setAnchorPoint(0.5, 0.5);
        t.setContentSize(72, size + 12);
        const lb = this.node.addComponent(Label);
        lb.fontSize = size;
        lb.lineHeight = size + 4;
        lb.color = color;
        lb.enableBold = true;
        lb.fontFamily = 'Microsoft YaHei, PingFang SC, SimHei, sans-serif';   // 和其它标签用同一个字体
        lb.horizontalAlign = HorizontalTextAlignment.CENTER;
        lb.verticalAlign = 1;      // CENTER
        lb.string = text;
        // 黑色描边：在深色地板/怪物身上也能看清
        const ol = this.node.addComponent(LabelOutline);
        ol.width = 2.5;
        ol.color = new Color(12, 10, 16, 255);
        this.label = lb;
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
        // 淡出（先保持全亮，最后 40% 才快速变淡）
        const a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        const c = this.label.color;
        this.label.color = new Color(c.r, c.g, c.b, Math.max(0, Math.floor(a * 255)));
        return true;
    }

    dispose(): void {
        this.node.destroy();
    }
}
