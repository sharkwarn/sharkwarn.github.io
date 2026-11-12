/* 黎明前二十分钟 · 核心玩法引擎（Canvas 2D，无外部资源）
 * 全部实体用纯色圆/方/多边形绘制。PC：WASD + 鼠标瞄准 + 自动开火；移动端：双摇杆。
 */
(function (root) {
  'use strict';
  const D = root.DAWN_DATA, UG = root.DAWN_UPGRADES;

  const FLAT = new Set(['hp', 'ammo', 'projectiles', 'piercing', 'bounce', 'spread', 'flatDamage']);
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  // ---------------- 输入 ----------------
  const Input = {
    keys: Object.create(null), mouse: { x: 0, y: 0, down: false },
    stickL: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 },
    stickR: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 },
    touchUsed: false,
    init(canvas) {
      addEventListener('keydown', e => {
        this.keys[e.key.toLowerCase()] = true;
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
      });
      addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
      addEventListener('blur', () => { this.keys = Object.create(null); });
      canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      });
      canvas.addEventListener('mousedown', () => { this.mouse.down = true; });
      addEventListener('mouseup', () => { this.mouse.down = false; });
      const onStart = e => {
        this.touchUsed = true;
        for (const t of e.changedTouches) {
          const r = canvas.getBoundingClientRect();
          const x = t.clientX - r.left, y = t.clientY - r.top;
          const s = x < r.width / 2 ? this.stickL : this.stickR;
          if (!s.active) { s.active = true; s.id = t.identifier; s.ox = x; s.oy = y; s.x = 0; s.y = 0; }
        }
        e.preventDefault();
      };
      const onMove = e => {
        for (const t of e.changedTouches) {
          const r = canvas.getBoundingClientRect();
          const x = t.clientX - r.left, y = t.clientY - r.top;
          for (const s of [this.stickL, this.stickR]) {
            if (s.active && s.id === t.identifier) {
              let dx = x - s.ox, dy = y - s.oy;
              const len = Math.hypot(dx, dy), max = 60;
              if (len > max) { dx = dx / len * max; dy = dy / len * max; }
              s.x = dx / max; s.y = dy / max;
            }
          }
        }
        e.preventDefault();
      };
      const onEnd = e => {
        for (const t of e.changedTouches) {
          for (const s of [this.stickL, this.stickR]) if (s.active && s.id === t.identifier) { s.active = false; s.id = -1; s.x = 0; s.y = 0; }
        }
        e.preventDefault();
      };
      canvas.addEventListener('touchstart', onStart, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onEnd, { passive: false });
      canvas.addEventListener('touchcancel', onEnd, { passive: false });
    },
  };

  // ---------------- 属性系统 ----------------
  class Stats {
    constructor(base) {
      this.base = Object.assign({}, base);
      this.mods = Object.create(null);
    }
    add(mods) {
      for (const k in mods) {
        const v = mods[k];
        if (!v) continue;
        let m = this.mods[k];
        if (!m) m = this.mods[k] = { p: 0, n: 1, f: 0 };
        if (FLAT.has(k)) m.f += v;
        else if (v > 0) m.p += v;
        else m.n *= (1 + v); // v 为负 -> (1+v) < 1
      }
    }
    get(k) {
      const m = this.mods[k], base = this.base[k] || 0;
      if (!m) return base;
      return base * (1 + m.p) * m.n + m.f;
    }
    // 正向加算 / 负向乘算，返回最终值
    val(k) { return this.get(k); }
  }

  // ---------------- 主游戏 ----------------
  class Game {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks || {};
      this.state = 'menu'; // menu | playing | levelup | dead | won | paused
      this.time = 0;       // 已过秒
      this.resize();
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
      this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
      this.vw = w; this.vh = h;
      this.zscale = w < 720 ? 1.45 : 1.55; // 视口短边 / 缩放：保持实体在手机上看得清
    }

    start(opts) {
      const char = D.CHARACTERS.find(c => c.id === opts.charId) || D.CHARACTERS[0];
      const weap = D.WEAPONS.find(w => w.id === opts.weaponId) || D.WEAPONS[0];
      this.char = char; this.weap = weap;
      this.dark = opts.darkness || 0;
      this.dm = D.darknessMods(this.dark);
      this.mode = opts.mode || 'standard';
      this.map = D.MAPS.find(m => m.id === opts.mapId) || D.MAPS[0];
      this.runLen = this.mode === 'quick' ? 600 : D.RUN_LENGTH;
      this.endless = this.mode === 'endless';
      if (this.endless) this.runLen = 1e9; // 无尽：没有黎明
      this.counts = Object.create(null);

      this.stats = new Stats({
        hp: char.hp, moveSpeed: 205, walkSpeed: 1, bulletDamage: weap.dmg, fireRate: weap.fireRate,
        projectiles: weap.proj, ammo: weap.ammo, reloadRate: 1, bulletSpeed: 780, bulletSize: 1,
        piercing: 0, bounce: 0, spread: weap.proj > 1 ? 12 : 0, pickupRange: 150, visionRange: 460,
        dodge: 0, charSize: 1, summonDamage: 0, summonAttackSpeed: 0, knockback: 1,
        burnDamage: 0, lightningDamage: 0, freezeDuration: 0, xp: 1, flatDamage: 0,
      });

      this.runeR = (root.DAWN_SAVE && root.DAWN_SAVE.activeRunes) ? root.DAWN_SAVE.activeRunes() : {};
      this.applyRunes();

      this.player = {
        x: 0, y: 0, r: 13, hp: this.stats.val('hp'), maxHp: this.stats.val('hp'),
        aim: 0, ammo: this.stats.val('ammo'), reloading: 0, cooldown: 0, inv: 0,
        dodge: 0, shield: !!this.runeR.blessing, shieldCd: 0, soulHearts: 0, shots: 0,
        moveX: 0, moveY: 0, hitFlash: 0, hasMoved: false,
        charge: 0, chargeMax: 1.1, skillCd: 0,
      };
      if (this.runeR.glass_cannon) this.player.hp = Math.max(1, Math.floor(this.player.maxHp / 2));
      this.stuck = []; this.glyphs = []; this.chains = [];
      this.enemies = []; this.bullets = []; this.ebullets = []; this.orbs = []; this.pickups = [];
      this.summons = []; this.particles = []; this.dmgTexts = [];
      this.evo = new Set(); this.evoDone = false; this.pendingEvo = false; this.evoChoices = [];
      this.level = 1; this.xp = 0; this.xpNeed = D.xpToLevel(1); this.kills = 0;
      this.taken = new Set(); this.sycTaken = new Set(); this.tomesTaken = new Set();
      this.pendingLevels = 0; this.choices = []; this.rerolled = false;
      this.sessions = this.map.spawns.map(s => ({ ...s, timer: s.single ? 0 : rand(0, s.cd), fired: false }));
      this.spawned = 0; this.barrier = null; this.boss = null;
      // 神秘树：森林/神庙的固定障碍（wiki：45000 HP，撞上会受伤）
      this.trees = [];
      if (this.map.id === 'forest' || this.map.id === 'temple') {
        const n = this.map.id === 'forest' ? 14 : 6;
        const bx = this.map.bounds ? this.map.bounds.x - 90 : 620, by = this.map.bounds ? this.map.bounds.y - 90 : 520;
        for (let i = 0; i < n; i++) {
          let x = 0, y = 0, tries = 0;
          do { x = rand(-bx, bx); y = rand(-by, by); tries++; } while (Math.hypot(x, y) < 240 && tries < 80);
          this.trees.push({ x, y, r: 36, hp: 45000, maxHp: 45000, flash: 0 });
        }
      }
      this.camX = 0; this.camY = 0;
      this.effects = Object.create(null);
      this.timers = { inWind: 0, inWindBonus: 0, kunoichi: 0, kunoichiBonus: 0, regen: 0, soul: 0, deer: 10, deerOn: 0,
        glyphCd: 0, barrage: 0, ethereal: 0, ward: 0, soulRune: 0, wind: 0, whirl: 0, necro: 0, elem: 0 };
      this.state = 'playing';
      this.time = 0;
      this.stats0 = this.snapshotBase();
      if (this.hooks.onStart) this.hooks.onStart(this);
    }

    snapshotBase() { return { hp: this.player.maxHp }; }

    // ---------- 符文（局外成长，开局一次性结算）----------
    // 属性型 → 直接灌进 stats；机制型 → 运行时读 this.runeR[id]（已购等级）
    applyRunes() {
      const R = this.runeR, s = this.stats;
      if (!R || !Object.keys(R).length) return;
      if (R.power) s.add({ bulletDamage: 0.02 * R.power, summonDamage: 0.02 * R.power });
      if (R.alacrity) s.add({ fireRate: 0.02 * R.alacrity, reloadRate: 0.02 * R.alacrity });
      if (R.vigilance) s.add({ visionRange: 0.03 * R.vigilance, pickupRange: 0.03 * R.vigilance });
      if (R.courage) s.add({ reloadRate: 0.02 * R.courage });
      if (R.growth) s.add({ xp: 0.04 * R.growth });
      if (R.glass_cannon) s.add({ bulletDamage: 0.05 * R.glass_cannon, fireRate: 0.05 * R.glass_cannon });
    }
    runeOn(id) { return !!(this.runeR && this.runeR[id]); }
    runeRank(id) { return (this.runeR && this.runeR[id]) || 0; }
    // 闪避上限：60% + 预感 +3%/级
    dodgeCap() { return 0.6 + 0.03 * this.runeRank('premonition'); }

    // 已学升级的机制效果集合
    has(t) { return !!this.effects[t]; }
    effVal(t, k, d) { const e = this.effects[t]; return e && k in e ? e[k] : d; }

    applyUpgrade(u) {
      const tri = this.nextTriple ? 3 : 1;
      for (let i = 0; i < tri; i++) this.stats.add(u.mods || {});
      if (tri > 1) {
        this.nextTriple = false;
        this.dmgTexts.push({ x: this.player.x, y: this.player.y - 40, t: 1.4, txt: '专精 ×3', c: '#c084fc' });
      }
      for (const e of (u.eff || [])) {
        const cur = this.effects[e.t] || (this.effects[e.t] = {});
        for (const k in e) if (k !== 't') cur[k] = e[k];
      }
      this.taken.add(u.id);
      // 立刻反映到玩家
      const newMax = Math.round(this.stats.val('hp'));
      if (newMax > this.player.maxHp) this.player.hp += (newMax - this.player.maxHp);
      this.player.maxHp = newMax;
      this.player.hp = clamp(this.player.hp, 0, this.player.maxHp);
      if (this.has('holy_shield') && this.player.shieldCd === 0 && !this.player.shield) { this.player.shield = true; }
      if (this.has('soul_shield') || this.has('soul_expand') || this.has('soul_link')) {
        this.player.soulHearts = Math.min(this.player.soulHearts + 1, this.soulCap());
      }
      // 只在「本次拿到这条」时召唤，避免每次升级重复刷出召唤物
      const et = (u.eff || []).map(e => e.t);
      if (et.includes('magic_scythe')) this.spawnSummon('scythe');
      if (et.includes('magic_spear')) { this.spawnSummon('spear'); this.spawnSummon('spear'); }
      if (et.includes('ghost_friend')) this.spawnSummon('ghost');
      if (et.includes('magic_lens')) this.spawnSummon('lens');
      if (et.includes('dragon_egg')) this.spawnSummon('dragon_egg');
      if (et.includes('electro_bug')) this.spawnSummon('electro_bug');
      if (et.includes('crow')) this.spawnSummon('crow');
      if (et.includes('deer_friend')) this.spawnSummon('deer');
      if (et.includes('specialize')) this.nextTriple = true;
      // 莎娜：光环碎片——集满 3 片修复光环
      if (et.includes('halo_piece')) {
        this.haloPieces = (this.haloPieces || 0) + 1;
        if (this.haloPieces >= 3 && !this.effects.halo) {
          this.applyUpgrade({ id: 'halo_grant', name: '莎娜的光环', mods: { fireRate: 0.5, reloadRate: 0.5, visionRange: 0.75 }, eff: [{ t: 'halo' }] });
          this.dmgTexts.push({ x: this.player.x, y: this.player.y - 34, t: 1.4, txt: '光环修复', c: '#ffe066' });
        }
      }
    }

    soulCap() { return this.has('soul_expand') ? 5 : 3; }

    // ---------- 升级选项 ----------
    rollChoices() {
      const n = this.dm.choices;
      const pool = [];
      const treeState = {};
      for (const u of UG.UPGRADES) {
        if (this.taken.has(u.id)) continue;
        const ts = treeState[u.tree] || (treeState[u.tree] = { t1: false, t2: false });
        if (this.taken.has(u.tree + '_t1')) ts.t1 = true;
      }
      // 统计已拿 tier
      const got = { tier1: new Set(), tier2: new Set() };
      for (const id of this.taken) {
        const u = UG.UPGRADES.find(x => x.id === id);
        if (!u) continue;
        if (u.tier === 1) got.tier1.add(u.tree);
        if (u.tier === 2) got.tier2.add(u.tree);
      }
      for (const u of UG.UPGRADES) {
        const c = this.counts[u.id] || 0;
        if (c >= (this.endless ? 3 : 1)) continue;
        if (c === 0) {
          if (u.tier === 2 && !got.tier1.has(u.tree)) continue;
          if (u.tier === 3 && !got.tier2.has(u.tree)) continue;
        }
        pool.push(u);
      }
      for (const s of UG.SYNERGIES) {
        if (this.sycTaken.has(s.id)) continue;
        if (s.need.every(n => this.taken.has(n))) pool.push({ ...s, isSyn: true });
      }
      // 洗牌
      for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      this.choices = pool.slice(0, n);
      this.rerolled = false;
      return this.choices;
    }

    choose(i) {
      const u = this.choices[i];
      if (!u) return;
      if (u.isSyn) { this.sycTaken.add(u.id); this.stats.add(u.mods || {}); for (const e of (u.eff || [])) { const c = this.effects[e.t] || (this.effects[e.t] = {}); for (const k in e) if (k !== 't') c[k] = e[k]; } }
      else this.applyUpgrade(u);
      this.taken.add(u.id);
      this.counts[u.id] = (this.counts[u.id] || 0) + 1;
      this.pendingLevels--;
      this.choices = [];
      if (this.pendingLevels > 0) { this.rollChoices(); this.hooks.onLevelUp && this.hooks.onLevelUp(this); }
      else { this.state = 'playing'; this.pushAway(); this.hooks.onLevelUpEnd && this.hooks.onLevelUpEnd(this); }
    }

    chooseTome(i) {
      const t = this.tomeChoices[i];
      if (!t) return;
      this.tomesTaken.add(t.id);
      this.stats.add(t.mods || {});
      for (const e of (t.eff || [])) { const c = this.effects[e.t] || (this.effects[e.t] = {}); for (const k in e) if (k !== 't') c[k] = e[k]; }
      const nm = Math.round(this.stats.val('hp'));
      this.player.maxHp = Math.max(1, nm); this.player.hp = clamp(this.player.hp, 1, this.player.maxHp);
      this.state = 'playing';
      this.pushAway();
      this.hooks.onLevelUpEnd && this.hooks.onLevelUpEnd(this);
    }

    pushAway() {
      const p = this.player;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (d < 320) { const f = (320 - d) / 320 * 240; e.x += (e.x - p.x) / d * f; e.y += (e.y - p.y) / d * f; }
      }
    }

    // ---------- 召唤 ----------
    // ---------- 主动技能（PC 右键 / 手机右下按钮）----------
    skill() {
      const p = this.player;
      if (this.state !== 'playing' || p.skillCd > 0) return false;
      const m = this.char.mech;
      if (m === 'clone') {
        // 希娜：向瞄准方向冲刺，影分身留守攻击；袖剑：路径伤害 + 无敌
        const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
        if (this.has('hina_invuln')) {
          for (let s = 20; s <= 200; s += 30) this.areaDamage(p.x + dx * s, p.y + dy * s, 40, this.bulletDamage() * 0.8);
        }
        this.spawnSummon('clone');
        this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0.3, max: 0.3, c: '#b98cff', r: 70, ring: true });
        p.x += dx * 190; p.y += dy * 190;
        p.inv = Math.max(p.inv, 0.3);
        if (this.has('hina_reload')) { p.reloading = 0; p.ammo = Math.round(this.stats.val('ammo')); }
        p.skillCd = 6;
        return true;
      }
      if (m === 'dump') {
        // 阿比：把剩余弹药随机倾泻一空
        p.skillT = this.has('make_it_rain') ? 3 : 1.6;
        const n = Math.max(8, Math.min(28, p.ammo + 6));
        for (let i = 0; i < n; i++) this.fireBullet(p.x, p.y, p.aim + rand(-0.75, 0.75), this.bulletDamage() * (this.has('make_it_rain') ? 0.8 : 0.55), {});
        p.ammo = Math.max(0, p.ammo - n);
        p.skillCd = 8;
        return true;
      }
      return false;
    }

    spawnSummon(kind) {
      const p = this.player;
      const angle = Math.random() * Math.PI * 2;
      const s = { kind, x: p.x + Math.cos(angle) * 46, y: p.y + Math.sin(angle) * 46, cd: 0, t: 0, hp: kind === 'dragon_egg' ? 1 : 1 };
      if (kind === 'dragon_egg') { s.hatch = 180; s.dmg = 0; }
      this.summons.push(s);
    }

    // ---------- 伤害 ----------
    hurtEnemy(e, dmg, opts) {
      opts = opts || {};
      if (e.dead) return;
      let d = dmg;
      if (this.has('wither') && e.curseT > 0) d *= 1.3;
      if (this.has('brittle') && e.frozenT > 0) d *= 1.3;
      if (this.runeOn('close_combat')) {
        const vr = this.stats.val('visionRange');
        if (dist2(e.x, e.y, this.player.x, this.player.y) < vr * vr) d *= 1 + 0.03 * this.runeRank('close_combat');
      }
      e.hp -= d;
      e.flash = 0.1;
      if (this.has('execute') && !opts.noExecute && e.hp > 0 && e.hp < e.maxHp * this.effVal('execute', 'pct', 0.2) && e.kind === 'small') e.hp = 0;
      if (e.hp <= 0) this.killEnemy(e, opts);
    }

    killEnemy(e, opts) {
      if (e.dead) return;
      e.dead = true;
      this.kills++;
      if (this.hooks.onKill) this.hooks.onKill(this, e);
      // —— 符文 / 角色升级：击杀触发 ——
      const K = this.kills;
      if (this.runeOn('ethereal') && K % 50 === 0) this.timers.ethereal = 2 * this.runeRank('ethereal');
      if (this.runeOn('healing') && K % Math.max(200, 1500 - 100 * this.runeRank('healing')) === 0) {
        this.pickups.push({ type: 'heal', x: e.x, y: e.y, r: 12, t: 0 });
      }
      if (this.runeOn('wild_magic') && (e.burnT > 0 || e.frozenT > 0) && Math.random() < 0.05 * this.runeRank('wild_magic')) {
        const wasBurn = e.burnT > 0;
        for (const o of this.enemies) {
          if (o.dead || o === e || dist2(o.x, o.y, e.x, e.y) > 140 * 140) continue;
          if (wasBurn) this.burn(o, e.burnDps || 3); else this.freeze(o);
        }
      }
      if (this.has('necrophile')) this.timers.necro = 1;
      if (this.char.mech === 'spirit' && this.kills % 1 === 0 && this.enemies.length > 0) {
        const tgt = this.nearestEnemy(e.x, e.y, 400);
        if (tgt) this.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 8, life: 3, r: 6, pierce: 0, bounce: 0, homing: tgt, kind: 'spirit', color: '#c765f0' });
      }
      if (this.has('necromancer')) {
        const t2 = this.nearestEnemy(e.x, e.y, 400);
        if (t2) this.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 8, life: 3, r: 6, pierce: 0, bounce: 0, homing: t2, kind: 'spirit', color: '#c765f0' });
      }
      // 瑞文：乌鸦（每 2 杀放出一只，命中施加诅咒）
      if (this.char.mech === 'crow' && K % 2 === 0) {
        const t3 = this.nearestEnemy(e.x, e.y, 460);
        const dmg3 = this.has('flock_crows') ? Math.max(10, this.bulletDamage()) : 10;
        this.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: dmg3, life: 3.5, r: 7, pierce: 0, bounce: 0, homing: t3 || null, kind: 'crow', curseOn: true, color: '#5b6cff' });
      }
      if (e.type === 'shoggoth') {
        for (let k = 0; k < 4; k++) {
          this.spawnEnemy('lurker', 300 / 4, false);
          const sp3 = this.enemies[this.enemies.length - 1];
          if (sp3) { sp3.x = e.x + rand(-80, 80); sp3.y = e.y + rand(-80, 80); }
        }
      }
      if (e.kind === 'boss') {
        this.spawnTome(e.x, e.y);
        this.barrier = null;
        if (this.boss === e) this.boss = null;
      } else if (e.kind === 'elite') {
        this.pickups.push({ type: 'chest', x: e.x, y: e.y, r: 14, t: 0 });
      } else {
        this.orbs.push({ x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30), t: 0 });
      }
      for (let i = 0; i < 6; i++) this.particles.push({ x: e.x, y: e.y, vx: rand(-120, 120), vy: rand(-120, 120), t: 0.35, max: 0.35, c: e.color, r: rand(2, 5) });
      if (this.weap.id === 'batgun') {
        this.batKills = (this.batKills || 0) + 1;
        if (this.batKills % 6 === 0) {
          const p = this.player;
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this.particles.push({ x: p.x, y: p.y - 26, vx: 0, vy: -40, t: 0.6, max: 0.6, c: '#a3e635', r: 5, text: '+1' });
        }
      }
      if (this.has('shatter') && e.frozenT > 0) this.areaDamage(e.x, e.y, 90, e.maxHp * 0.07);
      if (this.has('splinter')) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, dmg: this.bulletDamage() * 0.1, life: 0.7, r: 4, pierce: 0, bounce: 0, color: '#ffd166' });
        }
      }
    }

    areaDamage(x, y, r, dmg) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(e.x, e.y, x, y) < (r + e.r) ** 2) this.hurtEnemy(e, dmg, { noExecute: true });
      }
    }

    bulletDamage() {
      let d = this.stats.val('bulletDamage') + this.stats.get('flatDamage');
      if (this.has('soul_powered')) d *= 1 + 0.1 * this.player.soulHearts;
      if (this.has('might')) d += 2 * this.player.maxHp;
      if (this.has('glass')) d *= 2;
      if (this.has('tome_wind')) d *= 1 + this.moveBonus();
      if (this.has('dragon_bond')) { const dr = this.summons.find(s => s.kind === 'dragon'); if (dr) d += dr.dmg * 0.1; }
      if (this.has('in_the_wind')) d *= 1 + this.timers.inWindBonus;
      return d;
    }
    moveBonus() { return clamp((this.stats.val('moveSpeed') / 205) - 1, -0.9, 3); }

    playerHit(dmg) {
      const p = this.player;
      if (this.god) return;
      if (p.inv > 0 || this.state !== 'playing') return;
      if (this.has('glass')) { p.hp = 0; this.die(); return; }
      if (this.runeOn('wind_shield') && this.timers.windReady) {   // 风盾挡一发
        this.timers.windReady = false; this.timers.wind = 0; p.inv = 0.6;
        this.dmgTexts.push({ x: p.x, y: p.y - 26, t: 0.6, txt: '风盾', c: '#8ff0e0' });
        return;
      }
      if (p.shield) { p.shield = false; p.shieldCd = Math.max(20, (this.has('stalwart_shield') ? 60 : 120) - 5 * this.runeRank('blessing')); p.inv = 1.2; this.flash(); return; }
      const dodge = clamp((this.stats.val('dodge') + (this.has('reflex') ? this.moveBonus() : 0) + 0.02 * this.runeRank('agility')) * 1, 0, this.dodgeCap());
      if (Math.random() < dodge) { p.inv = 0.5; this.dmgTexts.push({ x: p.x, y: p.y - 24, t: 0.6, txt: '闪避', c: '#8ff0e0' }); return; }
      if (p.soulHearts > 0) {
        p.soulHearts--;
        if (this.has('soul_link')) this.areaDamage(p.x, p.y, 260, 0);
        p.inv = 1.0;
        this.flash();
        return;
      }
      p.hp -= dmg;
      if (this.has('berserk')) this.stats.add({ fireRate: 0.1, reloadRate: 0.1 }); // 钻石：受击后永久 +10%
      p.inv = 1.4;
      p.hitFlash = 0.3;
      this.flash();
      if (this.has('anger_point')) { p.angerT = 30; }
      if (p.hp <= 0) { p.hp = 0; this.die(); }
    }

    flash() { if (this.hooks.onHurt) this.hooks.onHurt(); }

    die() {
      this.state = 'dead';
      this.hooks.onEnd && this.hooks.onEnd(this, false);
    }

    win() {
      this.state = 'won';
      this.hooks.onEnd && this.hooks.onEnd(this, true);
    }

    nearestEnemy(x, y, maxR) {
      let best = null, bd = maxR ? maxR * maxR : Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist2(e.x, e.y, x, y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    spawnTome(x, y) {
      this.pickups.push({ type: 'tome', x, y, r: 16, t: 0 });
    }

    // ---------- 更新 ----------
    update(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      if (this.time >= this.runLen) { this.win(); return; }
      const p = this.player;

      // 计时器
      const T = this.timers;
      if (this.has('regeneration')) { T.regen += dt; if (T.regen >= 90) { T.regen = 0; p.hp = Math.min(p.maxHp, p.hp + 1); } }
      if (this.has('holy_shield') && !p.shield) { p.shieldCd -= dt; if (p.shieldCd <= 0) p.shield = true; }
      if (this.has('in_the_wind')) { T.inWind += dt; if (T.inWind >= 10) { T.inWind = 0; T.inWindBonus = Math.min(0.4, T.inWindBonus + 0.1); } }
      if (this.has('kunoichi')) { T.kunoichi += dt; if (T.kunoichi >= 10) { T.kunoichi = 0; T.kunoichiBonus += 1; } }

      // —— 符文 / 角色升级：周期效果 ——
      const RR = this.runeR || {};
      if (T.barrage > 0) T.barrage -= dt;
      if (T.ethereal > 0) T.ethereal -= dt;
      if (T.whirl > 0) T.whirl -= dt;
      if (T.necro > 0) T.necro -= dt;
      if (T.mom > 0) T.mom -= dt;
      if (T.wind > 0) T.wind -= dt;
      if (this.runeOn('wind_shield')) { // 风盾：10−1/级 秒充能
        if (!T.windReady) { T.wind = (T.wind || 0) + dt; if (T.wind >= Math.max(3, 10 - this.runeRank('wind_shield'))) { T.windReady = true; T.wind = 0; } }
      }
      if (p.skillCd > 0) p.skillCd -= dt;
      if (p.skillT > 0) p.skillT -= dt;
      if (RR.gun_glyph) {
        T.glyphCd -= dt;
        if (T.glyphCd <= 0) {
          T.glyphCd = Math.max(2, 10 - RR.gun_glyph);
          this.glyphs.push({ x: p.x + rand(-80, 80), y: p.y + rand(-80, 80), t: 1.1, r: 15 });
        }
      }
      for (let i = this.glyphs.length - 1; i >= 0; i--) {
        const g = this.glyphs[i]; g.t -= dt;
        if (g.t <= 0) {
          const sm = 1 + this.stats.get('summonDamage');
          for (let k = 0; k < 6; k++) this.fireBullet(g.x, g.y, k / 6 * 6.283, this.bulletDamage() * 0.1 * sm, { pierceAdd: 1 });
          this.particles.push({ x: g.x, y: g.y, vx: 0, vy: 0, t: 0.25, max: 0.25, c: '#c084fc', r: 34, ring: true });
          this.glyphs.splice(i, 1);
        }
      }
      if (RR.seismic_ward) {
        T.ward -= dt;
        if (T.ward <= 0) {
          T.ward = Math.max(3, 10 - RR.seismic_ward);
          this.pushAway();
          this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0.3, max: 0.3, c: '#8ff0e0', r: 210, ring: true });
        }
      }
      if (RR.body_soul) {
        T.soulRune -= dt;
        if (T.soulRune <= 0) { T.soulRune = 300; p.soulHearts = Math.min(3 + RR.body_soul, p.soulHearts + 1); }
      }
      // 钻石：每次回血 → 弹伤与弹体永久 +15%
      if (this.has('bulk_up')) {
        if (this._hpMark === undefined) this._hpMark = p.hp;
        if (p.hp > this._hpMark) { const n = p.hp - this._hpMark; this.stats.add({ bulletDamage: 0.15 * n, bulletSize: 0.15 * n }); }
        this._hpMark = p.hp;
      }

      // 移动
      let mx = 0, my = 0;
      if (Input.keys['a'] || Input.keys['arrowleft']) mx -= 1;
      if (Input.keys['d'] || Input.keys['arrowright']) mx += 1;
      if (Input.keys['w'] || Input.keys['arrowup']) my -= 1;
      if (Input.keys['s'] || Input.keys['arrowdown']) my += 1;
      if (Input.stickL.active) { mx += Input.stickL.x; my += Input.stickL.y; }
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      const shooting = true;
      let speed = this.stats.val('moveSpeed');
      if (this.has('stillness')) speed *= 0.02;
      if (shooting && !this.has('run_gun')) speed *= 0.72; // 开火时走慢（walk speed 概念）
      if (this.has('run_gun')) speed *= 1 + this.stats.get('walkSpeed');
      if (T.mom > 0) speed *= 1 + 0.07 * this.runeRank('momentum');   // 惯性符文：拾取经验后加速
      if (T.whirl > 0) speed *= 1.35;                                  // 阿比：装填后疾风
      if (T.necro > 0) speed *= 1.35;                                  // 莉莉丝：击杀后加速
      if (this.types) { }
      p.x += mx * speed * dt; p.y += my * speed * dt;
      this.clampToMap(p);
      if (len > 0.05) p.hasMoved = true;
      // 齐射飞刀：移动时标记附近敌人（开火时逐个点名飞刀）
      if (this.weap.id === 'salvo') {
        p.markT = (p.markT || 0) - dt;
        if (len > 0.05 && p.markT <= 0) {
          p.markT = 0.55;
          const cand = [];
          for (const e of this.enemies) if (!e.dead && !(e.markT > 0) && dist2(e.x, e.y, p.x, p.y) < 460 * 460) cand.push(e);
          cand.sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
          for (const e of cand.slice(0, 3)) e.markT = 6;
        }
      }
      for (const e of this.enemies) if (e.markT > 0) e.markT -= dt;


      // 电幕
      if (this.barrier) {
        const b = this.barrier;
        b.t -= dt;
        p.x = clamp(p.x, b.x + 20, b.x + b.w - 20);
        p.y = clamp(p.y, b.y + 20, b.y + b.h - 20);
        if (b.t <= 0) this.barrier = null;
      }

      // 瞄准
      let ax = 0, ay = 0, hasAim = false;
      if (this.autoAim) {
        const t = this.nearestEnemy(p.x, p.y, 900);
        if (t) { ax = t.x - p.x; ay = t.y - p.y; hasAim = true; }
      }
      if (!hasAim && Input.stickR.active && (Math.hypot(Input.stickR.x, Input.stickR.y) > 0.25)) {
        ax = Input.stickR.x; ay = Input.stickR.y; hasAim = true;
      } else if (Input.stickR.active === false && Input.touchUsed) {
        const t = this.nearestEnemy(p.x, p.y, 900);
        if (t) { ax = t.x - p.x; ay = t.y - p.y; hasAim = true; }
        else { ax = Math.cos(p.aim); ay = Math.sin(p.aim); hasAim = true; }
      }
      if (!hasAim && !Input.touchUsed) {
        const zz = this.zscale || 1.3;
        const wx = this.camX + (Input.mouse.x - this.vw / 2) / zz, wy = this.camY + (Input.mouse.y - this.vh / 2) / zz;
        ax = wx - p.x; ay = wy - p.y; hasAim = true;
      }
      if (hasAim && (ax || ay)) p.aim = Math.atan2(ay, ax);

      // 十字弩蓄力：按住开火键（鼠标左键 / 右摇杆 / 自动开火）时累积
      if (this.weap.id === 'crossbow' && p.reloading <= 0 && p.ammo > 0) {
        const holding = Input.mouse.down || Input.stickR.active || this.autoAim;
        if (holding) p.charge = Math.min(p.chargeMax, p.charge + dt);
      }
      // 开火
      p.cooldown -= dt;
      if (p.reloading > 0) {
        p.reloading -= dt;
        if (p.reloading <= 0) {
          p.ammo = Math.round(this.stats.val('ammo'));
          p.reloadCount = (p.reloadCount || 0) + 1;
          if (this.char.mech === 'blackhole') this.blackhole(p.x, p.y);
          if (this.char.mech === 'sword') this.bullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, dmg: 22, life: 5, r: 14, pierce: 99, bounce: 0, orbit: p, orbitA: 0, kind: 'sword', color: '#ff4f8b', summon: true });
          if (this.has('fresh_clip')) p.freshT = 1;
          if (this.has('holy_arts')) this.smite(p.x, p.y, 20 + (this.has('holy_might') ? 10 * p.hp : 0), 220);
          if (this.has('ice_shard')) for (let i = 0; i < 3; i++) { const a = p.aim + (i - 1) * 0.3; this.fireBullet(p.x, p.y, a, this.bulletDamage(), { freeze: 1 }); }
          if (this.has('fan_fire')) for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.fireBullet(p.x, p.y, a, this.bulletDamage() * 0.15, {}); }
          if (this.has('tome_electro')) this.lightning(p.x, p.y, 22);
          if (this.has('energized')) { }
          // —— 装填触发（符文 / 武器二级行为 / 角色升级）——
          if (this.weap.id === 'magic_bow') this.recallArrows();          // 魔弓：箭矢回旋
          if (this.runeOn('courage')) this.pushAway();                    // 勇气符文：装填震退
          if (this.has('whirlwind')) this.timers.whirl = 2;               // 阿比：装填后疾风
          if (this.has('thousand_blades')) {                              // 武士：装填额外魔剑
            for (let k = 0; k < 2; k++) this.bullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, dmg: 22, life: 5, r: 12, pierce: 99, bounce: 0, orbit: p, orbitA: k * Math.PI, kind: 'sword', color: '#ff4f8b', summon: true });
          }
        }
      } else if (p.cooldown <= 0 && p.ammo > 0 && p.charge >= (this.weap.id === 'crossbow' ? p.chargeMax : 0)) {
        this.shoot(); // 十字弩：拉满才击发（伤害 2.6x、穿透 +3）
      }
      if (p.freshT > 0) p.freshT -= dt;
      if (p.angerT > 0) p.angerT -= dt;
      if (p.inv > 0) p.inv -= dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;

      // 角色机制计时
      if (this.char.mech === 'deer') {
        T.deer -= dt;
        if (T.deer <= 0) { T.deer = 10; T.deerOn = 2; }
        if (T.deerOn > 0) {
          T.deerOn -= dt; this.areaDamage(p.x, p.y, 42, 100); p.inv = 0.2;
          // 达舍：冰雹使者——鹿形态冲锋射出雪球
          if (this.has('hail_bringer')) {
            for (let i = 0; i < 3; i++) this.fireBullet(p.x, p.y, p.aim + (i - 1) * 0.4, this.bulletDamage() * 0.25 + 8, { freeze: 1 });
          }
        }
      }
      if (this.char.mech === 'tentacle') {
        let cd = 30;
        if (this.has('tent_fast')) cd /= 2;
        if (this.has('tent_fast2')) cd /= 2;
        T.tent = (T.tent || cd) - dt;
        if (T.tent <= 0) {
          T.tent = cd;
          const t = this.nearestEnemy(p.x, p.y, 500);
          if (t) this.hurtEnemy(t, (30 + (this.has('tent_dmg') ? 30 : 0)) * (1 + this.stats.get('summonDamage')));
        }
      }

      // 召唤物
      this.updateSummons(dt);
      // 刷怪
      this.updateSpawns(dt);
      // 敌人
      this.updateEnemies(dt);
      // 子弹
      this.updateBullets(dt);
      // 敌人子弹
      this.updateEBullets(dt);
      // 拾取
      this.updatePickups(dt);
      // 粒子
      for (let i = this.particles.length - 1; i >= 0; i--) { const q = this.particles[i]; q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; if (q.t <= 0) this.particles.splice(i, 1); }
      for (let i = this.dmgTexts.length - 1; i >= 0; i--) { const q = this.dmgTexts[i]; q.t -= dt; q.y -= 30 * dt; if (q.t <= 0) this.dmgTexts.splice(i, 1); }

      // 视野（凝视 / 圣盾）
      if (this.has('glare')) { T.glare = (T.glare || 0) - dt; const iv = this.has('saccade') ? 0.5 : 1; if (T.glare <= 0) { T.glare = iv; const dmg = 15 * (this.has('intense_glare') ? 2 : 1); this.areaDamage(p.x, p.y, this.stats.val('visionRange'), dmg); } }
      if (this.has('divine_wrath') && p.shield) { T.wrath = (T.wrath || 0) - dt; if (T.wrath <= 0) { T.wrath = 1; const t = this.nearestEnemy(p.x, p.y, 400); if (t) this.lightning(t.x, t.y, 22); } }
      if (this.has('aero_magic')) { T.aero = (T.aero || 0) - dt; if (T.aero <= 0) { T.aero = 2; const base = (20 + (this.has('eye_storm') ? 5 : 0) + (this.has('aero_mastery') ? 15 : 0)) * (1 + (this.has('windborne') ? this.moveBonus() : 0)); this.areaDamage(p.x, p.y, 120, base); if (this.has('eye_storm')) this.areaDamage(p.x, p.y, 70, base * 2); } }

      // 相机
      this.camX += (p.x - this.camX) * Math.min(1, dt * 10);
      // 有界地图：相机不越过场地边界（视野比场地还宽时就居中）
      {
        const m = this.map, zz = this.zscale || 1.3;
        const hw = this.vw / (2 * zz), hh = this.vh / (2 * zz);
        if (m && m.bounds) {
          this.camX = m.bounds.x > hw ? clamp(this.camX, -m.bounds.x + hw, m.bounds.x - hw) : 0;
          this.camY = m.bounds.y > hh ? clamp(this.camY, -m.bounds.y + hh, m.bounds.y - hh) : 0;
        } else if (m && m.corridor) {
          this.camY = m.corridorHalf > hh ? clamp(this.camY, -m.corridorHalf + hh, m.corridorHalf - hh) : 0;
        }
      }
      this.camY += (p.y - this.camY) * Math.min(1, dt * 10);
    }

    shoot() {
      const p = this.player;
      const proj = Math.round(this.stats.val('projectiles'));
      const spread = this.stats.get('spread') * Math.PI / 180;
      const T = this.timers;
      let ammoCost = 1;
      if (T.ethereal > 0) ammoCost = 0;                 // 文：以太（每 50 杀不耗弹）
      if (this.has('siege') && !p.hasMovedRecently && Math.random() < 0.4) ammoCost = 0;
      p.hasMovedRecently = false;
      p.ammo -= ammoCost;
      // 射速修正：元素弹幕 / 坚韧 / 倾泻（阿比）
      let fr = this.stats.val('fireRate');
      if (T.barrage > 0) fr *= 1.5;
      if (this.runeOn('tenacity') && p.hp <= p.maxHp / 2) fr *= 1 + 0.03 * this.runeRank('tenacity');
      if (this.has('make_it_rain') && p.skillT > 0) fr *= 2;
      p.cooldown = 1 / Math.max(0.2, fr);
      p.shots++;
      // 十字弩蓄力：伤害 1x→2.6x，穿透 +0~3
      const cq = this.weap.id === 'crossbow' ? clamp(p.charge / p.chargeMax, 0, 1) : 0;
      let dmg = this.bulletDamage() * (p.freshT > 0 ? 1.5 : 1) * (1 + 1.6 * cq);
      let count = this.has('double_base_proj') ? proj * 2 : proj;
      if (this.hasEvo('volley') && (p.ammo <= 0 || p.ammo >= Math.round(this.stats.val('ammo')) - 1)) count += 3;
      const wo = this.weaponShotOpts();
      if (cq > 0) wo.pierceAdd = (wo.pierceAdd || 0) + Math.floor(cq * 3);
      // 文：节奏——每第 3 发无限穿透、弹体翻倍、伤害提升
      if (this.runeOn('cadence') && p.shots % 3 === 0) {
        dmg *= 1 + 0.2 * this.runeRank('cadence');
        wo.pierceAdd = 999;
        wo.rMul = (wo.rMul || 1) * 2;
      }
      // 钻石：生命 ≤ 一半时穿透 +2
      if (this.has('strong_will') && p.hp <= p.maxHp / 2) wo.pierceAdd = (wo.pierceAdd || 0) + 2;
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i - (count - 1) / 2) * (spread || 0.06);
        this.fireBullet(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, p.aim + off, dmg, wo);
      }
      if (this.has('split_fire')) this.fireBullet(p.x, p.y, p.aim + Math.PI, dmg, {});
      // 角色射击特效
      const m = this.char.mech;
      if (m === 'firewave' && p.shots % 3 === 0) this.areaDamage(p.x + Math.cos(p.aim) * 60, p.y + Math.sin(p.aim) * 60, 80, 6);
      if (m === 'lightning' && Math.random() < 0.5) { const t = this.nearestEnemy(p.x, p.y, 500); if (t) this.lightning(t.x, t.y, 5); }
      if (m === 'frost' && p.shots % (this.has('butterfly_dance') ? 3 : 6) === 0) {
        const n = 1 + (this.has('pair_up') ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const t = this.nearestEnemy(p.x, p.y, 500);
          if (t) { t.frozenT = 1.5; this.areaDamage(t.x + k * 40 - 40, t.y, 80, 0); if (this.has('brittle')) this.hurtEnemy(t, 6); }
        }
      }
      if (m === 'dump' && p.shots % 4 === 0) {
        // 阿比：倾泻——每 4 发额外散射 4 发（60% 伤害）
        for (let i = -2; i <= 2; i++) if (i) this.fireBullet(p.x, p.y, p.aim + i * 0.16, dmg * 0.6, {});
      }
      // 升级特效
      if (this.has('electro_mage') && p.shots % 2 === 0) { const t = this.nearestEnemy(p.x, p.y, 520); if (t) this.lightning(t.x, t.y, 22); }
      if (this.has('fire_starter') && p.shots % 5 === 0) {
        const t = this.nearestEnemy(p.x, p.y, 600);
        const tx = t ? t.x : p.x + Math.cos(p.aim) * 300, ty = t ? t.y : p.y + Math.sin(p.aim) * 300;
        this.areaDamage(tx, ty, 90, 40);
        for (const e of this.enemies) if (dist2(e.x, e.y, tx, ty) < 120 ** 2) this.burn(e, 3);
      }
      if (this.has('kill_clip')) { }
      // 齐射飞刀：对每个标记目标各射一飞刀
      if (this.weap.id === 'salvo') {
        for (const e of this.enemies) {
          if (e.dead || !(e.markT > 0)) continue;
          const mb = this.fireBullet(p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), dmg, { boomerang: true, life: 1.4, rMul: 1.2, pierceAdd: 1 });
          mb.marked = true;
        }
      }
      if (p.ammo <= 0) { p.reloading = this.reloadTime(); p.ammo = 0; }
      // 文：余震——打空弹匣时对周围敌人造成范围伤害
      if (p.ammo <= 0 && this.runeOn('aftershock')) {
        this.areaDamage(p.x, p.y, 190, this.bulletDamage() * 0.2 * this.runeRank('aftershock'));
        this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0.3, max: 0.3, c: '#ffb347', r: 190, ring: true });
      }
      if (this.weap.id === 'crossbow') p.charge = 0; // 蓄力一击打完清零
      if (this.has('charge_shot')) { }
      if (this.hooks.onShot) this.hooks.onShot(this);
    }

    // 魔弓：装填时插在地上的箭回旋飞回，穿透沿途敌人
    recallArrows() {
      const p = this.player;
      for (const s of this.stuck) {
        const a = Math.atan2(p.y - s.y, p.x - s.x);
        const b = this.fireBullet(s.x, s.y, a, s.dmg, { pierceAdd: 99, speedMul: 1.6, rMul: 1.3, life: 1.4 });
        b.recall = true;
      }
      this.stuck.length = 0;
    }

    reloadTime() { return this.weap.reload / Math.max(0.15, this.stats.val('reloadRate')); }

    // 各武器的弹道/命中特性（原作每把枪玩法不同，这里用弹体字段表达）
    weaponShotOpts() {
      const id = this.weap.id;
      if (id === 'crossbow')  return { pierceAdd: 2 };
      if (id === 'magic_bow') return { pierceAdd: 3, stick: true, life: 2.2 };
      if (id === 'grenade')   return { explode: 84, speedMul: 0.6, life: 1.0, rMul: 2.2, selfHurt: true };
      if (id === 'flame')     return { speedMul: 0.55, life: 0.55, rMul: 1.9, burnHit: 3 };
      if (id === 'salvo')     return { boomerang: true, life: 1.7, rMul: 1.2 };
      if (id === 'batgun')    return { homing: true, rMul: 1.5, speedMul: 0.9 };
      if (id === 'watering')  return { spore: true, rMul: 1.3, speedMul: 0.85 };
      if (id === 'dual_smg')  return { dual: true };
      return {};
    }

    fireBullet(x, y, a, dmg, opts) {
      opts = opts || {};
      const sp = this.stats.val('bulletSpeed') * (opts.speedMul || 1);
      const b = {
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg,
        life: opts.life || 1.5,
        r: 4.5 * this.stats.val('bulletSize') * (opts.rMul || 1),
        pierce: Math.round(this.stats.get('piercing')) + (opts.pierceAdd || 0),
        bounce: Math.round(this.stats.get('bounce')),
        hits: new Set(), color: '#ffe066', crit: false,
      };
      if (opts.explode) { b.explode = opts.explode; b.selfHurt = !!opts.selfHurt; }
      if (this.hasEvo('headshot') && Math.random() < 0.3) b.dmg *= 3;
      if (this.hasEvo('dmgFromSpeed')) b.dmg *= 1 + this.moveBonus();
      if (this.hasEvo('pierceToBounce')) { b.bounce += b.pierce + 1; b.pierce = 0; }
      if (this.hasEvo('jet_stream')) b.life *= 1.5;
      if (opts.burnHit) b.burnHit = opts.burnHit;
      if (opts.boomerang) { b.boomerang = true; b.bt = 0; b.pierce = Math.max(b.pierce, 3); }
      if (opts.spore) b.spore = true;
      if (opts.stick) b.stick = true;
      if (opts.homing) { b.homing = this.nearestEnemy(x, y, 520) || null; b.homingWeak = true; }
      this.bullets.push(b);
      return b;
    }

    growSpore(x, y) {
      const spores = this.summons.filter(s => s.kind === 'spore');
      if (spores.length >= 4) this.summons.splice(this.summons.indexOf(spores[0]), 1);
      this.summons.push({ kind: 'spore', x, y, cd: 0.8, t: 0, life: 14, dmg: 18 });
      this.particles.push({ x, y, vx: 0, vy: 0, t: 0.3, max: 0.3, c: '#7dd3a0', r: 16, ring: true });
    }

    burn(e, dps) {
      const fresh = !(e.burnT > 0);
      e.burnT = Math.max(e.burnT || 0, this.has('lasting_flame') ? 6 : 3);
      e.burnDps = Math.max(e.burnDps || 0, dps * (1 + this.stats.get('burnDamage')));
      if (fresh) this.countElement();
      if (this.has('pyromania')) this.stats.add({ fireRate: 0.1 }); // 斯嘉丽：每次点燃 +10% 射速，装填清零（简化：不清零）
    }
    freeze(e) {
      const fresh = !(e.frozenT > 0);
      e.frozenT = Math.max(e.frozenT || 0, 1.5 * (1 + this.stats.get('freezeDuration')) * (e.kind === 'boss' ? 0.2 : 1));
      if (fresh) this.countElement();
      if (this.has('frostbite')) this.hurtEnemy(e, e.maxHp * (e.kind === 'boss' ? 0.01 : 0.15), { noExecute: true });
      if (this.has('frost_fire')) this.burn(e, 6);
    }
    // 元素弹幕符文：累计 50 次点燃/冻结 → 短时爆发
    countElement() {
      if (!this.runeOn('elemental_barrage')) return;
      const T = this.timers;
      T.elem++;
      if (T.elem >= 50) { T.elem = 0; T.barrage = this.runeRank('elemental_barrage'); }
    }
    curse(e) {
      e.curseT = 0.75;
      e.curseDmg = this.bulletDamage() * (this.has('doom') ? 4 : 2) * (this.has('shadow_affinity') ? 1.75 : 1);
      if (this.has('shadow_flame')) this.burn(e, e.curseDmg * 0.35); // 瑞文：诅咒附带燃烧
    }
    lightning(x, y, dmg) {
      // 斯帕克：蓄能——每第 3 道闪电双倍伤害并回 1 发子弹
      this.litCount = (this.litCount || 0) + 1;
      if (this.has('charged_up') && this.litCount % 3 === 0) {
        dmg *= 2;
        this.player.ammo = Math.min(Math.round(this.stats.val('ammo')), this.player.ammo + 1);
      }
      const d = (dmg + (this.has('electro_mastery') ? 12 : 0)) * (1 + this.stats.get('lightningDamage'));
      const r = 46 * (this.has('electro_mastery') ? 1.75 : 1);
      this.areaDamage(x, y, r, d);
      if (this.has('electrical_fire')) { // 斯帕克：闪电点燃
        for (const e of this.enemies) if (!e.dead && dist2(e.x, e.y, x, y) < r * r) this.burn(e, 3);
      }
      this.particles.push({ x, y, vx: 0, vy: 0, t: 0.15, max: 0.15, c: '#fff3a0', r: r * 0.6, ring: true });
      if (this.has('energized') && Math.random() < 0.2) this.player.ammo = Math.min(Math.round(this.stats.val('ammo')), this.player.ammo + 3);
      if (this.has('overload')) {
        for (const e of this.enemies) if (e.burnT > 0 && dist2(e.x, e.y, x, y) < r * r) { this.areaDamage(e.x, e.y, 80, 25); break; }
      }
    }
    smite(x, y, dmg, r) {
      this.areaDamage(x, y, r, dmg);
      this.particles.push({ x, y, vx: 0, vy: 0, t: 0.2, max: 0.2, c: '#fff8d0', r: r * 0.5, ring: true });
    }
    blackhole(x, y) {
      const pull = (cx, cy) => {
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - cx, e.y - cy) || 1;
          if (d < 260) { e.x += (cx - e.x) / d * 70; e.y += (cy - e.y) / d * 70; }
        }
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, t: 0.4, max: 0.4, c: '#9d7bff', r: 120, ring: true });
      };
      pull(x, y);
      // 露娜：平行星——身后再开一个
      if (this.has('parallel_star')) pull(x - Math.cos(this.player.aim) * 180, y - Math.sin(this.player.aim) * 180);
      // 露娜：内爆——黑洞造成弹伤；宇宙爆发——射出 3 发 50% 伤害
      if (this.has('implosion')) this.areaDamage(x, y, 240, this.bulletDamage());
      if (this.has('cosmic_burst')) {
        const base = this.player.aim;
        for (let i = -1; i <= 1; i++) this.fireBullet(x, y, base + i * 0.5, this.bulletDamage() * 0.5, { pierceAdd: 1 });
      }
    }

    updateSummons(dt) {
      const p = this.player;
      for (const s of this.summons) {
        s.t += dt;
        if (s.kind === 'dragon_egg') {
          s.hatch -= dt;
          if (s.hatch <= 0) { s.kind = 'dragon'; s.dmg = 30; s.cd = 1.2; }
          continue;
        }
        if (s.kind === 'spore') { // 浇水枪种下的孢子花：原地周期喷孢子
          s.life = (s.life || 14) - dt;
          if (s.life <= 0) { this.summons.splice(this.summons.indexOf(s), 1); continue; }
          s.cd -= dt * (1 + this.stats.get('summonAttackSpeed'));
          if (s.cd <= 0) {
            s.cd = 1.4;
            const spDmg = 18 * (1 + this.stats.get('summonDamage')) * (this.hasEvo('power_spray') ? 1 + this.stats.get('bulletDamage') : 1);
            this.areaDamage(s.x, s.y, 92, spDmg);
            this.particles.push({ x: s.x, y: s.y, vx: 0, vy: 0, t: 0.25, max: 0.25, c: '#7dd3a0', r: 70, ring: true });
          }
          continue;
        }
        // 跟随
        const tgt = this.nearestEnemy(s.x, s.y, 700);
        const spd = 120;
        if (s.kind === 'scythe' || s.kind === 'lens') {
          s.ang = (s.ang || 0) + dt * 2.2;
          const off = s.kind === 'lens' ? 70 : 54;
          s.x = p.x + Math.cos(s.ang) * off; s.y = p.y + Math.sin(s.ang) * off;
        } else if (tgt) {
          const d = Math.hypot(tgt.x - s.x, tgt.y - s.y) || 1;
          if (d > 40) { s.x += (tgt.x - s.x) / d * spd * dt; s.y += (tgt.y - s.y) / d * spd * dt; }
        } else {
          const d = Math.hypot(p.x - s.x, p.y - s.y) || 1;
          if (d > 60) { s.x += (p.x - s.x) / d * spd * dt; s.y += (p.y - s.y) / d * spd * dt; }
        }
        s.cd -= dt * (1 + this.stats.get('summonAttackSpeed') + (s.kind === 'clone' && this.has('shadow_fast') ? 2 : 0));
        if (s.cd <= 0) {
          s.cd = s.kind === 'dragon' ? 1.2 : s.kind === 'clone' ? (this.has('shadow_fast') ? 0.3 : 0.9) : 0.9;
          let sm = 1 + this.stats.get('summonDamage');
          // 文：专精——场上恰好 1 个召唤物（震地守卫算 2 个）时 +10%/级
          const sCount = this.summons.length + (this.runeOn('seismic_ward') ? 2 : 0);
          if (this.runeOn('dedication') && sCount === 1) sm *= 1 + 0.1 * this.runeRank('dedication');
          if (s.kind === 'clone') {
            if (tgt) this.hurtEnemy(tgt, 14 * sm);
          } else if (s.kind === 'crow') {
            if (tgt) {
              const a = Math.atan2(tgt.y - s.y, tgt.x - s.x);
              this.bullets.push({ x: s.x, y: s.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg: (this.has('flock_crows') ? Math.max(10, this.bulletDamage()) : 10) * sm, life: 1.4, r: 6, pierce: 99, bounce: 0, color: '#5b6cff', hits: new Set(), summon: true, curseOn: true, crow: true });
            }
          } else if (s.kind === 'deer') {
            if (tgt) { this.hurtEnemy(tgt, this.bulletDamage() * 0.5 * sm); this.particles.push({ x: tgt.x, y: tgt.y, vx: 0, vy: 0, t: 0.2, max: 0.2, c: '#e07b3c', r: 20, ring: true }); }
          } else if (s.kind === 'scythe') {
            const base = 40 * (s.hitCount ? 1 : 1) * (1 + (this.has('scythe_mastery') ? this.stats.get('bulletDamage') : 0) + (this.has('windcutter') ? this.moveBonus() : 0));
            if (tgt && dist2(tgt.x, tgt.y, s.x, s.y) < 120 ** 2) { this.hurtEnemy(tgt, base * sm); if (this.has('shadowblade')) { this.curse(tgt); } }
          } else if (s.kind === 'spear') {
            const base = (20 + (this.has('holy_spear') ? 10 * p.maxHp : 0) + (this.has('soul_knight') ? 15 * p.soulHearts : 0)) * sm;
            if (tgt) this.hurtEnemy(tgt, base);
          } else if (s.kind === 'ghost') {
            if (tgt) {
              const a = Math.atan2(tgt.y - s.y, tgt.x - s.x);
              const bb = this.bullets.push({ x: s.x, y: s.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg: 8 * sm, life: 1.4, r: 5, pierce: 99, bounce: 0, color: '#c7d2ff', hits: new Set(), summon: true, ghost: true });
            }
          } else if (s.kind === 'dragon') {
            if (tgt) { this.hurtEnemy(tgt, s.dmg * sm); this.particles.push({ x: tgt.x, y: tgt.y, vx: 0, vy: 0, t: 0.2, max: 0.2, c: '#ff8844', r: 24, ring: true }); }
          } else if (s.kind === 'electro_bug') {
            const t1 = this.nearestEnemy(s.x, s.y, 500);
            if (t1) this.lightning(t1.x, t1.y, 22);
            const t2 = this.enemies.filter(e => !e.dead && e !== t1 && dist2(e.x, e.y, s.x, s.y) < 500 ** 2)[0];
            if (t2) this.lightning(t2.x, t2.y, 22);
          }
        }
        if (this.has('hellspawns') && tgt && dist2(tgt.x, tgt.y, s.x, s.y) < 60 ** 2) this.burn(tgt, 3);
      }
    }

    clampToMap(p) {
      const m = this.map;
      if (m.bounds) {
        p.x = clamp(p.x, -m.bounds.x + p.r, m.bounds.x - p.r);
        p.y = clamp(p.y, -m.bounds.y + p.r, m.bounds.y - p.r);
      }
      if (m.corridor) p.y = clamp(p.y, -m.corridorHalf + p.r, m.corridorHalf - p.r);
      // 神秘树：实体障碍，撞上扣 1 血（1.2 秒一次）
      p.treeCd = (p.treeCd || 0) - 0.016;
      for (const t of this.trees) {
        if (t.hp <= 0) continue;
        const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy), lim = t.r + p.r;
        if (d < lim && d > 0.001) {
          p.x = t.x + dx / d * lim; p.y = t.y + dy / d * lim;
          if (p.treeCd <= 0) { p.treeCd = 1.2; this.playerHit(1); }
        }
      }
      // 立柱是实体：贴上去会被推开
      if (m.pillars) {
        for (const [px, py, pr] of m.pillars) {
          const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy), lim = pr + p.r;
          if (d < lim && d > 0.001) { p.x = px + dx / d * lim; p.y = py + dy / d * lim; }
        }
      }
      if (m.pillars) {
        for (const [px, py, pr] of m.pillars) {
          const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy) || 1, need = pr + p.r;
          if (d < need) { p.x = px + dx / d * need; p.y = py + dy / d * need; }
        }
      }
    }

    // 敌人生成点也必须落在场地内（有界地图不能刷到墙外）
    clampSpawn(x, y) {
      const m = this.map;
      if (m.bounds) {
        x = clamp(x, -m.bounds.x + 40, m.bounds.x - 40);
        y = clamp(y, -m.bounds.y + 40, m.bounds.y - 40);
      }
      if (m.corridor) y = clamp(y, -m.corridorHalf + 40, m.corridorHalf - 40);
      return [x, y];
    }

    updateSpawns(dt) {
      const alive = this.enemies;
      const cap = 240; // 严格上限：超出就裁掉最远的普通小怪（精英/Boss 不裁）
      if (alive.length > cap) {
        const ps = this.player;
        const smalls = alive.filter(e => e.kind === 'small');
        smalls.sort((a, b) => dist2(b.x, b.y, ps.x, ps.y) - dist2(a.x, a.y, ps.x, ps.y));
        let over = alive.length - cap;
        for (const e of smalls) {
          if (over <= 0) break;
          e.dead = true; alive.splice(alive.indexOf(e), 1); over--;
        }
      }
      for (const s of this.sessions) {
        if (s.single) {
          if (s.fired || this.time < s.start) continue;
          s.fired = true;
          this.spawnEnemy(s.e, s.hp, true);
          continue;
        }
        if (this.time < s.start || this.time > s.end) continue;
        s.timer -= dt;
        if (s.timer > 0) continue;
        s.timer = s.cd / this.dm.spawnRate;
        let cnt = 0;
        for (let i = 0; i < alive.length; i++) if (alive[i].sess === s) cnt++;
        const room = cap - alive.length;
        if (cnt >= s.max || room <= 0) continue;
        const n = Math.min(room, Math.max(1, Math.floor(s.n * (this.dm.spawnRate > 1 ? 1 : 1))));
        for (let i = 0; i < n; i++) this.spawnEnemy(s.e, s.hp, false, s);
      }
    }

    spawnEnemy(type, hp, isSpecial, sess) {
      const def = D.ENEMIES[type];
      const p = this.player;
      let x, y;
      if (isSpecial) {
        const a = Math.random() * Math.PI * 2;
        x = p.x + Math.cos(a) * 520; y = p.y + Math.sin(a) * 520;
      } else {
        const a = Math.random() * Math.PI * 2;
        const zz = this.zscale || 1.3;
        const r = Math.max(this.vw, this.vh) / zz * 0.62 + rand(0, 120);
        x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
      }
      [x, y] = this.clampSpawn(x, y);
      let mult = 1;
      if (this.endless && !isSpecial) mult *= 1 + 0.45 * Math.floor(this.time / 600); // 每 10 分钟怪更硬
      if (def.kind === 'small') mult = this.dm.smallHp;
      else if (def.kind === 'elite') mult = this.dm.eliteHp;
      else if (def.kind === 'boss') mult = this.dm.bossHp;
      const e = {
        type, x, y, r: def.r, speed: def.speed, color: def.color, kind: def.kind, shape: def.shape,
        hp: hp * mult, maxHp: hp * mult, dmg: def.dmg * (def.kind === 'elite' ? this.dm.eliteDmg : def.kind === 'boss' ? this.dm.bossDmg : 1),
        dead: false, flash: 0, sess, slow: 0, frozenT: 0, burnT: 0, curseT: 0, atkCd: rand(0.5, 2),
        wob: Math.random() * 6.28,
      };
      if (def.kind === 'small') e.speed *= this.dm.smallSpeed;
      if (def.kind === 'elite') e.speed *= this.dm.eliteSpeed;
      this.enemies.push(e);
      if (def.kind === 'boss') {
        this.boss = e;
        if (this.map.barrier) this.barrier = { x: p.x - this.vw * 0.42, y: p.y - this.vh * 0.42, w: this.vw * 0.84, h: this.vh * 0.84, t: 60 };
        if (this.hooks.onBoss) this.hooks.onBoss(this);
      }
      this.spawned++;
      return e;
    }

    updateEnemies(dt) {
      const p = this.player;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead) { this.enemies.splice(i, 1); continue; }
        if (e.flash > 0) e.flash -= dt;
        // 状态
        if (e.burnT > 0) { e.burnT -= dt; this.hurtEnemy(e, (e.burnDps || 0) * dt, { noExecute: true }); if (e.dead) continue; }
        if (e.curseT > 0) { e.curseT -= dt; if (e.curseT <= 0) { this.hurtEnemy(e, e.curseDmg || 0, { noExecute: true }); if (e.dead) continue; } }
        if (e.frozenT > 0) { e.frozenT -= dt; e.wob += dt * 6; }
        else {
          const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
          const sp = e.speed;
          let dx = (p.x - e.x) / d, dy = (p.y - e.y) / d;
          if (e.type === 'spawner') {
            if (d < 260) { dx = -dx * 0.6; dy = -dy * 0.6; }
            e.atkCd -= dt;
            if (e.atkCd <= 0) {
              e.atkCd = 3;
              for (let k = 0; k < 2; k++) {
                this.spawnEnemy('spawnling', 400 / 4, false);
                const sp2 = this.enemies[this.enemies.length - 1];
                if (sp2) { sp2.x = e.x + rand(-70, 70); sp2.y = e.y + rand(-70, 70); }
              }
            }
          } else if (e.type === 'elder') {
            if (d < 380) { dx *= 0.12; dy *= 0.12; }
            e.atkCd -= dt;
            if (e.atkCd <= 0) {
              e.atkCd = 2.4 / this.dm.bossAtk;
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 7, dmg: 1, life: 4, color: '#f87171' });
            }
          } else if (e.type === 'cultist' || e.type === 'witch') {
            // 施法者：保持中距离，周期性朝玩家放暗弹（witch 三连扇，cultist 单发快弹）
            const keep = e.type === 'witch' ? 300 : 260;
            if (d < keep) { dx *= 0.15; dy *= 0.15; }
            e.atkCd -= dt;
            if (e.atkCd <= 0 && d < 560) {
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              if (e.type === 'witch') {
                e.atkCd = 2.0 / this.dm.bossAtk;
                for (let k = -1; k <= 1; k++) {
                  const aa = a + k * 0.18;
                  this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 200, vy: Math.sin(aa) * 200, r: 6, dmg: 1, life: 4, color: '#c084fc' });
                }
              } else {
                e.atkCd = 2.4 / this.dm.bossAtk;
                this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 7, dmg: 1, life: 4, color: '#a78bfa' });
              }
            }
          } else if (e.type === 'winged') {
            e.dashT = (e.dashT || 0) - dt;
            if (e.dashT <= 0) { e.dashT = 2.6; e.dashFor = 0.6; }
            if (e.dashFor > 0) { e.dashFor -= dt; dx *= 2.6; dy *= 2.6; }
          } else if (e.kind === 'boss') {
            if (d < 220) { dx *= 0.3; dy *= 0.3; }
            e.atkCd -= dt;
            if (e.atkCd <= 0) {
              const sd = D.ENEMIES[e.type].shots;
              e.atkCd = (sd ? sd.cd : 2) / this.dm.bossAtk;
              const n = sd ? sd.n : 8;
              for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2 + this.time;
                this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * (sd ? sd.speed : 150), vy: Math.sin(a) * (sd ? sd.speed : 150), r: 8, dmg: 1, life: 5, color: '#f472b6' });
              }
            }
          }
          if (e.kind === 'small' && e.type === 'sploder') {
            if (d < 46) { this.playerHit(e.dmg); this.areaDamage(e.x, e.y, 70, 0); e.dead = true; this.killEnemy(e); continue; }
          }
          e.x += dx * sp * dt; e.y += dy * sp * dt;
          e.wob += dt * 8;
        }
        // 接触伤害
        if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) {
          let dmg = e.dmg;
          if (e.kind === 'small' && this.dark >= 10 && this.time > this.runLen - 300) dmg *= this.dm.smallDmgLate;
          this.playerHit(dmg);
        }
      }
      // 分离（避免叠在一起）
      const arr = this.enemies;
      for (let i = 0; i < arr.length; i += 1) {
        const a = arr[i];
        for (let j = i + 1; j < Math.min(arr.length, i + 6); j++) {
          const b = arr[j];
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = (a.r + b.r) * 0.8;
          if (d2 < rr * rr && d2 > 0.01) {
            const d = Math.sqrt(d2), push = (rr - d) * 0.5;
            a.x -= dx / d * push; a.y -= dy / d * push;
            b.x += dx / d * push; b.y += dy / d * push;
          }
        }
      }
    }

    updateBullets(dt) {
      const p = this.player;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (!b.hits) b.hits = new Set();
        b.life -= dt;
        if (b.life <= 0) {
          if (b.stick) { this.stuck.push({ x: b.x, y: b.y, dmg: b.dmg }); if (this.stuck.length > 30) this.stuck.shift(); }
          this.bullets.splice(i, 1); continue;
        }
        if (b.homing) {
          const t = b.homing.dead ? this.nearestEnemy(b.x, b.y, 400) : b.homing;
          if (t) {
            const a = Math.atan2(t.y - b.y, t.x - b.x), sp = 420;
            b.vx += (Math.cos(a) * sp - b.vx) * Math.min(1, dt * 6);
            b.vy += (Math.sin(a) * sp - b.vy) * Math.min(1, dt * 6);
            b.homing = t;
          }
        }
        if (b.orbit) {
          b.orbitA += dt * 5;
          b.x = b.orbit.x + Math.cos(b.orbitA) * 60; b.y = b.orbit.y + Math.sin(b.orbitA) * 60;
        } else if (b.boomerang) {
          b.bt += dt;
          if (b.bt > 0.42) { // 飞出去再折返，回程可再次命中
            const d = Math.hypot(p.x - b.x, p.y - b.y) || 1;
            b.vx += ((p.x - b.x) / d * 700 - b.vx) * Math.min(1, dt * 4.5);
            b.vy += ((p.y - b.y) / d * 700 - b.vy) * Math.min(1, dt * 4.5);
            if (d < 26) { this.bullets.splice(i, 1); continue; }
          }
          b.x += b.vx * dt; b.y += b.vy * dt;
        } else { b.x += b.vx * dt; b.y += b.vy * dt; }
        if (this.hasEvo('quantum')) {
          const halfW2 = this.vw / (2 * (this.zscale || 1.3)), halfH2 = this.vh / (2 * (this.zscale || 1.3));
          if (b.x < this.camX - halfW2) b.x = this.camX + halfW2 - 4;
          else if (b.x > this.camX + halfW2) b.x = this.camX - halfW2 + 4;
          if (b.y < this.camY - halfH2) b.y = this.camY + halfH2 - 4;
          else if (b.y > this.camY + halfH2) b.y = this.camY - halfH2 + 4;
        }
        // 魔镜
        if (this.has('magic_lens')) {
          const lens = this.summons.find(s => s.kind === 'lens');
          if (lens && !b.lensOn && dist2(b.x, b.y, lens.x, lens.y) < 46 ** 2) {
            b.lensOn = true;
            const k = this.has('focal_point') ? 2 : 1;
            b.dmg *= 1 + 0.3 * k;
            b.r *= 1 + 0.3 * k;
            if (this.has('refraction')) b.bounce += 2 * k;
            if (this.has('igniting_lens')) b.ignite = true;
          }
        }
        // 神秘树：能吃子弹（45000 HP），也是障碍
        let hitTree = false;
        for (const t of this.trees) {
          if (t.hp <= 0) continue;
          if (dist2(b.x, b.y, t.x, t.y) < (t.r + b.r) ** 2) {
            t.hp -= b.dmg; t.flash = 0.07; hitTree = true;
            for (let k = 0; k < 3; k++) this.particles.push({ x: b.x, y: b.y, vx: rand(-90, 90), vy: rand(-90, 90), t: 0.3, max: 0.3, c: '#6b8f3a', r: rand(2, 4) });
            break;
          }
        }
        if (hitTree) { if (b.pierce > 0) { b.pierce--; } else { this.bullets.splice(i, 1); continue; } }

        for (const e of this.enemies) {
          if (e.dead) continue;
          if (b.hits && b.hits.has(e)) continue;
          if (dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) ** 2) {
            if (b.explode) {
              this.areaDamage(b.x, b.y, b.explode, b.dmg);
              this.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, t: 0.25, max: 0.25, c: '#ff9f43', r: b.explode * 0.7, ring: true });
              if (b.selfHurt && !this.hasEvo('blast_immune') && dist2(b.x, b.y, p.x, p.y) < b.explode ** 2) this.playerHit(1);
              if (this.hasEvo('cluster')) {
                for (let k = 0; k < 5; k++) {
                  const a2 = Math.random() * Math.PI * 2;
                  this.fireBullet(b.x, b.y, a2, b.dmg * 0.2, { explode: 46, speedMul: 0.8, life: 0.5, rMul: 1.2 });
                }
              }
              this.bullets.splice(i, 1); break;
            }
            this.onBulletHit(b, e);
            if (e.dead && b.hits && b.hits.has(e)) { /* 继续飞行 */ }
            if (b.pierce > 0) { b.pierce--; b.hits.add(e); }
            else if (b.bounce > 0) { b.bounce--; b.hits.add(e); if (this.hasEvo('trickshot')) b.dmg *= 1.2; const a = Math.atan2(b.vy, b.vx) + Math.PI * (0.5 + Math.random()); const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; }
            else { this.bullets.splice(i, 1); break; }
          }
        }
      }
    }

    onBulletHit(b, e) {
      const dmg = b.summon ? b.dmg : b.dmg;
      this.hurtEnemy(e, dmg, {});
      if (!e.dead || e.dead) { }
      if (b.ignite) this.burn(e, 3);
      // 文：秘法——子弹 2%/级 概率点燃或冻结
      if (this.runeOn('mysticism') && Math.random() < 0.02 * this.runeRank('mysticism')) {
        if (Math.random() < 0.5) this.burn(e, 3); else this.freeze(e);
      }
      if (b.curseOn) this.curse(e);                          // 瑞文：乌鸦/诅咒弹
      if (this.has('fire_edge') && Math.random() < 0.5) this.burn(e, 6);  // 卡塔娜：火刃
      const burnChance = this.effVal('burn', 'chance', 0);
      if (burnChance && Math.random() < burnChance) this.burn(e, this.effVal('burn', 'dps', 3));
      if (this.has('frost_mage') && Math.random() < this.effVal('frost_mage', 'chance', 0.35)) this.freeze(e);
      if (this.has('curse') && Math.random() < this.effVal('curse', 'chance', 0.35)) this.curse(e);
      if (this.has('ghost_wizard') && b.ghost) this.burn(e, 6);
      if (this.has('soothing_warmth') && Math.random() < 0.0005) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      if (b.ghost && this.has('thunderspawns') && Math.random() < 0.3) this.lightning(e.x, e.y, 22);
      if (b.summon && this.has('culling') && e.kind !== 'boss' && Math.random() < 0.15) this.hurtEnemy(e, e.hp + 1);
      if (b.burnHit) this.burn(e, b.burnHit);
      if (this.hasEvo('hail')) {
        if (e.frozenT > 0) this.hurtEnemy(e, dmg * 3, { noExecute: true }); // 已在上面扣过 1 倍，这里补到 4 倍
        else if (Math.random() < 0.1) this.freeze(e);
      }
      if (this.hasEvo('firey') && Math.random() < 0.2) this.burn(e, 6);
      if (this.hasEvo('hellfire') && Math.random() < 0.5) this.burn(e, 3 * (1 + this.stats.get('summonDamage')));
      if (this.hasEvo('shadow') && Math.random() < 0.5) { this.curse(e); e.curseDmg = this.bulletDamage() * 2 * (1 + this.stats.get('summonDamage')); }
      if (this.hasEvo('light_blade') && Math.random() < 0.5) this.smite(e.x, e.y, 20, 60);
      if (b.spore && Math.random() < 0.22) this.growSpore(e.x, e.y);
      if (b.homingWeak) { const t = this.nearestEnemy(b.x, b.y, 400); if (t) b.homing = t; }
    }

    updateEBullets(dt) {
      const p = this.player;
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.life <= 0) { this.ebullets.splice(i, 1); continue; }
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) { this.playerHit(b.dmg); this.ebullets.splice(i, 1); }
      }
    }

    updatePickups(dt) {
      const p = this.player;
      const range = this.stats.val('pickupRange');
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        o.t += dt;
        // 停留 6 秒后开始缓慢自动飞向玩家（避免上千颗球散落一地）
        if (o.t > 6) {
          const dd = Math.hypot(p.x - o.x, p.y - o.y) || 1;
          const sp = Math.min(420, 120 + (o.t - 6) * 90);
          o.x += (p.x - o.x) / dd * sp * dt;
          o.y += (p.y - o.y) / dd * sp * dt;
        }
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        if (d < range) {
          const k = Math.min(1, dt * 8);
          o.x += (p.x - o.x) * k; o.y += (p.y - o.y) * k;
          if (d < 20) { this.orbs.splice(i, 1); this.gainXp(1 * this.dm.xp * this.stats.val('xp')); if (this.hooks.onPickup) this.hooks.onPickup(this, 'xp'); }
        } else {
          o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.94; o.vy *= 0.94;
        }
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const o = this.pickups[i];
        o.t += dt;
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        if (d < 30) {
          if (o.type === 'chest') { this.gainXp(36 * this.dm.xp); this.orbs.splice(0, 0); this.grantCharUpgrade(); }
          else if (o.type === 'tome') { this.openTomes(); }
          else if (o.type === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 1); }
          this.pickups.splice(i, 1);
          if (this.hooks.onPickup) this.hooks.onPickup(this, o.type);
        }
      }
    }

    grantCharUpgrade() {
      // 精英宝箱：角色专属升级三选一（wiki Character_Upgrades，每角色 3 条）
      const pool = (UG.CHAR_UPGRADES || []).filter(u => u.char === this.char.id && !this.taken.has(u.id));
      if (!pool.length) {
        this.dmgTexts.push({ x: this.player.x, y: this.player.y - 30, t: 1.4, txt: '宝箱：专属升级已拿完', c: '#ffd166' });
        return;
      }
      for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      this.charChoices = pool.slice(0, 3);
      this.state = 'charup';
      this.hooks.onCharUp && this.hooks.onCharUp(this);
    }

    chooseCharUp(i) {
      const u = this.charChoices && this.charChoices[i];
      if (!u) return;
      this.taken.add(u.id);
      this.applyUpgrade(u);
      this.charChoices = null;
      this.state = 'playing';
      this.pushAway();
      this.hooks.onLevelUpEnd && this.hooks.onLevelUpEnd(this);
    }

    gainXp(n) {
      this.xp += n;
      if (this.has('recharge') && Math.random() < 0.1) this.player.ammo = Math.min(Math.round(this.stats.val('ammo')), this.player.ammo + 1);
      if (this.has('excitement')) this.player.exciteT = 1;
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = D.xpToLevel(this.level);
        this.pendingLevels++;
      }
      if (this.level >= 20 && !this.evoDone) { this.evoDone = true; this.pendingEvo = true; }
      if (this.state === 'playing') {
        if (this.pendingEvo) this.openEvo();
        else if (this.pendingLevels > 0) this.openLevelUp();
      }
    }

    hasEvo(id) { return this.evo.has(id); }

    // 20 级武器进化：本武器三选一
    openEvo() {
      const pool = (root.DAWN_EVOLUTIONS || []).filter(e => e.weap === this.weap.id && !this.evo.has(e.id));
      if (!pool.length) { this.pendingEvo = false; if (this.pendingLevels > 0) this.openLevelUp(); return; }
      this.evoChoices = pool;
      this.state = 'evo';
      this.hooks.onEvo && this.hooks.onEvo(this);
    }

    chooseEvo(i) {
      const e = this.evoChoices[i];
      if (!e) return;
      this.evo.add(e.id);
      if (e.mods) this.stats.add(e.mods);
      if (e.id === 'vampiric' || e.id === 'light_blade') { this.player.maxHp += 1; this.player.hp += 1; }
      if (e.id === 'focused') { /* 弹丸固定 1，弹体 +500% */ this.stats.add({ projectiles: -10, bulletSize: 5 }); }
      this.pendingEvo = false;
      this.evoChoices = [];
      if (this.pendingLevels > 0) { this.openLevelUp(); return; }
      this.state = 'playing';
      this.pushAway();
      this.hooks.onLevelUpEnd && this.hooks.onLevelUpEnd(this);
    }

    openLevelUp() {
      this.state = 'levelup';
      this.rollChoices();
      this.hooks.onLevelUp && this.hooks.onLevelUp(this);
    }

    openTomes() {
      const pool = UG.TOMES.filter(t => !this.tomesTaken.has(t.id));
      for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      this.tomeChoices = pool.slice(0, 3);
      this.state = 'tome';
      this.hooks.onTome && this.hooks.onTome(this);
    }

    reroll() {
      if (this.char.mech !== 'reroll' || this.rerolled) return false;
      this.rerolled = true;
      this.choices = [];
      this.rollChoices();
      return true;
    }

    // ---------- 渲染 ----------
    render() {
      const ctx = this.ctx, vw = this.vw, vh = this.vh;
      const z = this.zscale || 1.3, dpr = this.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b1410';
      ctx.fillRect(0, 0, vw, vh);
      const camX = this.camX, camY = this.camY;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - camX * z), dpr * (vh / 2 - camY * z));
      const ox = 0, oy = 0;
      const P = this.player;
      const halfW = vw / (2 * z), halfH = vh / (2 * z);

      // 地面：大块硬边拼块 + 碎边点缀
      const TILE = 96;
      const x0 = Math.floor((camX - halfW) / TILE) - 1, x1 = Math.ceil((camX + halfW) / TILE) + 1;
      const y0 = Math.floor((camY - halfH) / TILE) - 1, y1 = Math.ceil((camY + halfH) / TILE) + 1;
      const theme = (this.map && this.map.theme) || { ground: ['#152a1d', '#172d1f', '#132619', '#192f21'], deco: 'tree' };
      const greens = theme.ground;
      const T2 = TILE / 2;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        ctx.fillStyle = greens[h % greens.length];
        ctx.fillRect(tx * TILE + ox, ty * TILE + oy, TILE + 1, TILE + 1);
        // 每格 3 块碎纹理（不同形状，避免棋盘感）
        for (let k = 0; k < 3; k++) {
          const hh = (h ^ (k * 2654435761)) >>> 0;
          const px = tx * TILE + ox + (hh % (TILE - 26)), py = ty * TILE + oy + ((hh >> 7) % (TILE - 22));
          const tx3 = (this.map && this.map.theme && this.map.theme.tex) || ['rgba(56,96,66,0.30)', 'rgba(10,26,16,0.35)', 'rgba(72,120,84,0.22)'];
          if (hh % 3 === 0) {
            ctx.fillStyle = tx3[0];
            ctx.fillRect(px, py, 14 + (hh % 16), 8 + (hh % 10));
          } else if (hh % 3 === 1) {
            ctx.fillStyle = tx3[1];
            ctx.beginPath(); ctx.arc(px + 8, py + 8, 6 + (hh % 9), 0, 6.283); ctx.fill();
          } else {
            ctx.fillStyle = tx3[2];
            ctx.fillRect(px, py, 6 + (hh % 8), 3);
          }
        }
        if (theme.deco === 'pumpkin' && h % 17 === 0) { // 南瓜：橙圆 + 藤
          const bx = tx * TILE + ox + 28 + (h % 30), by = ty * TILE + oy + 30 + ((h >> 6) % 28);
          ctx.fillStyle = '#b45309';
          ctx.beginPath(); ctx.arc(bx, by, 13 + (h % 5), 0, 6.283); ctx.fill();
          ctx.fillStyle = '#d97706';
          ctx.beginPath(); ctx.arc(bx - 3, by - 3, 9 + (h % 4), 0, 6.283); ctx.fill();
          ctx.strokeStyle = '#4d7c0f'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(bx, by - 12); ctx.lineTo(bx + 5, by - 20); ctx.stroke();
        }
        if (theme.deco === 'tree' && h % 23 === 0) { // 树冠：两层偏移圆，避免同心靶心感
          const bx = tx * TILE + ox + 26 + (h % 34), by = ty * TILE + oy + 24 + ((h >> 5) % 32);
          ctx.fillStyle = '#1e3d28';
          ctx.beginPath(); ctx.arc(bx, by, 21 + (h % 6), 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(bx + 11, by + 7, 15 + (h % 4), 0, 6.283); ctx.fill();
          ctx.fillStyle = '#152c1d';
          ctx.beginPath(); ctx.arc(bx + 4, by + 2, 12 + (h % 3), 0, 6.283); ctx.fill();
        }
      }

      // 地图特征：立柱（神庙）与场地边界
      const mm = this.map;
      if (mm && mm.pillars) {
        for (const [px, py, pr] of mm.pillars) {
          if (px < camX - halfW - 120 || px > camX + halfW + 120 || py < camY - halfH - 120 || py > camY + halfH + 120) continue;
          ctx.fillStyle = '#1b2027'; ctx.beginPath(); ctx.arc(px + ox, py + oy, pr + 4, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#39424f'; ctx.beginPath(); ctx.arc(px + ox, py + oy, pr, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.arc(px + ox - pr * 0.22, py + oy - pr * 0.22, pr * 0.5, 0, 6.283); ctx.fill();
        }
      }
      if (this.trees && this.trees.length) {
        for (const t of this.trees) {
          if (t.hp <= 0) continue;
          if (Math.abs(t.x - camX) > halfW + 120 || Math.abs(t.y - camY) > halfH + 120) continue;
          const tx = t.x + ox, ty = t.y + oy;
          // 地面阴影
          ctx.fillStyle = 'rgba(0,0,0,0.34)';
          ctx.beginPath(); ctx.ellipse(tx, ty + 30, 30, 10, 0, 0, 6.283); ctx.fill();
          // 树干
          ctx.fillStyle = '#2b1a10';
          ctx.fillRect(tx - 6, ty + 4, 12, 28);
          // 不规则树冠（四团，避免靶心感）
          ctx.fillStyle = '#16301e';
          ctx.beginPath(); ctx.arc(tx - 15, ty + 2, 19, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(tx + 14, ty - 2, 20, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(tx - 1, ty - 16, 20, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(tx + 1, ty + 4, 22, 0, 6.283); ctx.fill();
          ctx.fillStyle = t.flash > 0 ? '#b9d97a' : '#215033';
          ctx.beginPath(); ctx.arc(tx - 4, ty - 12, 15, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(tx + 10, ty + 1, 11, 0, 6.283); ctx.fill();
          if (t.flash > 0) t.flash -= 0.02;
        }
      }

      if (mm && mm.bounds) {
        const bx0 = -mm.bounds.x + ox, by0 = -mm.bounds.y + oy, bw = mm.bounds.x * 2, bh = mm.bounds.y * 2;
        ctx.fillStyle = '#0d1218';
        // 四周墙外区域
        if (bx0 > camX - halfW) ctx.fillRect(camX - halfW - 50, camY - halfH - 50, (bx0) - (camX - halfW - 50), halfH * 2 + 100);
        if (bx0 + bw < camX + halfW) ctx.fillRect(bx0 + bw, camY - halfH - 50, (camX + halfW + 50) - (bx0 + bw), halfH * 2 + 100);
        if (by0 > camY - halfH) ctx.fillRect(camX - halfW - 50, camY - halfH - 50, halfW * 2 + 100, (by0) - (camY - halfH - 50));
        if (by0 + bh < camY + halfH) ctx.fillRect(camX - halfW - 50, by0 + bh, halfW * 2 + 100, (camY + halfH + 50) - (by0 + bh));
        ctx.strokeStyle = 'rgba(147,197,253,0.42)'; ctx.lineWidth = 10;
        ctx.strokeRect(bx0, by0, bw, bh);
      }
      if (mm && mm.corridor) {
        const top = -mm.corridorHalf + oy, bot = mm.corridorHalf + oy;
        ctx.fillStyle = '#1a1206';
        if (top > camY - halfH) ctx.fillRect(camX - halfW - 50, camY - halfH - 50, halfW * 2 + 100, top - (camY - halfH - 50));
        if (bot < camY + halfH) ctx.fillRect(camX - halfW - 50, bot, halfW * 2 + 100, (camY + halfH + 50) - bot);
        ctx.fillStyle = '#3f2a0e';
        ctx.fillRect(camX - halfW - 50, top - 10, halfW * 2 + 100, 10);
        ctx.fillRect(camX - halfW - 50, bot, halfW * 2 + 100, 10);
      }

      // 电幕
      if (this.barrier) {
        const b = this.barrier;
        ctx.strokeStyle = 'rgba(120,220,255,' + (0.45 + 0.25 * Math.sin(this.time * 8)) + ')';
        ctx.lineWidth = 6;
        ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
      }

      // 经验球
      ctx.fillStyle = '#3ddc97';
      for (const o of this.orbs) { ctx.fillRect(o.x + ox - 4, o.y + oy - 4, 8, 8); }
      // 拾取物
      for (const o of this.pickups) {
        if (o.type === 'chest') { ctx.fillStyle = '#ffd166'; ctx.fillRect(o.x + ox - 14, o.y + oy - 11, 28, 22); ctx.fillStyle = '#8a6a12'; ctx.fillRect(o.x + ox - 14, o.y + oy - 2, 28, 5); }
        else if (o.type === 'tome') { ctx.fillStyle = '#c084fc'; ctx.fillRect(o.x + ox - 13, o.y + oy - 16, 26, 32); ctx.fillStyle = '#f5e6ff'; ctx.fillRect(o.x + ox - 3, o.y + oy - 16, 6, 32); }
      }
      // 召唤物
      for (const s of this.summons) {
        ctx.globalAlpha = 0.9;
        const c = { dragon_egg: '#e8d8a0', dragon: '#ff8844', ghost: '#c7d2ff', lens: '#7ff0ff', scythe: '#c084fc', spear: '#facc15', electro_bug: '#fff3a0', spore: '#7dd3a0', clone: '#b98cff', crow: '#5b6cff', deer: '#e07b3c' }[s.kind] || '#fff';
        ctx.fillStyle = c;
        if (s.kind === 'scythe' || s.kind === 'spear') { ctx.fillRect(s.x + ox - 9, s.y + oy - 9, 18, 18); }
        else if (s.kind === 'spore') { ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, 14, 0, 6.283); ctx.fill(); ctx.fillStyle = '#3b6b52'; ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, 6, 0, 6.283); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, s.kind === 'dragon' ? 18 : 11, 0, 6.283); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (s.kind === 'dragon_egg' && s.hatch) { ctx.fillStyle = '#fff'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(s.hatch) + 's', s.x + ox, s.y + oy - 16); }
      }

      // 敌人
      for (const e of this.enemies) {
        const x = e.x + ox, y = e.y + oy;
        if (e.x < camX - halfW - 80 || e.y < camY - halfH - 80 || e.x > camX + halfW + 80 || e.y > camY + halfH + 80) continue;
        ctx.save();
        ctx.translate(x, y);
        const wob = e.frozenT > 0 ? 1 : 1 + Math.sin(e.wob) * 0.06;
        ctx.scale(wob, wob);
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        const shape = e.shape;
        ctx.beginPath();
        if (shape === 'circle') ctx.arc(0, 0, e.r, 0, 6.283);
        else if (shape === 'square') ctx.rect(-e.r, -e.r, e.r * 2, e.r * 2);
        else if (shape === 'tri') { ctx.moveTo(0, -e.r); ctx.lineTo(e.r * 0.9, e.r * 0.8); ctx.lineTo(-e.r * 0.9, e.r * 0.8); ctx.closePath(); }
        else if (shape === 'diamond') { ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0); ctx.closePath(); }
        else { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
        ctx.fill();
        ctx.stroke();
        // 内核（区分类型、增加可读性）
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        if (shape === 'circle' || shape === 'hex') { ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, 6.283); ctx.fill(); }
        else if (shape === 'square') { ctx.fillRect(-e.r * 0.3, -e.r * 0.3, e.r * 0.6, e.r * 0.6); }
        else { ctx.beginPath(); ctx.arc(0, e.r * 0.1, e.r * 0.3, 0, 6.283); ctx.fill(); }
        // 状态标记
        if (e.burnT > 0) { ctx.fillStyle = 'rgba(255,120,40,0.75)'; ctx.beginPath(); ctx.arc(0, -e.r - 7, 4, 0, 6.283); ctx.fill(); }
        if (e.frozenT > 0) { ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, 6.283); ctx.stroke(); }
        if (e.curseT > 0) { ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, 6.283); ctx.stroke(); }
        if (e.markT > 0) { // 齐射飞刀：锁定标记
          ctx.fillStyle = '#ff7ab6';
          ctx.beginPath(); ctx.moveTo(0, -e.r - 12); ctx.lineTo(5, -e.r - 20); ctx.lineTo(-5, -e.r - 20); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        if (e.kind !== 'small') {
          ctx.fillStyle = 'rgba(255,60,60,0.9)';
          const w = e.r * 2.6, hp = clamp(e.hp / e.maxHp, 0, 1);
          ctx.fillRect(x - w / 2, y - e.r - 16, w, 5);
          ctx.fillStyle = '#ff5a5a';
          ctx.fillRect(x - w / 2, y - e.r - 16, w * hp, 5);
        }
      }

      // 子弹
      ctx.lineCap = 'round';
      for (const b of this.bullets) {
        ctx.strokeStyle = b.color || '#ffe066';
        ctx.lineWidth = Math.max(2, b.r * 0.85);
        ctx.beginPath();
        ctx.moveTo(b.x + ox - b.vx * 0.022, b.y + oy - b.vy * 0.022);
        ctx.lineTo(b.x + ox, b.y + oy);
        ctx.stroke();
        ctx.fillStyle = '#fffbe0';
        ctx.beginPath(); ctx.arc(b.x + ox, b.y + oy, Math.max(1.4, b.r * 0.5), 0, 6.283); ctx.fill();
      }
      for (const b of this.ebullets) {
        ctx.fillStyle = b.color || '#f472b6';
        ctx.beginPath(); ctx.arc(b.x + ox, b.y + oy, b.r, 0, 6.283); ctx.fill();
      }
      // 魔弓：插在敌人身上的箭
      ctx.strokeStyle = '#8fe6a8';
      ctx.lineWidth = 3;
      for (const s of this.stuck) {
        ctx.beginPath(); ctx.moveTo(s.x + ox - 7, s.y + oy - 7); ctx.lineTo(s.x + ox + 7, s.y + oy + 7); ctx.stroke();
      }
      // 文：枪之符文拓印
      for (const g of this.glyphs) {
        ctx.strokeStyle = 'rgba(192,132,252,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x + ox, g.y + oy, g.r, 0, 6.283); ctx.stroke();
        ctx.beginPath(); ctx.arc(g.x + ox, g.y + oy, g.r * 0.5, 0, 6.283); ctx.stroke();
      }

      // 玩家
      ctx.save();
      ctx.translate(P.x + ox, P.y + oy);
      if (P.inv > 0 && Math.floor(P.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
      const cr = P.r * this.stats.val('charSize');
      if (this.timers.deerOn > 0) { ctx.fillStyle = '#e07b3c'; ctx.fillRect(-cr * 1.6, -cr * 1.2, cr * 3.2, cr * 2.4); }
      else {
        ctx.fillStyle = P.hitFlash > 0 ? '#ff6b6b' : this.char.color;
        ctx.beginPath(); ctx.arc(0, 0, cr, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.rotate(P.aim);
        ctx.fillStyle = '#f2fbff';
        ctx.beginPath(); ctx.moveTo(cr * 1.35, 0); ctx.lineTo(cr * 0.5, -cr * 0.42); ctx.lineTo(cr * 0.5, cr * 0.42); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (P.shield) { ctx.strokeStyle = 'rgba(255,240,160,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, cr + 6, 0, 6.283); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 粒子
      for (const q of this.particles) {
        const a = q.t / q.max;
        ctx.globalAlpha = Math.max(0, a);
        ctx.strokeStyle = ctx.fillStyle = q.c;
        if (q.ring) { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x + ox, q.y + oy, q.r * (1.4 - a), 0, 6.283); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(q.x + ox, q.y + oy, q.r, 0, 6.283); ctx.fill(); }
      }
      ctx.globalAlpha = 1;

      // 伤害文字
      ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      for (const q of this.dmgTexts) { ctx.globalAlpha = Math.min(1, q.t * 2); ctx.fillStyle = q.c; ctx.fillText(q.txt, q.x + ox, q.y + oy); }
      ctx.globalAlpha = 1;

      // 视野暗角 + 天亮（游戏名里的「黎明」就在这里）
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 相机贴地图边界时玩家会偏离屏幕中心：把暗角中心夹在屏幕中部，避免半屏全黑
      const sx = clamp((P.x - camX) * z + vw / 2, vw * 0.32, vw * 0.68);
      const sy = clamp((P.y - camY) * z + vh / 2, vh * 0.32, vh * 0.68);
      const visionK = this.stats.val('visionRange') / 460;
      const vr = Math.max(420, vh * 1.02) * visionK;
      const stretch = 1.45; // 横向拉宽成椭圆，宽屏两侧不被压成黑边
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(stretch, 1);
      const vg = ctx.createRadialGradient(0, 0, vr * 0.42, 0, 0, vr * 1.0);
      vg.addColorStop(0, 'rgba(2,4,10,0)');
      vg.addColorStop(0.55, 'rgba(0,0,0,0.22)');
      vg.addColorStop(1, 'rgba(0,0,0,0.86)');
      ctx.fillStyle = vg;
      ctx.fillRect(-sx / stretch, -sy, vw / stretch, vh);
      ctx.restore();
      const dawn = clamp((this.time - (this.runLen - 200)) / 200, 0, 1);
      if (dawn > 0) {
        ctx.fillStyle = 'rgba(255,146,64,' + (0.16 * dawn).toFixed(3) + ')';
        ctx.fillRect(0, 0, vw, vh);
        const g2 = ctx.createLinearGradient(0, vh, 0, vh * 0.35);
        g2.addColorStop(0, 'rgba(255,170,90,' + (0.30 * dawn).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, vw, vh);
      }

      // HUD
      this.renderHud();
    }

    renderHud() {
      const ctx = this.ctx, vw = this.vw, vh = this.vh, P = this.player;
      ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
      // 时间
      const left = this.endless ? this.time : Math.max(0, this.runLen - this.time);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.fillStyle = left < 60 ? '#ff6b6b' : '#e8f6ee';
      ctx.fillText(String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), vw / 2, 42);
      ctx.font = '12px system-ui';
      ctx.fillStyle = 'rgba(220,240,230,0.6)';
      ctx.fillText('Lv.' + this.level + '  击杀 ' + this.kills + (this.dark ? '  黑暗 ' + this.dark : ''), vw / 2, 62);

      // XP 条
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, vh - 10, vw, 10);
      ctx.fillStyle = '#3ddc97'; ctx.fillRect(0, vh - 10, vw * clamp(this.xp / this.xpNeed, 0, 1), 10);

      // 生命（方块表示，每格 1 HP）
      ctx.textAlign = 'left';
      for (let i = 0; i < P.maxHp; i++) {
        ctx.fillStyle = i < P.hp ? '#4ade80' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(16 + i * 16, 22, 12, 12);
      }
      for (let i = 0; i < P.soulHearts; i++) {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath(); ctx.arc(22 + i * 16, 48, 6, 0, 6.283); ctx.fill();
      }
      // 弹药
      const mag = Math.round(this.stats.val('ammo'));
      const ax = vw - 18 - Math.min(mag, 30) * 7;
      ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(230,245,238,0.75)';
      ctx.fillText(this.weap.name + (P.reloading > 0 ? '  装填 ' + P.reloading.toFixed(1) + 's' : ''), vw - 18, 30);
      ctx.textAlign = 'left';
      for (let i = 0; i < Math.min(mag, 30); i++) {
        ctx.fillStyle = i < P.ammo ? '#ffd166' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(ax + i * 7, 38, 5, 12);
      }

      // 移动端摇杆
      if (Input.touchUsed) {
        for (const s of [Input.stickL, Input.stickR]) {
          if (!s.active) continue;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(s.ox, s.oy, 58, 0, 6.283); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(s.ox + s.x * 58, s.oy + s.y * 58, 24, 0, 6.283); ctx.fill();
        }
      }

      // 十字弩蓄力条
      if (this.weap.id === 'crossbow') {
        const cw = 120, cx = vw - 18 - cw, cy = 58;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx, cy, cw, 7);
        ctx.fillStyle = P.charge >= P.chargeMax ? '#ff7ab6' : '#ffd166';
        ctx.fillRect(cx, cy, cw * clamp(P.charge / P.chargeMax, 0, 1), 7);
        ctx.font = '10px system-ui'; ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(230,245,238,0.6)';
        ctx.fillText(P.charge < 0.02 ? '按住左键 / 右半屏蓄力' : '蓄力 ×' + (1 + 1.6 * clamp(P.charge / P.chargeMax, 0, 1)).toFixed(1), vw - 18, cy + 22);
      }
      // 主动技能冷却（希娜 / 阿比）
      if (this.char.mech === 'clone' || this.char.mech === 'dump') {
        const sx = 40, sy = vh - 56, sr = 20;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.283);
        ctx.fillStyle = P.skillCd > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(122,220,160,0.22)'; ctx.fill();
        ctx.strokeStyle = P.skillCd > 0 ? 'rgba(255,255,255,0.25)' : '#7adca0'; ctx.lineWidth = 2; ctx.stroke();
        if (P.skillCd > 0) {
          ctx.fillStyle = 'rgba(230,245,238,0.85)'; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.textAlign = 'center';
          ctx.fillText(P.skillCd.toFixed(1), sx, sy + 4);
        } else {
          ctx.fillStyle = '#7adca0'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
          ctx.fillText(this.char.mech === 'clone' ? '冲刺' : '倾泻', sx, sy + 4);
        }
      }
    }
  }

  root.DawnGame = Game;
  root.DawnInput = Input;
})(window);
