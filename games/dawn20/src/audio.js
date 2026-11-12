/* 音频层：WebAudio 程序化合成（零音频文件）—— BGM + 枪声/受击/升级/结算音效 */
(function (root) {
  'use strict';
  const AC = root.AudioContext || root.webkitAudioContext;

  // —— 音乐参数（A 小调五声，92 BPM，八分音符一步）——
  const BPM = 92;
  const STEP = 60 / BPM / 2;
  const SCALE = [0, 3, 5, 7, 10];        // 小调五声音阶（半音）
  const BASS_OFF = [0, 0, -5, -2];       // 每小节低音走向
  const BASS_HZ = 55;                    // A1

  // 每种音效的最小间隔（秒）与音量：防止 240 敌人时把混音器打爆
  const GAP = { shot: 0.04, kill: 0.055, xp: 0.07, chest: 0.1, tome: 0.2, heal: 0.1, hurt: 0.12, levelup: 0.12, boss: 0.5, win: 0.5, lose: 0.5 };

  const A = {
    ctx: null, master: null, sfxBus: null, musicBus: null,
    muted: false, ready: false,
    _intensity: 0, _playing: false, _step: 0, _next: 0, _tick: null,
    _last: Object.create(null), _nb: null,
    stats: { sfx: 0, skipped: 0, errored: 0 },

    // 首次用户手势时调用；已初始化则只做 resume
    init() {
      if (this.ready) { this.resume(); return this.ready; }
      try {
        if (!AC) return false;
        const ctx = new AC();
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.9;
        master.connect(ctx.destination);
        const sfx = ctx.createGain(); sfx.gain.value = 0.5; sfx.connect(master);
        const mus = ctx.createGain(); mus.gain.value = 0; mus.connect(master);
        this.master = master; this.sfxBus = sfx; this.musicBus = mus;
        this.ready = true;
        this.resume();
        return true;
      } catch (e) {
        this.stats.errored++;
        this.ready = false;
        return false;
      }
    },
    resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { this.stats.errored++; } },
    setMuted(m) {
      this.muted = !!m;
      try { if (this.master) this.master.gain.value = this.muted ? 0 : 0.9; } catch (e) { this.stats.errored++; }
    },
    toggle() { this.setMuted(!this.muted); if (!this.muted) this.resume(); return this.muted; },
    setIntensity(v) { this._intensity = Math.max(0, Math.min(1, +v || 0)); },

    // ---------- 基础发声 ----------
    _env(node, t, attack, dur, peak) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
      node.connect(g);
      return g;
    },
    _tone(bus, type, f0, f1, dur, peak, t, attack) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this._env(o, t, attack || 0.004, dur, peak);
      g.connect(bus);
      o.start(t); o.stop(t + dur + (attack || 0.004) + 0.04);
    },
    _noiseBuf() {
      if (this._nb) return this._nb;
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 0.4);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._nb = b;
      return b;
    },
    _noise(bus, dur, peak, t, cut0, cut1) {
      const ctx = this.ctx;
      const n = ctx.createBufferSource();
      n.buffer = this._noiseBuf();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.max(120, cut0), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(120, cut1), t + dur);
      n.connect(f);
      const g = this._env(f, t, 0.002, dur, peak);
      g.connect(bus);
      n.start(t); n.stop(t + dur + 0.03);
    },

    // ---------- 音效 ----------
    sfx(name, opt) {
      if (!this.ready || this.muted) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      opt = opt || {};
      const t = ctx.currentTime + 0.004;
      if (t - (this._last[name] || -9) < (GAP[name] || 0.05)) { this.stats.skipped++; return; }
      this._last[name] = t;
      this.stats.sfx++;
      try {
        switch (name) {
          case 'shot': {
            // 枪声 = 噪声爆点 + 低频"咚"，音高随武器/弹体略变
            const p = opt.pitch || 1;
            this._noise(this.sfxBus, 0.055, 0.34, t, 3400 * p, 500);
            this._tone(this.sfxBus, 'square', 190 * p, 60 * p, 0.07, 0.22, t);
            break;
          }
          case 'kill':
            this._tone(this.sfxBus, 'sine', 200, 70, 0.09, 0.2, t);
            this._noise(this.sfxBus, 0.05, 0.1, t, 900, 200);
            break;
          case 'xp':
            this._tone(this.sfxBus, 'triangle', 950, 1350, 0.05, 0.09, t);
            break;
          case 'heal':
            this._tone(this.sfxBus, 'sine', 620, 980, 0.13, 0.14, t);
            break;
          case 'chest':
            this._tone(this.sfxBus, 'triangle', 660, 660, 0.09, 0.16, t);
            this._tone(this.sfxBus, 'triangle', 990, 990, 0.11, 0.14, t + 0.09);
            break;
          case 'tome':
            this._tone(this.sfxBus, 'triangle', 440, 440, 0.12, 0.16, t);
            this._tone(this.sfxBus, 'triangle', 660, 660, 0.12, 0.14, t + 0.1);
            this._tone(this.sfxBus, 'triangle', 880, 880, 0.16, 0.12, t + 0.2);
            break;
          case 'levelup':
            [523, 659, 784].forEach((f, i) => this._tone(this.sfxBus, 'triangle', f, f, 0.11, 0.13, t + i * 0.075));
            break;
          case 'hurt':
            this._tone(this.sfxBus, 'sawtooth', 180, 55, 0.22, 0.3, t);
            this._noise(this.sfxBus, 0.12, 0.16, t, 1400, 200);
            break;
          case 'boss':
            this._tone(this.sfxBus, 'sawtooth', 95, 30, 1.3, 0.26, t, 0.05);
            this._noise(this.sfxBus, 0.6, 0.16, t, 700, 90);
            break;
          case 'win':
            [392, 523, 659, 784, 1047].forEach((f, i) => this._tone(this.sfxBus, 'triangle', f, f, 0.3, 0.16, t + i * 0.12, 0.01));
            break;
          case 'lose':
            [392, 330, 262, 196].forEach((f, i) => this._tone(this.sfxBus, 'sine', f, f, 0.35, 0.18, t + i * 0.16, 0.01));
            break;
          default: break;
        }
      } catch (e) { this.stats.errored++; }
    },

    // ---------- BGM ----------
    musicStart() {
      this.init();
      if (!this.ready || !this.ctx || !this.musicBus) return false;
      if (this._playing) { this.resume(); return true; }
      this._playing = true;
      this._step = 0;
      this._next = this.ctx.currentTime + 0.1;
      try {
        const now = this.ctx.currentTime;
        this.musicBus.gain.cancelScheduledValues(now);
        this.musicBus.gain.setValueAtTime(0.0001, now);
        this.musicBus.gain.linearRampToValueAtTime(0.42, now + 1.5);
      } catch (e) { this.stats.errored++; }
      this._tick = setInterval(() => this._sched(), 120);
      this._sched();
      return true;
    },
    musicStop() {
      this._playing = false;
      if (this._tick) { clearInterval(this._tick); this._tick = null; }
      try {
        if (this.musicBus && this.ctx) {
          const now = this.ctx.currentTime;
          this.musicBus.gain.cancelScheduledValues(now);
          this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), now);
          this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        }
      } catch (e) { this.stats.errored++; }
    },
    _sched() {
      if (!this._playing || !this.ctx) return;
      const ctx = this.ctx;
      if (ctx.state !== 'running') { this.resume(); return; }
      const horizon = ctx.currentTime + 0.3;
      let guard = 0;
      while (this._next < horizon && guard++ < 24) {
        try { this._playStep(this._step, this._next); } catch (e) { this.stats.errored++; }
        this._step++;
        this._next += STEP;
      }
    },
    // 16 步一小节：低音每半小节一次、琶音每两步一次，强度越高叠得越密
    _playStep(step, t) {
      const s = step % 16;
      const bar = Math.floor(step / 16);
      const iv = this._intensity;
      if (s === 0 || s === 8) {
        const f = BASS_HZ * Math.pow(2, BASS_OFF[bar % 4] / 12);
        this._tone(this.musicBus, 'sine', f, f, 0.6, 0.5, t, 0.02);
      }
      if (s % 2 === 0) {
        const oct = 1 + ((step >> 3) & 1);
        const n = SCALE[(step * 3 + bar) % SCALE.length] + 12 * oct;
        const f = 220 * Math.pow(2, n / 12);
        this._tone(this.musicBus, 'triangle', f, f, 0.22, 0.10 + 0.10 * iv, t);
      }
      if (iv > 0.45 && s % 4 === 2) {
        const f2 = 440 * Math.pow(2, SCALE[(step * 5 + 1) % SCALE.length] / 12);
        this._tone(this.musicBus, 'sine', f2, f2, 0.09, 0.055, t);
      }
      if (iv > 0.72 && s === 12) this._noise(this.musicBus, 0.07, 0.05, t, 5200, 1800);
    },

    debug() {
      return {
        ready: this.ready,
        state: this.ctx ? this.ctx.state : '-',
        muted: this.muted,
        music: this._playing,
        step: this._step,
        intensity: +this._intensity.toFixed(2),
        sfx: this.stats.sfx,
        skipped: this.stats.skipped,
        errored: this.stats.errored,
      };
    },
  };

  root.DawnAudio = A;
})(window);
