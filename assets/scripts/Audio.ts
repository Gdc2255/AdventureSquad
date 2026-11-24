import { AudioClip, AudioSourceComponent, Node, resources } from 'cc';

/**
 * 音频系统：音效播放池 + 背景音乐 + 音量设置（存 localStorage）。
 * 素材全部来自 Kenney CC0 音效包（公共领域，可商用免署名）。
 */
export class AudioSys {
    /** 所有音效的 key（对应 resources/audio/<key>.ogg） */
    static readonly SFX_KEYS = [
        'slash', 'slash2', 'chop', 'hit', 'hit2', 'hitMetal', 'hitStone', 'hurt',
        'explode', 'explode2', 'bell', 'glass', 'step', 'step2', 'coin', 'coin2',
        'heart', 'doorOpen', 'doorClose', 'click', 'latch', 'fail', 'levelUp',
    ];
    static readonly BGM_KEYS = ['bgmMenu', 'bgmBattle', 'bgmBoss'];

    private clips: { [k: string]: AudioClip } = {};
    private pool: AudioSourceComponent[] = [];
    private musicSrc: AudioSourceComponent | null = null;
    private curMusic = '';
    private pendingMusic = '';   // 音频还没加载完时想播的 BGM
    private ready = false;
    private loadedCount = 0;

    musicVol = 0.6;
    sfxVol = 0.9;
    /** 音效总开关 */
    enabled = true;

    constructor(private parent: Node) {
        this.loadSettings();
    }

    /** 异步加载所有音频 */
    load(): void {
        const keys = AudioSys.SFX_KEYS.concat(AudioSys.BGM_KEYS);
        for (const k of keys) {
            resources.load(`audio/${k}`, AudioClip, (err, clip) => {
                if (err || !clip) return;
                this.clips[k] = clip;
                if (AudioSys.BGM_KEYS.indexOf(k) < 0) this.growPool();
                this.loadedCount++;
                this.ready = true;
                // 之前想播但还没加载完的音乐，现在补上（不等全部加载完，
                // 否则个别文件缺失会永远卡住）
                if (this.pendingMusic && this.clips[this.pendingMusic]) {
                    const want = this.pendingMusic;
                    this.pendingMusic = '';
                    this.playMusic(want);
                }
            });
        }
    }

    /** 音效播放池（同时能播多个） */
    private growPool(): void {
        if (this.pool.length >= 12) return;
        const n = mkAudioNode(this.parent, 'sfx');
        const src = n.getComponent(AudioSourceComponent)!;
        src.playOnAwake = false;
        this.pool.push(src);
    }

    /** 播放一个音效（同名的会互相打断，避免叠成噪音） */
    play(name: string, volume = 1, pitch = 1): void {
        if (!this.enabled || this.sfxVol <= 0) return;
        const clip = this.clips[name];
        if (!clip) return;
        let src = this.pool.find((s) => !s.playing);
        if (!src) {
            src = this.pool[0];
            if (!src) return;
        }
        src.stop();
        src.clip = clip;
        src.volume = volume * this.sfxVol;
        src.pitch = pitch;
        src.play();
    }

    /** 随机播一个（避免重复感） */
    playOneOf(names: string[], volume = 1, pitch = 1): void {
        if (!names.length) return;
        const n = names[Math.floor(Math.random() * names.length)];
        this.play(n, volume, pitch);
    }

    /** 播放背景音乐（同名的不重复播放） */
    playMusic(name: string, volume = 1): void {
        if (!this.enabled || this.musicVol <= 0) return;
        if (this.curMusic === name && this.musicSrc && this.musicSrc.playing) {
            this.musicSrc.volume = volume * this.musicVol;
            return;
        }
        const clip = this.clips[name];
        if (!clip) { this.pendingMusic = name; return; }
        if (!this.musicSrc) {
            const n = mkAudioNode(this.parent, 'bgm');
            this.musicSrc = n.getComponent(AudioSourceComponent)!;
            this.musicSrc.playOnAwake = false;
            this.musicSrc.loop = true;
        }
        this.musicSrc.stop();
        this.musicSrc.clip = clip;
        this.musicSrc.loop = true;
        this.musicSrc.volume = volume * this.musicVol;
        this.musicSrc.play();
        this.curMusic = name;
    }

    stopMusic(): void {
        if (this.musicSrc) this.musicSrc.stop();
        this.curMusic = '';
    }

    /** 音量变化后立刻生效 */
    applyVolumes(musicVol: number, sfxVol: number): void {
        this.musicVol = musicVol;
        this.sfxVol = sfxVol;
        if (this.musicSrc) this.musicSrc.volume = this.musicSrc.volume;
        this.saveSettings();
    }

    setMusicVolume(v: number): void {
        this.musicVol = Math.max(0, Math.min(1, v));
        if (this.musicSrc) this.musicSrc.volume = this.musicSrc.volume;
        this.saveSettings();
    }

    setSfxVolume(v: number): void {
        this.sfxVol = Math.max(0, Math.min(1, v));
        this.saveSettings();
    }

    private saveSettings(): void {
        try {
            localStorage.setItem('kl_music_vol', String(this.musicVol));
            localStorage.setItem('kl_sfx_vol', String(this.sfxVol));
        } catch (e) { /* 隐私模式下没有 localStorage，忽略 */ }
    }

    private loadSettings(): void {
        try {
            const m = localStorage.getItem('kl_music_vol');
            const s = localStorage.getItem('kl_sfx_vol');
            if (m !== null) this.musicVol = Math.max(0, Math.min(1, parseFloat(m)));
            if (s !== null) this.sfxVol = Math.max(0, Math.min(1, parseFloat(s)));
        } catch (e) { /* 忽略 */ }
    }
}

function mkAudioNode(parent: Node, name: string): Node {
    const n = new Node(name);
    n.layer = 0;   // 音频节点不需要 UI 层
    n.setParent(parent);
    n.addComponent(AudioSourceComponent);
    return n;
}
