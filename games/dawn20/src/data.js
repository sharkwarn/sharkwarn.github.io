/* 黎明前二十分钟 · 数值层
 * 数据来源：20minutestilldawn.wiki.gg（本地快照 ../game-teardown/20min-till-dawn/sources/wiki-raw）
 * 版本口径 v1.0.x。凡 wiki 无标注的值标 "推算"。
 * 素材一律程序化形状（圆/方/多边形 + 纯色），无任何外部美术资源。
 */
(function (root) {
  'use strict';

  // ---------- 武器（wiki Weapons 表，11 把） ----------
  // fireRate = 每秒发数；reload = 秒；proj = 单发弹数
  const WEAPONS = [
    { id: 'revolver',  name: '左轮',     dmg: 20, fireRate: 4,   proj: 1, ammo: 6,  reload: 1.0, cost: 0,    desc: '可靠而均衡的起手武器。' },
    { id: 'shotgun',   name: '霰弹枪',   dmg: 10, fireRate: 5,   proj: 4, ammo: 2,  reload: 1.0, cost: 1350, desc: '短距离、一次打出一片弹丸。' },
    { id: 'dual_smg',  name: '双持冲锋枪', dmg: 8, fireRate: 4,  proj: 1, ammo: 24, reload: 2.0, cost: 3150, desc: '两把快枪；升级分别作用于两把枪，射击特效触发两次。' },
    { id: 'crossbow',  name: '十字弩',   dmg: 20, fireRate: 6.7, proj: 1, ammo: 1,  reload: 1.0, cost: 3150, desc: '按住蓄力，伤害与穿透随蓄力提升。' },
    { id: 'flame',     name: '火焰喷射器', dmg: 3, fireRate: 6.7, proj: 1, ammo: 12, reload: 1.6, cost: 3150, desc: '子弹点燃敌人，每秒 3 点伤害。' },
    { id: 'grenade',   name: '榴弹发射器', dmg: 60, fireRate: 2.9, proj: 1, ammo: 6, reload: 1.5, cost: 3150, desc: '发射爆炸榴弹；爆炸也会伤到自己。' },
    { id: 'magic_bow', name: '魔弓',     dmg: 16, fireRate: 3.3, proj: 1, ammo: 4,  reload: 1.2, cost: 3150, desc: '箭矢滞留地面，装填时回到你身上并穿透沿途敌人。' },
    { id: 'batgun',    name: '蝠枪',     dmg: 18, fireRate: 2,   proj: 1, ammo: 12, reload: 1.5, cost: 3150, desc: '射出蝙蝠追猎敌人；蝙蝠既是子弹也是召唤物。' },
    { id: 'watering',  name: '浇水枪',   dmg: 18, fireRate: 5,   proj: 1, ammo: 10, reload: 0.8, cost: 3150, desc: '召唤孢子花，射它 5 次后向周围喷射 7 枚孢子。' },
    { id: 'salvo',     name: '齐射飞刀', dmg: 20, fireRate: 1.7, proj: 1, ammo: 12, reload: 0.6, cost: 3150, desc: '移动时标记敌人，开火同时射向每个被标记的敌人。' },
  ];

  // ---------- 角色（wiki Characters 表，13 个） ----------
  const CHARACTERS = [
    { id: 'shana',   name: '莎娜',   hp: 4, cost: 0,    perk: '每级可重摇一次升级', mech: 'reroll',  color: '#4aa3ff' },
    { id: 'diamond', name: '黛梦',   hp: 7, cost: 1350, perk: '起始生命最高',       mech: 'none',    color: '#7ee0ff' },
    { id: 'scarlett',name: '斯嘉丽', hp: 3, cost: 3150, perk: '每第 3 发甩出火浪，点燃敌人', mech: 'firewave', color: '#ff6b5a' },
    { id: 'hina',    name: '希娜',   hp: 3, cost: 3150, perk: '右键召唤影分身攻击附近敌人', mech: 'clone',   color: '#b98cff' },
    { id: 'spark',   name: '斯帕克', hp: 3, cost: 3150, perk: '子弹命中 50% 概率落雷 5 伤害', mech: 'lightning', color: '#ffe066' },
    { id: 'lilith',  name: '莉莉丝', hp: 4, cost: 3150, perk: '杀敌召唤幽灵追猎，8 伤害', mech: 'spirit',  color: '#c765f0' },
    { id: 'abby',    name: '阿比',   hp: 4, cost: 3150, perk: '右键把剩余弹药随机倾泻一空', mech: 'dump',    color: '#ff9f43' },
    { id: 'yuki',    name: '小雪',   hp: 3, cost: 3150, perk: '每第 6 发飞出霜蝶，周期性冻结', mech: 'frost',   color: '#8ff0e0' },
    { id: 'luna',    name: '露娜',   hp: 4, cost: 3150, perk: '装填时生成黑洞把敌人拉近', mech: 'blackhole', color: '#9d7bff' },
    { id: 'dasher',  name: '达舍',   hp: 2, cost: 3150, perk: '每 10 秒变鹿 2 秒，无敌且撞死敌人', mech: 'deer',    color: '#e07b3c' },
    { id: 'hastur',  name: '哈斯塔', hp: 4, cost: 9999, perk: '周期性召唤触手造成 30 伤害', mech: 'tentacle', color: '#57d17a' },
    { id: 'raven',   name: '瑞文',   hp: 3, cost: 9999, perk: '召唤乌鸦施加诅咒',   mech: 'crow',    color: '#5b6cff' },
    { id: 'katana',  name: '卡塔娜', hp: 4, cost: 3150, perk: '装填后召唤持续 5 秒的魔剑', mech: 'sword', color: '#ff4f8b' },
  ];

  // ---------- 敌人（wiki 小怪 / 精英 / Boss） ----------
  // shape: circle|square|tri|diamond|hex；speed px/s（推算，wiki 无移速表）；dmg = 接触伤害（HP 单位）
  const ENEMIES = {
    tentacle:  { name: '触手怪',   shape: 'circle',  r: 15, speed: 58,  dmg: 1, color: '#8b5cf6', kind: 'small' },
    sploder:   { name: '自爆虫',   shape: 'square',  r: 14, speed: 74,  dmg: 1, color: '#f97316', kind: 'small', explode: 26 },
    lurker:    { name: '潜伏者',   shape: 'diamond', r: 17, speed: 92,  dmg: 1, color: '#ef4444', kind: 'small' },
    lamprey:   { name: '七鳃鳗',   shape: 'tri',     r: 12, speed: 108, dmg: 1, color: '#a3e635', kind: 'small' },
    spawnling: { name: '卵生体',   shape: 'circle',  r: 10, speed: 96,  dmg: 1, color: '#f472b6', kind: 'small' },
    elder:     { name: '长老',     shape: 'hex',     r: 30, speed: 42,  dmg: 2, color: '#7f1d1d', kind: 'elite' },
    spawner:   { name: '产卵者',   shape: 'hex',     r: 44, speed: 18,  dmg: 2, color: '#4c1d95', kind: 'elite', spawns: 'spawnling' },
    winged:    { name: '翼怖',     shape: 'tri',     r: 38, speed: 96,  dmg: 2, color: '#be123c', kind: 'elite' },
    shub:      { name: '莎布·尼古拉丝', shape: 'circle', r: 52, speed: 46, dmg: 2, color: '#5b21b6', kind: 'boss', shots: { n: 8, cd: 2.2, dmg: 1, speed: 150 } },
    mystree:   { name: '神秘树',  shape: 'circle',  r: 40, speed: 0,   dmg: 1, color: '#3f6212', kind: 'tree' },
    shoggoth:  { name: '修格斯',   shape: 'hex',     r: 62, speed: 38,  dmg: 2, color: '#312e81', kind: 'boss', shots: { n: 12, cd: 1.8, dmg: 1, speed: 170 } },
    // 神庙 / 南瓜地新增（wiki Enemies：有 HP 无移速，移速按同类推算）
    squid:      { name: '乌贼怪',   shape: 'circle',  r: 14, speed: 62,  dmg: 1, color: '#38bdf8', kind: 'small' },
    bigsploder: { name: '大自爆虫', shape: 'square',  r: 26, speed: 40,  dmg: 2, color: '#ea580c', kind: 'small', explode: 62 },
    cultist:    { name: '邪教徒',   shape: 'hex',     r: 20, speed: 66,  dmg: 2, color: '#7c3aed', kind: 'small', shoots: { n: 1, cd: 2.6, dmg: 1, speed: 190 } },
    pumpkin:    { name: '南瓜怪',   shape: 'circle',  r: 16, speed: 56,  dmg: 1, color: '#f59e0b', kind: 'small' },
    ghost:      { name: '幽灵',     shape: 'circle',  r: 15, speed: 84,  dmg: 1, color: '#e9d5ff', kind: 'small', ghostly: true },
    eyebat:     { name: '眼球蝠',   shape: 'tri',     r: 13, speed: 104, dmg: 1, color: '#fbcfe8', kind: 'small' },
    witch:      { name: '女巫',     shape: 'hex',     r: 21, speed: 58,  dmg: 2, color: '#a21caf', kind: 'small', shoots: { n: 3, cd: 3.0, dmg: 1, speed: 170 } },
    yog:           { name: '约格',     shape: 'hex',   r: 60, speed: 34, dmg: 2, color: '#0f766e', kind: 'boss', shots: { n: 10, cd: 2.0, dmg: 1, speed: 160 } },
    hastur_boss:   { name: '哈斯塔',   shape: 'circle', r: 54, speed: 42, dmg: 2, color: '#65a30d', kind: 'boss', shots: { n: 6, cd: 1.6, dmg: 1, speed: 200 } },
    reaper:        { name: '收割者',   shape: 'diamond', r: 58, speed: 52, dmg: 3, color: '#e11d48', kind: 'boss', shots: { n: 14, cd: 1.5, dmg: 1, speed: 190 } },
  };

  // ---------- Forest 地图刷怪表（wiki Forest / Standard Mode，原表）----------
  // start/end 为「已过秒数」；single = 只在 start 时刻刷一次（精英/Boss）
  const FOREST_SPAWNS = [
    { e: 'tentacle', start: 0,     end: 60,    hp: 24,  max: 20,  n: 4,  cd: 3 },
    { e: 'tentacle', start: 60,    end: 120,   hp: 24,  max: 50,  n: 10, cd: 4 },
    { e: 'sploder',  start: 60,    end: 120,   hp: 30,  max: 2,   n: 1,  cd: 4 },
    { e: 'tentacle', start: 120,   end: 360,   hp: 30,  max: 200, n: 7,  cd: 2 },
    { e: 'sploder',  start: 120,   end: 360,   hp: 30,  max: 10,  n: 2,  cd: 5 },
    { e: 'elder',    start: 180,   end: 185,   hp: 1000,max: 1,   n: 1,  cd: 10, single: true },
    { e: 'shub',     start: 300,   end: 300,   hp: 2500,max: 1,   n: 1,  cd: 0,  single: true },
    { e: 'tentacle', start: 360,   end: 480,   hp: 60,  max: 400, n: 12, cd: 2 },
    { e: 'lurker',   start: 360,   end: 480,   hp: 400, max: 2,   n: 2,  cd: 10 },
    { e: 'sploder',  start: 420,   end: 540,   hp: 60,  max: 1,   n: 1,  cd: 1 },
    { e: 'tentacle', start: 480,   end: 600,   hp: 80,  max: 600, n: 16, cd: 1 },
    { e: 'lamprey',  start: 605,   end: 660,   hp: 200, max: 30,  n: 3,  cd: 1 },
    { e: 'lurker',   start: 660,   end: 780,   hp: 200, max: 12,  n: 2,  cd: 1 },
    { e: 'lamprey',  start: 660,   end: 780,   hp: 250, max: 100, n: 5,  cd: 1 },
    { e: 'sploder',  start: 660,   end: 780,   hp: 240, max: 4,   n: 2,  cd: 1 },
    { e: 'spawner',  start: 680,   end: 685,   hp: 10000,max: 1,  n: 1,  cd: 10, single: true },
    { e: 'lamprey',  start: 780,   end: 895,   hp: 400, max: 300, n: 14, cd: 1 },
    { e: 'lurker',   start: 900,   end: 960,   hp: 300, max: 16,  n: 2,  cd: 1 },
    { e: 'sploder',  start: 900,   end: 960,   hp: 400, max: 20,  n: 2,  cd: 1 },
    { e: 'shoggoth', start: 900,   end: 900,   hp: 35000,max: 1,  n: 1,  cd: 0,  single: true },
    { e: 'winged',   start: 960,   end: 965,   hp: 18000,max: 1,  n: 1,  cd: 10, single: true },
    { e: 'tentacle', start: 960,   end: 1080,  hp: 250, max: 600, n: 26, cd: 1 },
    { e: 'lamprey',  start: 1080,  end: 1199,  hp: 500, max: 300, n: 20, cd: 1 },
    { e: 'lurker',   start: 1080,  end: 1199,  hp: 500, max: 10,  n: 1,  cd: 1 },
  ];

  const TEMPLE_SPAWNS = [
    { e: 'squid', start: 0, end: 60, hp: 24, max: 20, n: 4, cd: 3 },
    { e: 'squid', start: 60, end: 120, hp: 30, max: 50, n: 10, cd: 4 },
    { e: 'sploder', start: 60, end: 120, hp: 30, max: 2, n: 1, cd: 4 },
    { e: 'sploder', start: 120, end: 300, hp: 30, max: 200, n: 7, cd: 2 },
    { e: 'bigsploder', start: 120, end: 360, hp: 2000, max: 10, n: 2, cd: 5 },
    { e: 'elder', start: 180, end: 180, hp: 1000, max: 1, n: 1, cd: 0, single: true },
    { e: 'lurker', start: 300, end: 420, hp: 400, max: 5, n: 6, cd: 5 },
    { e: 'yog', start: 300, end: 300, hp: 10000, max: 1, n: 1, cd: 0, single: true },
    { e: 'squid', start: 360, end: 540, hp: 100, max: 400, n: 12, cd: 2 },
    { e: 'bigsploder', start: 420, end: 420, hp: 2000, max: 1, n: 1, cd: 0, single: true },
    { e: 'squid', start: 480, end: 600, hp: 80, max: 600, n: 16, cd: 1 },
    { e: 'cultist', start: 605, end: 960, hp: 600, max: 4, n: 1, cd: 1 },
    { e: 'squid', start: 630, end: 720, hp: 200, max: 60, n: 10, cd: 1 },
    { e: 'spawner', start: 680, end: 680, hp: 10000, max: 1, n: 1, cd: 0, single: true },
    { e: 'bigsploder', start: 720, end: 840, hp: 2500, max: 2, n: 1, cd: 1 },
    { e: 'lamprey', start: 780, end: 895, hp: 400, max: 300, n: 8, cd: 1 },
    { e: 'hastur_boss', start: 900, end: 900, hp: 30000, max: 1, n: 1, cd: 0, single: true },
    { e: 'bigsploder', start: 960, end: 1199, hp: 500, max: 4, n: 2, cd: 1 },
    { e: 'cultist', start: 960, end: 1199, hp: 500, max: 4, n: 2, cd: 1 },
    { e: 'squid', start: 990, end: 1199, hp: 300, max: 600, n: 14, cd: 1 },
    { e: 'winged', start: 1080, end: 1080, hp: 18000, max: 1, n: 1, cd: 0, single: true },
  ];

  const PUMPKIN_SPAWNS = [
    { e: 'pumpkin', start: 0, end: 60, hp: 24, max: 20, n: 4, cd: 3 },
    { e: 'pumpkin', start: 60, end: 120, hp: 24, max: 50, n: 10, cd: 4 },
    { e: 'ghost', start: 60, end: 120, hp: 30, max: 2, n: 1, cd: 4 },
    { e: 'pumpkin', start: 120, end: 360, hp: 30, max: 200, n: 7, cd: 2 },
    { e: 'ghost', start: 120, end: 360, hp: 30, max: 10, n: 2, cd: 5 },
    { e: 'elder', start: 180, end: 180, hp: 1000, max: 1, n: 1, cd: 0, single: true },
    { e: 'shub', start: 300, end: 300, hp: 2500, max: 1, n: 1, cd: 0, single: true },
    { e: 'pumpkin', start: 360, end: 480, hp: 60, max: 400, n: 12, cd: 2 },
    { e: 'eyebat', start: 360, end: 480, hp: 400, max: 2, n: 2, cd: 10 },
    { e: 'ghost', start: 420, end: 540, hp: 60, max: 1, n: 1, cd: 1 },
    { e: 'pumpkin', start: 480, end: 600, hp: 80, max: 600, n: 16, cd: 1 },
    { e: 'witch', start: 605, end: 660, hp: 200, max: 30, n: 3, cd: 1 },
    { e: 'eyebat', start: 660, end: 780, hp: 200, max: 12, n: 2, cd: 1 },
    { e: 'witch', start: 660, end: 780, hp: 250, max: 100, n: 5, cd: 1 },
    { e: 'ghost', start: 660, end: 780, hp: 240, max: 4, n: 2, cd: 1 },
    { e: 'spawner', start: 680, end: 680, hp: 10000, max: 1, n: 1, cd: 0, single: true },
    { e: 'witch', start: 780, end: 895, hp: 400, max: 300, n: 14, cd: 1 },
    { e: 'pumpkin', start: 900, end: 960, hp: 300, max: 16, n: 2, cd: 1 },
    { e: 'ghost', start: 900, end: 980, hp: 400, max: 20, n: 2, cd: 1 },
    { e: 'reaper', start: 900, end: 900, hp: 35000, max: 1, n: 1, cd: 0, single: true },
    { e: 'winged', start: 960, end: 960, hp: 18000, max: 1, n: 1, cd: 0, single: true },
    { e: 'pumpkin', start: 960, end: 1080, hp: 250, max: 600, n: 26, cd: 1 },
    { e: 'witch', start: 1080, end: 1199, hp: 500, max: 300, n: 20, cd: 1 },
    { e: 'eyebat', start: 1080, end: 1199, hp: 500, max: 10, n: 1, cd: 1 },
  ];

  // ---------- 三张地图（wiki Maps / Temple / Pumpkin Patch）----------
  // infinite: 是否无限；barrier: Boss 出场是否用电幕困住玩家（神庙场地小，原作无电幕）
  // corridor: 南瓜地为水平走廊（上下封闭）；bounds: 有界地图的可行走范围（以原点为中心）
  const MAPS = [
    { id: 'forest', name: '森林', unlock: 0, infinite: true, barrier: true,
      desc: '无限地图，散落的神秘树。', spawns: FOREST_SPAWNS,
      theme: { ground: ['#152a1d', '#172d1f', '#132619', '#192f21'], deco: 'tree', accent: '#4ade80' } },
    { id: 'temple', name: '神庙', unlock: 1, infinite: false, barrier: false,
      desc: '封闭的方形神殿，石柱是障碍。', spawns: TEMPLE_SPAWNS,
      bounds: { x: 900, y: 700 },
      pillars: [[-430, -300, 52], [430, -300, 52], [-430, 300, 52], [430, 300, 52],
                [0, -430, 46], [0, 430, 46], [-740, 0, 46], [740, 0, 46]],
      theme: { ground: ['#252a33', '#2a3039', '#20252d', '#2d3440'], deco: 'pillar', accent: '#93c5fd' } },
    { id: 'pumpkin', name: '南瓜地', unlock: 1, infinite: true, corridor: true, barrier: true,
      desc: '水平无限的走廊，上下被田地封住。', spawns: PUMPKIN_SPAWNS,
      corridorHalf: 380,
      theme: { ground: ['#2a2116', '#2e2518', '#251d13', '#33291a'], deco: 'pumpkin', accent: '#fb923c' } },
  ];

  // ---------- XP 曲线（wiki：1-19 级 10L-5；20 级 16L-8；21-39 级 13L-6；40-59 级 16L-8；60+ 级 L²）----------
  function xpToLevel(level) {
    if (level <= 19) return 10 * level - 5;
    if (level === 20) return 16 * level - 8;
    if (level <= 39) return 13 * level - 6;
    if (level <= 59) return 16 * level - 8;
    return level * level;
  }

  // ---------- 黑暗等级 0-15（wiki Darkness，累加式）----------
  const DARKNESS = [
    '活过黑夜，解锁更高挑战。',
    '小怪刷新频率 +25%。',
    '小怪生命 +25%。',
    '精英生命 +50%。',
    'Boss 生命 +50%。',
    '精英伤害翻倍。',
    'Boss 伤害翻倍。',
    '小怪移动速度 +15%。',
    '精英移动速度 +25%。',
    '升级选项 -1。',
    '最后 5 分钟小怪伤害翻倍。',
    '经验获取 -15%。',
    '小怪生命再 +50%（合计 +75%）。',
    '精英生命再 +75%（合计 +125%）。',
    'Boss 生命再 +100%（合计 +150%）。',
    'Boss 攻击频率 +80%。',
  ];

  function darknessMods(level) {
    const m = { spawnRate: 1, smallHp: 1, eliteHp: 1, bossHp: 1, eliteDmg: 1, bossDmg: 1,
                smallSpeed: 1, eliteSpeed: 1, choices: 5, smallDmgLate: 1, xp: 1, bossAtk: 1 };
    if (level >= 1) m.spawnRate = 1.25;
    if (level >= 2) m.smallHp = 1.25;
    if (level >= 3) m.eliteHp = 1.5;
    if (level >= 4) m.bossHp = 1.5;
    if (level >= 5) m.eliteDmg = 2;
    if (level >= 6) m.bossDmg = 2;
    if (level >= 7) m.smallSpeed = 1.15;
    if (level >= 8) m.eliteSpeed = 1.25;
    if (level >= 9) m.choices = 4;
    if (level >= 10) m.smallDmgLate = 2;
    if (level >= 11) m.xp = 0.85;
    if (level >= 12) m.smallHp = 1.75;
    if (level >= 13) m.eliteHp = 2.25;
    if (level >= 14) m.bossHp = 2.5;
    if (level >= 15) m.bossAtk = 1.8;
    return m;
  }

  // ---------- 符文（wiki Runes，2 系 × 12 条）----------
  // row = 所在行（1/5/10/15）：本系累计购买 rank 数达到该值才解锁；每行同时只能装备 1 条
  // cost = 每升 1 级的花费；max = 5 级
  const RUNES = [
    // 剑系（输出）
    { id: 'power',    type: 'sword', row: 1,  cost: 1350,  name: '力量',     desc: '子弹与召唤伤害 +2%/级（上限 10%）' },
    { id: 'alacrity', type: 'sword', row: 1,  cost: 1350,  name: '迅捷',     desc: '射速与装填速度 +2%/级（上限 10%）' },
    { id: 'mysticism',type: 'sword', row: 1,  cost: 1350,  name: '秘法',     desc: '子弹 2%/级 概率造成燃烧或冻结（上限 10%）' },
    { id: 'aftershock',type:'sword', row: 5,  cost: 3150,  name: '余震',     desc: '打空弹匣时对周围敌人造成 20%/级 弹伤（上限 100%）' },
    { id: 'elemental_barrage', type:'sword', row: 5, cost: 3150, name: '元素弹幕', desc: '累计造成 50 次燃烧/冻结后，射速与装填 +50%，持续 1 秒/级（上限 5 秒）' },
    { id: 'close_combat', type:'sword', row: 5, cost: 3150, name: '近战',    desc: '视野范围内的敌人受到伤害 +3%/级（上限 15%）' },
    { id: 'glass_cannon', type:'sword', row: 10, cost: 6300, name: '玻璃大炮', desc: '开局生命为上限的一半；子弹伤害与射速 +5%/级（上限 25%）' },
    { id: 'wild_magic',  type:'sword', row: 10, cost: 6300, name: '野性魔法', desc: '燃烧/冻结中的敌人死亡时，5%/级 概率把状态传染给附近敌人（上限 25%）' },
    { id: 'gun_glyph',   type:'sword', row: 10, cost: 6300, name: '枪之符文', desc: '每 10−1/级 秒召唤符文，数秒后炸出 6 发 10% 伤害子弹（受召唤加成）' },
    { id: 'cadence',     type:'sword', row: 15, cost: 12800, name: '节奏',    desc: '每第 3 发子弹无限穿透、弹体翻倍，伤害 +20%/级（上限 100%）' },
    { id: 'ethereal',    type:'sword', row: 15, cost: 12800, name: '以太',     desc: '每 50 杀进入以太状态，2 秒/级 内不消耗弹药（上限 10 秒）' },
    { id: 'dedication',  type:'sword', row: 15, cost: 12800, name: '专精',     desc: '场上恰好 1 个召唤物时，召唤伤害与攻速 +10%/级（上限 50%）' },
    // 盾系（防御）
    { id: 'vigilance', type: 'shield', row: 1,  cost: 1350, name: '警觉',    desc: '视野范围与拾取范围 +3%/级（上限 15%）' },
    { id: 'tenacity',  type: 'shield', row: 1,  cost: 1350, name: '坚韧',    desc: '生命 ≤ 一半时，射速与击退 +3%/级（上限 15%）' },
    { id: 'courage',   type: 'shield', row: 1,  cost: 1350, name: '勇气',    desc: '装填后击退附近敌人；装填速度 +2%/级（上限 10%）' },
    { id: 'momentum',  type: 'shield', row: 5,  cost: 3150, name: '惯性',    desc: '拾取经验后 1 秒内移速 +7%/级（上限 35%）' },
    { id: 'agility',   type: 'shield', row: 5,  cost: 3150, name: '灵巧',    desc: '闪避 +2%/级（上限 10%，总闪避上限 60%）' },
    { id: 'seismic_ward', type:'shield', row: 5, cost: 3150, name: '震地守卫', desc: '每 10−1/级 秒击退周围敌人；算作 2 个召唤物' },
    { id: 'blessing',  type: 'shield', row: 10, cost: 6300, name: '祝福',    desc: '开局带圣盾；圣盾恢复时间 −5 秒/级（上限 −25 秒）' },
    { id: 'healing',   type: 'shield', row: 10, cost: 6300, name: '治愈',    desc: '每 1500−100/级 杀掉落 1 点回血道具（上限 −500）' },
    { id: 'premonition',type:'shield', row: 10, cost: 6300, name: '预感',    desc: '闪避上限 +3%/级（上限 +15%）' },
    { id: 'growth',    type: 'shield', row: 15, cost: 12800, name: '成长',   desc: '每 5 级回 1 血；每个经验球经验 +4%/级（上限 20%）' },
    { id: 'body_soul', type: 'shield', row: 15, cost: 12800, name: '身心',   desc: '每 300 秒获得 1 个魂心，上限 3 + 1/级（上限 +5）' },
    { id: 'wind_shield',type:'shield', row: 15, cost: 12800, name: '风盾',   desc: '风盾挡下 1 发敌弹，10−1/级 秒充能（上限 −5 秒）' },
  ].map(r => ({ ...r, max: 5 }));

  root.DAWN_DATA = {
    WEAPONS, CHARACTERS, ENEMIES, FOREST_SPAWNS, TEMPLE_SPAWNS, PUMPKIN_SPAWNS, MAPS, DARKNESS, RUNES, xpToLevel, darknessMods,
    RUNE_ROWS: [1, 5, 10, 15],
    RUN_LENGTH: 1200, // 20 分钟
  };
})(window);
