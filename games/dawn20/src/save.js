/* 局外存档：souls / 已解锁角色武器 / 符文（购买等级 + 装备）/ 最好成绩（localStorage） */
(function (root) {
  'use strict';
  const KEY = 'dawn20.save.v2';
  const DEFAULTS = () => ({
    souls: 0, chars: ['shana'], weaps: ['revolver'], runs: 0, best: 0, maps: ['forest'],
    muted: false,           // 音效开关（音频层程序化合成，无音频文件）
    runes: {},               // id -> 已购买等级
    equip: { sword: {}, shield: {} }, // type -> { row: runeId }
  });
  const SAVE = {
    data: DEFAULTS(),
    load() {
      try {
        const raw = localStorage.getItem(KEY) || localStorage.getItem('dawn20.save.v1');
        const d = raw ? JSON.parse(raw) : null;
        if (d && typeof d === 'object') this.data = Object.assign(DEFAULTS(), d);
      } catch (e) { }
      const d = this.data;
      d.runes = d.runes || {};
      d.equip = d.equip || { sword: {}, shield: {} };
      d.equip.sword = d.equip.sword || {}; d.equip.shield = d.equip.shield || {};
      if (!d.chars.includes('shana')) d.chars.push('shana');
      if (!d.weaps.includes('revolver')) d.weaps.push('revolver');
      return this.data;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { } },
    list(kind) {
      if (kind === 'char') return this.data.chars;
      if (kind === 'map') return this.data.maps || (this.data.maps = ['forest']);
      return this.data.weaps;
    },
    clearMap(id) { const m = this.list('map'); if (!m.includes(id)) { m.push(id); this.save(); } },
    has(kind, id) { return this.list(kind).includes(id); },
    unlock(kind, id, cost) {
      if (this.has(kind, id)) return true;
      if (this.data.souls < cost) return false;
      this.data.souls -= cost;
      this.list(kind).push(id);
      this.save();
      return true;
    },
    addSouls(n) { this.data.souls = Math.max(0, this.data.souls + n); this.save(); },
    finishRun(won, kills, time) {
      this.data.runs++;
      if (time > this.data.best) this.data.best = Math.floor(time);
      this.addSouls(kills + (won ? 500 : 0));
      this.save();
    },

    // ---------- 符文 ----------
    RUNES: () => (root.DAWN_DATA ? root.DAWN_DATA.RUNES : []),
    runeRank(id) { return this.data.runes[id] || 0; },
    // 本系累计购买的 rank 数（用于解锁行）
    runeTotal(type) {
      let n = 0;
      for (const id in this.data.runes) {
        const r = this.RUNES().find(x => x.id === id);
        if (r && r.type === type) n += this.data.runes[id];
      }
      return n;
    },
    rowUnlocked(type, row) { return row <= 1 || this.runeTotal(type) >= row; },
    canBuy(r) {
      if (!this.rowUnlocked(r.type, r.row)) return false;
      if (this.runeRank(r.id) >= r.max) return false;
      return this.data.souls >= r.cost;
    },
    buyRune(r) {
      if (!this.canBuy(r)) return false;
      this.data.souls -= r.cost;
      this.data.runes[r.id] = this.runeRank(r.id) + 1;
      this.save();
      return true;
    },
    isEquipped(r) { return this.data.equip[r.type][r.row] === r.id; },
    equipRune(r) {
      const slot = this.data.equip[r.type];
      if (slot[r.row] === r.id) { delete slot[r.row]; }
      else { if (this.runeRank(r.id) <= 0) return false; slot[r.row] = r.id; }
      this.save();
      return true;
    },
    // 本局生效的符文：id -> rank
    activeRunes() {
      const out = {};
      for (const type of ['sword', 'shield']) {
        const slot = this.data.equip[type] || {};
        for (const row in slot) {
          const id = slot[row], r = this.runeRank(id);
          if (id && r > 0) out[id] = r;
        }
      }
      return out;
    },
  };
  SAVE.load();
  root.DAWN_SAVE = SAVE;
})(window);
