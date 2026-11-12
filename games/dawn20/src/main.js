/* UI 层：菜单 / 升级卡片 / 秘典 / 结算 + 主循环 */
(function () {
  'use strict';
  const D = window.DAWN_DATA, UG = window.DAWN_UPGRADES, SAVE = window.DAWN_SAVE;
  const $ = id => document.getElementById(id);
  const canvas = $('game');

  const sel = { char: 'shana', weapon: 'revolver', map: 'forest', dark: 0, mode: 'standard' };

  window.DawnInput.init(canvas);

  // ---------- 音频（WebAudio 程序化合成，零音频文件）----------
  const AUD = window.DawnAudio;
  AUD.setMuted(!!SAVE.data.muted);
  function muteLabel() { const b = $('muteBtn'); if (b) b.textContent = AUD.muted ? '音效：关（按 M）' : '音效：开（按 M）'; }
  function toggleMute() {
    const m = AUD.toggle();
    SAVE.data.muted = m; SAVE.save(); muteLabel();
    toast(m ? '音效已关闭（按 M 或菜单按钮恢复）' : '音效已开启');
  }
  $('muteBtn').onclick = ev => { if (ev) ev.stopPropagation(); AUD.init(); toggleMute(); };
  muteLabel();
  // 浏览器策略：AudioContext 必须在用户手势里创建/恢复
  addEventListener('pointerdown', () => AUD.init(), { passive: true });
  addEventListener('keydown', () => AUD.init());

  const game = new window.DawnGame(canvas, {
    onStart() { AUD.init(); AUD.musicStart(); },
    onShot(g) {
      const fr = g && g.weap ? g.weap.fireRate : 3;
      AUD.sfx('shot', { pitch: Math.min(1.5, Math.max(0.75, 0.75 + fr * 0.03)) });
    },
    onKill() { AUD.sfx('kill'); },
    onBoss() { AUD.sfx('boss'); },
    onPickup(g, kind) { AUD.sfx(kind === 'chest' ? 'chest' : kind === 'tome' ? 'tome' : kind === 'heal' ? 'heal' : 'xp'); },
    onLevelUp(g) { showCards(g); AUD.sfx('levelup'); },
    onEvo(g) { showCards(g); AUD.sfx('chest'); },
    onLevelUpEnd() { hide('levelup'); },
    onTome(g) { showTomes(g); AUD.sfx('tome'); },
    onCharUp(g) { showCharUp(g); AUD.sfx('chest'); },
    onHurt() { AUD.sfx('hurt'); },
    onEnd(g, won) { AUD.musicStop(); AUD.sfx(won ? 'win' : 'lose'); showEnd(g, won); },
  });
  window.__game = game;

  // ---------- 菜单 ----------
  function buildMenu() {
    const cw = $('chars'); cw.innerHTML = '';
    for (const c of D.CHARACTERS) {
      const owned = SAVE.has('char', c.id);
      const el = document.createElement('button');
      el.className = 'pick' + (c.id === sel.char ? ' sel' : '') + (owned ? '' : ' locked');
      el.innerHTML = `<span class="dot" style="background:${c.color}"></span>
        <span>${c.name}<br><small>${owned ? c.hp + ' 生命 · ' + c.perk : '🔒 ' + c.cost + ' souls'}</small></span>`;
      el.onclick = () => {
        if (!owned) {
          if (SAVE.unlock('char', c.id, c.cost)) { sel.char = c.id; toast('已解锁 ' + c.name); }
          else toast('souls 不够：还差 ' + (c.cost - SAVE.data.souls));
        } else sel.char = c.id;
        buildMenu();
      };
      cw.appendChild(el);
    }
    const ww = $('weaps'); ww.innerHTML = '';
    for (const w of D.WEAPONS) {
      const owned = SAVE.has('weap', w.id);
      const el = document.createElement('button');
      el.className = 'pick' + (w.id === sel.weapon ? ' sel' : '') + (owned ? '' : ' locked');
      el.innerHTML = `<span>${w.name}<br><small>${owned ? w.dmg + ' 伤 · ' + w.fireRate + '/秒 · 弹匣 ' + w.ammo + ' · 装填 ' + w.reload + 's' : '🔒 ' + w.cost + ' souls'}</small></span>`;
      el.onclick = () => {
        if (!owned) {
          if (SAVE.unlock('weap', w.id, w.cost)) { sel.weapon = w.id; toast('已解锁 ' + w.name); }
          else toast('souls 不够：还差 ' + (w.cost - SAVE.data.souls));
        } else sel.weapon = w.id;
        buildMenu();
      };
      ww.appendChild(el);
    }
    const mw2 = $('maps');
    if (mw2) {
      mw2.innerHTML = '';
      for (const mp of D.MAPS) {
        const unlocked = SAVE.has('map', mp.id);
        const el = document.createElement('button');
        el.className = 'pick' + (mp.id === sel.map ? ' sel' : '') + (unlocked ? '' : ' locked');
        el.innerHTML = `<span>${mp.name}<br><small>${unlocked ? mp.desc : '清森林（标准）后解锁'}</small></span>`;
        el.onclick = () => {
          if (!unlocked) { toast('先通关森林（标准模式）才能选这张图'); return; }
          sel.map = mp.id; buildMenu();
        };
        mw2.appendChild(el);
      }
    }
    const dw = $('darks'); dw.innerHTML = '';
    for (let i = 0; i <= 15; i++) {
      const el = document.createElement('button');
      el.className = 'pick' + (i === sel.dark ? ' sel' : '');
      el.style.minWidth = '46px';
      el.textContent = String(i);
      el.title = D.DARKNESS[i];
      el.onclick = () => { sel.dark = i; buildMenu(); };
      dw.appendChild(el);
    }
    const mw = $('modes'); mw.innerHTML = '';
    for (const [id, label] of [['standard', '标准 20 分钟'], ['quick', '快速 10 分钟'], ['endless', '无尽（无黎明·可叠加 3 层）']]) {
      const el = document.createElement('button');
      el.className = 'pick' + (id === sel.mode ? ' sel' : '');
      el.textContent = label;
      el.onclick = () => { sel.mode = id; buildMenu(); };
      mw.appendChild(el);
    }
    $('menuHint').textContent = '黑暗 ' + sel.dark + '：' + D.DARKNESS[sel.dark];
    if ($('souls')) $('souls').textContent = '◈ ' + SAVE.data.souls + ' souls' + (SAVE.data.runs ? ' · 已通关次 ' + SAVE.data.runs : '');
  }

  let toastT = 0;
  function toast(msg) {
    const el = $('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------- 暂停面板：本局 build 总览 ----------
  function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    const g = game;
    $('pauseSub').textContent = `${g.char.name} · ${g.weap.name} · ${g.map.name} · ${fmt(g.time)} · Lv.${g.level} · ${g.kills} 击杀`;
    const box = $('pauseList'); box.innerHTML = '';
    const rows = [];
    for (const id of g.taken) {
      const u = UG.UPGRADES.find(x => x.id === id) || UG.SYNERGIES.find(x => x.id === id) ||
        UG.TOMES.find(x => x.id === id) || (window.DAWN_EVOLUTIONS || []).find(x => x.id === id);
      const c = (g.counts && g.counts[id]) || 1;
      rows.push([u ? u.name : id, c > 1 ? '×' + c : (id === 'halo_grant' ? '光环' : '')]);
    }
    for (const e of [...g.evo]) { rows.push(['进化 · ' + e, '']); }
    if (!rows.length) rows.push(['还没有任何升级', '']);
    for (const [n, c] of rows) { const d = document.createElement('div'); d.innerHTML = `<b>${n}</b><span>${c}</span>`; box.appendChild(d); }
    $('pauseBtn').classList.remove('on');
    show('pause');
  }
  function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    hide('pause');
    $('pauseBtn').classList.add('on');
  }
  $('pauseBtn').onclick = () => (game.state === 'playing' ? pauseGame() : resumeGame());
  $('resumeBtn').onclick = resumeGame;
  $('quitBtn').onclick = () => { hide('pause'); $('pauseBtn').classList.remove('on'); game.state = 'menu'; show('menu'); buildMenu(); };
  function show(id) { $(id).classList.add('show'); }
  function hide(id) { $(id).classList.remove('show'); }

  $('startBtn').onclick = () => {
    hide('menu'); hide('end'); hide('levelup'); hide('tome');
    game.choices = []; game.pendingLevels = 0;
    game.start({ charId: sel.char, weaponId: sel.weapon, mapId: sel.map, darkness: sel.dark, mode: sel.mode });
  };
  $('againBtn').onclick = () => $('startBtn').click();
  $('menuBtn').onclick = () => { hide('end'); show('menu'); buildMenu(); };

  // ---------- 升级卡 ----------
  function card(u, idx, onPick, tome) {
    const el = document.createElement('button');
    el.className = 'card' + (u.isSyn ? ' syn' : '') + (tome ? ' tome' : '') + (u.weap ? ' evo' : '');
    const isEvo = !!u.weap;
    const treeLine = isEvo ? '武器进化' : (u.group === '角色专属' ? '角色专属升级' : (u.isSyn ? '协同 · 前置已满足' : (tome ? '秘典' : (u.group + ' · ' + u.treeName + ' · T' + u.tier))));
    el.innerHTML = `<div class="tree">${treeLine}</div>
      <div class="name">${u.name}</div>
      <div class="desc">${u.desc}</div>
      <div class="key">按 ${idx + 1}</div>`;
    el.onclick = () => onPick(idx);
    return el;
  }

  function showCards(g) {
    const box = $('cards'); box.innerHTML = '';
    $('luTitle').textContent = g.state === 'evo' ? '武器进化 · ' + g.weap.name : ('等级 ' + g.level + (g.pendingLevels > 1 ? '  ·  待选 ' + g.pendingLevels : ''));
    $('luSub').textContent = '击杀 ' + g.kills + ' · 已过 ' + fmt(g.time) + ' · 选 1 项（数字键 / 点击）';
    const list = g.state === 'evo' ? g.evoChoices : g.choices;
    list.forEach((u, i) => box.appendChild(card(u, i, idx => pickCard(idx))));
    const rb = $('reroll');
    if (g.char.mech === 'reroll' && !g.rerolled) { rb.style.display = 'block'; rb.disabled = false; }
    else rb.style.display = 'none';
    show('levelup');
  }
  function pickCard(i) {
    if (game.state === 'evo') {
      game.chooseEvo(i);
      if (game.state === 'levelup' || game.state === 'evo') showCards(game); else hide('levelup');
      return;
    }
    if (game.state !== 'levelup') return;
    game.choose(i);
    if (game.state === 'levelup' || game.state === 'evo') showCards(game); else hide('levelup');
  }
  $('reroll').onclick = () => { if (game.reroll()) showCards(game); };

  function showTomes(g) {
    const box = $('tomeCards'); box.innerHTML = '';
    g.tomeChoices.forEach((t, i) => {
      const el = document.createElement('button');
      el.className = 'card tome';
      el.innerHTML = `<div class="tree">Boss 掉落</div><div class="name">${t.name}</div>
        <div class="desc">${t.desc}</div><div class="key">按 ${i + 1}</div>`;
      el.onclick = () => { game.chooseTome(i); hide('tome'); };
      box.appendChild(el);
    });
    show('tome');
  }

  function fmt(s) {
    s = Math.max(0, s | 0);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- 角色专属升级（精英宝箱三选一） ----------
  function showCharUp(g) {
    const box = $('cards'); box.innerHTML = '';
    $('luTitle').textContent = '宝箱 · ' + g.char.name + ' 专属升级';
    $('luSub').textContent = '击杀 ' + g.kills + ' · 已过 ' + fmt(g.time) + ' · 选 1 项';
    g.charChoices.forEach((u, i) => box.appendChild(card(u, i, idx => { game.chooseCharUp(idx); hide('levelup'); })));
    $('reroll').style.display = 'none';
    show('levelup');
  }

  // ---------- 符文面板 ----------
  function buildRunes() {
    const box = $('runeRows'); box.innerHTML = '';
    $('runeSub').textContent = '剑系 ' + SAVE.runeTotal('sword') + ' 级 · 盾系 ' + SAVE.runeTotal('shield') +
      ' 级 · ◈ ' + SAVE.data.souls + ' souls · 每行同时只能装备 1 条';
    for (const ty of ['sword', 'shield']) {
      const hd = document.createElement('div');
      hd.className = 'runeGroup';
      hd.textContent = ty === 'sword' ? '剑系 · 输出' : '盾系 · 防御';
      box.appendChild(hd);
      for (const row of D.RUNE_ROWS) {
        const line = document.createElement('div'); line.className = 'runeRow';
        const unlocked = SAVE.rowUnlocked(ty, row);
        for (const r of D.RUNES.filter(x => x.type === ty && x.row === row)) {
          const rank = SAVE.runeRank(r.id);
          const on = SAVE.isEquipped(r);
          const el = document.createElement('div');
          el.className = 'rune' + (on ? ' on' : '') + (unlocked ? '' : ' lock');
          el.innerHTML = `<b>${r.name}${row > 1 ? ' <small style="display:inline">(' + row + '+)</small>' : ''}<span class="tag">${rank}/${r.max}</span></b><small>${r.desc}</small>`;
          const acts = document.createElement('div');
          acts.style.cssText = 'display:flex;gap:6px;margin-top:7px';
          const base = 'flex:1;font-size:11px;padding:4px;border-radius:6px;border:1px solid #2c4437;background:#0e1913;color:#e8f5ee;cursor:pointer';
          const bUp = document.createElement('button');
          bUp.style.cssText = base;
          bUp.textContent = rank >= r.max ? '已满级' : (unlocked ? '升级 ◈' + r.cost : '需本系 ' + row + ' 级');
          bUp.onclick = ev => {
            ev.stopPropagation();
            if (!unlocked) { toast('本系累计买满 ' + row + ' 级才解锁这一行'); return; }
            if (rank >= r.max) return;
            if (SAVE.buyRune(r)) { buildRunes(); buildMenu(); toast(r.name + ' → ' + SAVE.runeRank(r.id) + ' 级'); }
            else toast('souls 不够：需要 ◈' + r.cost);
          };
          const bEq = document.createElement('button');
          bEq.style.cssText = base;
          bEq.textContent = on ? '卸下' : '装备';
          bEq.onclick = ev => {
            ev.stopPropagation();
            if (rank <= 0) { toast('先买 1 级才能装备'); return; }
            SAVE.equipRune(r); buildRunes(); toast(on ? '卸下 ' + r.name : '装备 ' + r.name);
          };
          acts.appendChild(bUp); acts.appendChild(bEq);
          el.appendChild(acts);
          line.appendChild(el);
        }
        box.appendChild(line);
      }
    }
  }
  $('runesBtn').onclick = () => { buildRunes(); show('runes'); };
  $('runesClose').onclick = () => { hide('runes'); buildMenu(); };

  // ---------- 结算 ----------
  function showEnd(g, won) {
    $('pauseBtn').classList.remove('on');
    if (!g._saved) {
      g._saved = true;
      SAVE.finishRun(won, g.kills, won ? g.runLen : g.time);
      if (won && g.map && g.map.id === 'forest' && g.mode === 'standard') {
        const before = (SAVE.list('map') || []).length;
        SAVE.clearMap('temple'); SAVE.clearMap('pumpkin');
        if ((SAVE.list('map') || []).length > before) setTimeout(() => toast('新地图解锁：神庙 / 南瓜地'), 300);
      }
      buildMenu();
    }
    $('endTitle').textContent = won ? '黎明已至' : '黎明未至';
    $('endTitle').style.color = won ? 'var(--accent)' : 'var(--warn)';
    $('endSub').textContent = won ? '你活过了整整 20 分钟。' : '你在黑暗中倒下了。';
    $('endStats').innerHTML = `
      <div class="stat"><b>${fmt(won ? g.runLen : g.time)}</b><span>存活</span></div>
      <div class="stat"><b>${g.kills}</b><span>击杀</span></div>
      <div class="stat"><b>${g.level}</b><span>等级</span></div>
      <div class="stat"><b>${g.char.name}</b><span>角色</span></div>
      <div class="stat"><b>${g.weap.name}</b><span>武器</span></div>
      <div class="stat"><b>+${g.kills + (won ? 500 : 0)}</b><span>souls</span></div>`;
    const names = [...g.taken].map(id => {
      const u = UG.UPGRADES.find(x => x.id === id) || UG.SYNERGIES.find(x => x.id === id) || UG.TOMES.find(x => x.id === id) || (UG.CHAR_UPGRADES || []).find(x => x.id === id);
      return u ? u.name : id;
    });
    $('endTaken').textContent = names.length ? '本局升级：' + names.join(' / ') : '';
    show('end');
  }

  // ---------- 键盘：1-5 选卡 / Esc 回菜单 ----------
  addEventListener('keydown', e => {
    if (e.key && e.key.toLowerCase() === 'm') { toggleMute(); return; }
    if ((game.state === 'levelup' || game.state === 'evo') && /^[1-5]$/.test(e.key)) { pickCard(+e.key - 1); return; }
    if (game.state === 'tome' && /^[1-3]$/.test(e.key)) { game.chooseTome(+e.key - 1); hide('tome'); return; }
    if (game.state === 'charup' && /^[1-3]$/.test(e.key)) { game.chooseCharUp(+e.key - 1); hide('levelup'); return; }
    if (e.key === 'Escape') {
      if (game.state === 'playing') pauseGame();
      else if (game.state === 'paused') resumeGame();
      else if (game.state === 'levelup' || game.state === 'evo' || game.state === 'tome') {
        // 升级/秘典界面不能暂停，忽略
      }
    }
    if (game.state === 'levelup' && e.key.toLowerCase() === 'r') { if (game.reroll()) showCards(game); }
  });

  // ---------- 主动技能：PC 右键 / 手机左下圆形按钮 ----------
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { e.preventDefault(); game.skill(); }
  });
  canvas.addEventListener('touchstart', e => {
    if (!game.player || game.state !== 'playing') return;
    const r = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const x = t.clientX - r.left, y = t.clientY - r.top;
      if (Math.hypot(x - 40, y - (game.vh - 56)) < 36) { game.skill(); e.preventDefault(); e.stopPropagation(); return; }
    }
  }, true);

  // ---------- 主循环 ----------
  const qs = new URLSearchParams(location.search);
  const AUTO = qs.has('auto');
  const AUTO_MANUAL = qs.has('manual');
  let SPEED = Math.max(1, +(qs.get('speed') || 1));
  // ?boostms=N：先加速 N 毫秒（冲时间线），之后回到 1 倍速并重置性能计数
  if (qs.has('boostms')) setTimeout(() => { SPEED = 1; window.__perf = { n: 0, sum: 0, max: 0 }; }, +qs.get('boostms'));
  window.__autoLog = [];

  // ?auto=1 自动开局 + 自动选卡（自检用，不影响正常游玩）
  if (AUTO) {
    if (qs.get('c')) { sel.char = qs.get('c'); if (!SAVE.has('char', sel.char)) SAVE.data.chars.push(sel.char); }
    if (qs.get('w')) { sel.weapon = qs.get('w'); if (!SAVE.has('weap', sel.weapon)) SAVE.data.weaps.push(sel.weapon); }
    if (qs.get('dark')) sel.dark = +qs.get('dark');
    if (qs.get('map')) { sel.map = qs.get('map'); if (!SAVE.has('map', sel.map)) SAVE.data.maps.push(sel.map); }
    if (qs.get('mode')) sel.mode = qs.get('mode');
    setTimeout(() => {
      $('startBtn').click();
      game.autoAim = true;
      if (qs.has('god')) game.god = true;
      if (!AUTO_MANUAL) autoPilot();
    }, 60);
  }
  function autoPilot() {
    if (game.state === 'evo') { pickCard((Math.random() * game.evoChoices.length) | 0); setTimeout(autoPilot, 8); return; }
    if (game.state === 'levelup') { pickCard((Math.random() * game.choices.length) | 0); setTimeout(autoPilot, 8); return; }
    if (game.state === 'tome') { game.chooseTome((Math.random() * game.tomeChoices.length) | 0); hide('tome'); setTimeout(autoPilot, 8); return; }
    if (game.state === 'charup') { game.chooseCharUp((Math.random() * game.charChoices.length) | 0); hide('levelup'); setTimeout(autoPilot, 8); return; }
    if (game.state === 'playing') { autoSteer(); setTimeout(autoPilot, 120); return; }
    window.__autoLog.push({ state: game.state, time: game.time, level: game.level, kills: game.kills });
  }
  // 自检用的简单走位：捡最近的经验球，同时躲开近距离敌人
  function autoSteer() {
    if (!game.player) return;
    const p = game.player;
    let nx = 0, ny = 0;
    // 1) 危险回避
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < 150 * 150 && d2 > 1) { const d = Math.sqrt(d2); nx += dx / d * 2.5; ny += dy / d * 2.5; }
    }
    // 2) 找最近的球/宝箱
    let best = null, bd = 700 * 700;
    for (const o of game.orbs.concat(game.pickups)) {
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d2 < bd) { bd = d2; best = o; }
    }
    if (best) { const d = Math.sqrt(bd) || 1; nx += (best.x - p.x) / d; ny += (best.y - p.y) / d; }
    const K = window.DawnInput.keys;
    K['w'] = ny < -0.25; K['s'] = ny > 0.25; K['a'] = nx < -0.25; K['d'] = nx > 0.25;
  }


  let last = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    let dt = (t - last) / 1000; last = t;
    if (dt > 0.1) dt = 0.1;
    const tU0 = performance.now();
    if (game.state === 'playing') {
      if (SPEED > 1) {
        let rem = dt * SPEED;
        let guard = 0;
        while (rem > 0.0001 && game.state === 'playing' && guard++ < 4000) {
          const st = Math.min(0.033, rem);
          game.update(st);
          rem -= st;
        }
      } else game.update(dt);
    }
    const tU1 = performance.now();
    if (game.state === 'playing' && game.runLen) AUD.setIntensity(Math.min(1, game.time / game.runLen));
    if (game.player) game.render();
    const tU2 = performance.now();
    if (window.__perf) { window.__perf.upd = (window.__perf.upd || 0) + (tU1 - tU0); window.__perf.drw = (window.__perf.drw || 0) + (tU2 - tU1); }
    if (AUTO) {
      const pf = (window.__perf = window.__perf || { n: 0, sum: 0, max: 0 });
      pf.n++; pf.sum += dt; if (dt > pf.max) pf.max = dt;
      try {
        document.title = 'dawn|' + game.state + '|t=' + game.time.toFixed(1) + '|lv=' + game.level +
          '|kill=' + game.kills + '|en=' + (game.enemies ? game.enemies.length : 0) + '|hp=' + (game.player ? game.player.hp : '-') +
          '|taken=' + (game.taken ? game.taken.size : 0) + '|err=' + (window.__err ? window.__err.length : 0);
      } catch (e) { }
    }
  }
  addEventListener('resize', () => game.resize());
  addEventListener('error', e => { window.__err = (window.__err || []).concat([String(e.message) + ' @' + e.filename + ':' + e.lineno]); });
  buildMenu();
  requestAnimationFrame(frame);

})();
