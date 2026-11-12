/* 升级树 / 协同 / 秘典 —— wiki 原数据（25 树 × 4 条 = 100 条）
 * tier: 1 -> 2a/2b -> 3；拿到任一 tier2 即解锁 tier3
 * mods: 属性百分比（正=加算正向，负=乘算负向，按 wiki 数值公式）
 * eff : 机制型效果（effects.js 解释）
 */
(function (root) {
  'use strict';

  const TREE_NAMES = {
    fast_bullets: '高速弹', bullet_damage: '弹伤', fire_rate: '射速', multishot: '多发', reload: '装填',
    dragon: '龙', ghost: '幽灵伙伴', lens: '魔镜', scythe: '魔镰', spear: '魔矛', trainer: '训兽',
    frenzy: '狂热', electro: '雷法', ice: '冰法', pyro: '火法', dark: '暗术', holy: '圣术',
    health: '生命', shield: '护盾', dodge: '闪避', soulheart: '魂心',
    magnet: '吸魂', speed: '速度', vision: '视觉', aero: '风术',
  };
  const TREE_GROUP = {
    fast_bullets: '伤害与枪械', bullet_damage: '伤害与枪械', fire_rate: '伤害与枪械',
    multishot: '伤害与枪械', reload: '伤害与枪械',
    dragon: '召唤', ghost: '召唤', lens: '召唤', scythe: '召唤', spear: '召唤', trainer: '召唤', frenzy: '召唤',
    electro: '异常状态', ice: '异常状态', pyro: '异常状态', dark: '异常状态', holy: '异常状态',
    health: '防御', shield: '防御', dodge: '防御', soulheart: '防御',
    magnet: '通用', speed: '通用', vision: '通用', aero: '通用',
  };

  const U = (tree, tier, id, name, desc, mods, eff) =>
    ({ tree, treeName: TREE_NAMES[tree], group: TREE_GROUP[tree], tier, id, name, desc, mods: mods || {}, eff: eff || [] });

  const UPGRADES = [
    // ---- 伤害与枪械 ----
    U('fast_bullets',1,'take_aim','瞄准','子弹速度 +30%，散布 -15',{bulletSpeed:0.3,spread:-15}),
    U('fast_bullets',2,'penetration','穿透','子弹速度 +15%，穿透 +1',{bulletSpeed:0.15,piercing:1}),
    U('fast_bullets',2,'sniper','狙击','子弹速度 +25%，弹伤 +15%',{bulletSpeed:0.25,bulletDamage:0.15}),
    U('fast_bullets',3,'assassin','刺客','自动秒杀生命低于 20% 的敌人',{},[{t:'execute',pct:0.2}]),

    U('bullet_damage',1,'power_shot','强力射击','弹伤 +40%，击退 +20%',{bulletDamage:0.4,knockback:0.2}),
    U('bullet_damage',2,'big_shot','巨弹','弹伤 +45%，弹体 +40%',{bulletDamage:0.45,bulletSize:0.4}),
    U('bullet_damage',2,'splinter','碎片','敌人死亡时炸出 3 颗子弹（10% 伤害）',{},[{t:'splinter'}]),
    U('bullet_damage',3,'reaper_rounds','死神弹','弹伤 +20%，穿透 +1；子弹可穿过已死敌人',{bulletDamage:0.2,piercing:1},[{t:'pierce_dead'}]),

    U('fire_rate',1,'rapid_fire','急速射击','射速 +25%',{fireRate:0.25}),
    U('fire_rate',2,'light_bullets','轻弹','射速 +15%，弹匣 +1，弹速 +15%',{fireRate:0.15,ammo:1,bulletSpeed:0.15}),
    U('fire_rate',2,'rubber_bullets','橡胶弹','弹跳 +1，射速 +10%',{bounce:1,fireRate:0.1}),
    U('fire_rate',3,'siege','攻城','站立不动时开火有 40% 概率不消耗弹药',{},[{t:'siege',pct:0.4}]),

    U('multishot',1,'double_shot','双重射击','弹数 +1，散布 +10，弹伤 -10%',{projectiles:1,spread:10,bulletDamage:-0.1}),
    U('multishot',2,'fan_fire','扇射','打空弹匣时向四周再射 10 颗（15% 伤害）',{},[{t:'fan_fire'}]),
    U('multishot',2,'split_fire','分裂','额外向身后射出一颗子弹',{},[{t:'split_fire'}]),
    U('multishot',3,'fusillade','连续炮击','弹数 +1，散布 +15，弹伤 -25%；基础弹数翻倍',{projectiles:1,spread:15,bulletDamage:-0.25},[{t:'double_base_proj'}]),


    U('reload',1,'quick_hands','快手','装填速度 +20%，射速 +5%',{reloadRate:0.2,fireRate:0.05}),
    U('reload',2,'armed_ready','整装待发','装填速度 +10%，弹匣 +2',{reloadRate:0.1,ammo:2}),
    U('reload',2,'fresh_clip','新弹匣','装填速度 +5%；装填后 1 秒内弹伤 +50%',{reloadRate:0.05},[{t:'fresh_clip'}]),
    U('reload',3,'kill_clip','杀戮弹匣','每杀 1 个敌人装填速度 +5%，装填后重置',{},[{t:'kill_clip'}]),

    // ---- 召唤 ----
    U('dragon',1,'dragon_egg','龙蛋','召唤一颗蛋，3 分钟后孵化为幼龙',{},[{t:'dragon_egg'}]),
    U('dragon',2,'aged_dragon','岁月之龙','幼龙每 60 秒 +15 伤害（孵化中亦生效）',{},[{t:'dragon_aged'}]),
    U('dragon',2,'trained_dragon','训练之龙','幼龙每 60 秒 +10% 攻速（孵化中亦生效）',{},[{t:'dragon_trained'}]),
    U('dragon',3,'dragon_bond','龙之羁绊','你的子弹额外造成相当于幼龙伤害 10% 的伤害',{},[{t:'dragon_bond'}]),

    U('ghost',1,'ghost_friend','幽灵伙伴','召唤幽灵伙伴，快速射出穿透弹（8 伤害）',{},[{t:'ghost_friend'}]),
    U('ghost',2,'best_friends','挚友','射速 +10%；幽灵伙伴攻速受你射速加成',{fireRate:0.1},[{t:'best_friends'}]),
    U('ghost',2,'ghost_wizard','幽灵法师','幽灵弹附带燃烧（6/秒），并触发你的命中特效',{},[{t:'ghost_wizard'}]),
    U('ghost',3,'vengeful_ghost','怨灵','幽灵伙伴多射 1 颗弹',{},[{t:'vengeful_ghost'}]),

    U('lens',1,'magic_lens','魔镜','召唤旋转魔镜，穿过它的子弹伤害与体积 +30%（受召唤伤害加成）',{},[{t:'magic_lens'}]),
    U('lens',2,'igniting_lens','燃镜','穿过魔镜的子弹命中时点燃敌人',{},[{t:'igniting_lens'}]),
    U('lens',2,'refraction','折射','穿过魔镜的子弹 +2 弹跳',{},[{t:'refraction'}]),
    U('lens',3,'focal_point','焦点','魔镜效果翻倍，体积减半',{},[{t:'focal_point'}]),

    U('scythe',1,'magic_scythe','魔镰','召唤魔镰，造成 40 伤害',{},[{t:'magic_scythe'}]),
    U('scythe',2,'shadowblade','影刃','魔镰施加诅咒，诅咒伤害 +15%',{},[{t:'shadowblade'}]),
    U('scythe',2,'windcutter','风切','移速 +10%；魔镰伤害受移速加成',{moveSpeed:0.1},[{t:'windcutter'}]),
    U('scythe',3,'scythe_mastery','镰之精通','弹伤 +10%；魔镰伤害受弹伤加成',{bulletDamage:0.1},[{t:'scythe_mastery'}]),

    U('spear',1,'magic_spear','魔矛','召唤 2 支魔矛，各造成 20 伤害',{},[{t:'magic_spear'}]),
    U('spear',2,'holy_spear','圣矛','魔矛伤害 +10 × 当前最大生命',{},[{t:'holy_spear'}]),
    U('spear',2,'soul_drain','汲魂','每第 500 个被召唤物杀死的敌人掉落魂心',{},[{t:'soul_drain'}]),
    U('spear',3,'soul_knight','魂骑士','每获得 1 颗魂心，魔矛 +15 伤害',{},[{t:'soul_knight'}]),

    U('trainer',1,'trainer','训兽师','召唤伤害 +30%',{summonDamage:0.3}),
    U('trainer',2,'pulsing_summons','脉冲召唤','召唤伤害 +20%；召唤物每 2 秒对周围造成 50 伤害',{summonDamage:0.2},[{t:'pulsing_summons'}]),
    U('trainer',2,'feed_beasts','喂养','每杀 15 个敌人，召唤伤害 +1%',{},[{t:'feed_beasts'}]),
    U('trainer',3,'bloodsuckers','吸血兽','召唤伤害 +10%；每第 500 个被召唤物杀死的敌人掉落治疗',{summonDamage:0.1},[{t:'bloodsuckers'}]),

    U('frenzy',1,'frenzy','狂热','召唤攻速 +30%',{summonAttackSpeed:0.3}),
    U('frenzy',2,'hellspawns','狱裔','召唤攻速 +20%；召唤物命中施加燃烧（3/秒）',{summonAttackSpeed:0.2},[{t:'hellspawns'}]),
    U('frenzy',2,'thunderspawns','雷裔','召唤攻速 +20%；召唤物命中 30% 概率落雷 22 伤害',{summonAttackSpeed:0.2},[{t:'thunderspawns'}]),
    U('frenzy',3,'culling','筛选','召唤攻速 +15%；召唤物命中 15% 概率秒杀（对 Boss 无效）',{summonAttackSpeed:0.15},[{t:'culling'}]),

    // ---- 异常状态 ----
    U('electro',1,'electro_mage','雷法师','每第 2 发落雷打击附近敌人 22 伤害',{},[{t:'electro_mage'}]),
    U('electro',2,'electro_bug','雷虫','召唤雷虫，对 2 个附近敌人落雷',{},[{t:'electro_bug'}]),
    U('electro',2,'energized','充电','落雷时 20% 概率补充 3 发弹药',{},[{t:'energized'}]),
    U('electro',3,'electro_mastery','雷之精通','所有雷电伤害 +12，雷电范围 +75%',{},[{t:'electro_mastery'}]),

    U('ice',1,'frost_mage','霜法师','子弹 35% 概率冻结 1.5 秒（Boss 仅 0.3 秒）',{},[{t:'frost_mage',chance:0.35}]),
    U('ice',2,'frostbite','霜噬','敌人被冻结时失去 15% 最大生命（Boss 1%）',{},[{t:'frostbite'}]),
    U('ice',2,'ice_shard','冰锥','打空弹匣时射出 3 颗冻结冰锥',{},[{t:'ice_shard'}]),
    U('ice',3,'shatter','碎裂','被冻结的敌人死亡时爆炸，对周围造成其最大生命 7% 的伤害',{},[{t:'shatter'}]),

    U('pyro',1,'pyro_mage','火法师','子弹 50% 概率点燃（3/秒）',{},[{t:'burn',chance:0.5,dps:3}]),
    U('pyro',2,'fire_starter','引火','每第 5 发发射火球（40 伤害）并大范围点燃',{},[{t:'fire_starter'}]),
    U('pyro',2,'intense_burn','炽燃','燃烧伤害 +35%',{burnDamage:0.35}),
    U('pyro',3,'soothing_warmth','温煦','施加燃烧时 1/2000 概率回复 1 生命',{},[{t:'soothing_warmth'}]),

    U('dark',1,'dark_arts','暗术','子弹 35% 概率施加诅咒；0.75 秒后受 200% 弹伤',{},[{t:'curse',chance:0.35,pct:2}]),
    U('dark',2,'doom','厄运','诅咒伤害额外 +100% 弹伤',{},[{t:'doom'}]),
    U('dark',2,'wither','凋零','被诅咒的敌人受到伤害 +30%',{},[{t:'wither'}]),
    U('dark',3,'ritual','仪式','每 10 个被诅咒杀死的敌人，弹伤 +1%',{},[{t:'ritual'}]),

    U('holy',1,'holy_arts','圣术','打空弹匣时惩戒附近敌人 20 伤害',{},[{t:'holy_arts'}]),
    U('holy',2,'holy_might','圣威','惩戒伤害 +10 × 当前生命',{},[{t:'holy_might'}]),
    U('holy',2,'justice','正义','每 500 个被惩戒杀死敌人，最大生命 +1（上限 3）',{},[{t:'justice'}]),
    U('holy',3,'angelic','天使','每 500 个被惩戒杀死敌人回复 1 生命',{},[{t:'angelic'}]),

    // ---- 防御 ----
    U('health',1,'vitality','活力','最大生命 +1',{hp:1}),
    U('health',2,'anger_point','怒点','受击后 30 秒内弹伤与射速 +75%',{},[{t:'anger_point'}]),
    U('health',2,'giant','巨人','最大生命 +2，体型 +25%',{hp:2,charSize:0.25}),
    U('health',3,'regeneration','再生','每 90 秒回复 1 生命',{},[{t:'regeneration'}]),

    U('shield',1,'holy_shield','圣盾','圣盾抵挡一次伤害，破碎后 2 分钟恢复',{},[{t:'holy_shield'}]),
    U('shield',2,'divine_blessing','神恩','圣盾存在时装填速度与移速 +25%',{},[{t:'divine_blessing'}]),
    U('shield',2,'divine_wrath','神怒','圣盾存在时每秒对随机附近敌人落雷 22 伤害',{},[{t:'divine_wrath'}]),
    U('shield',3,'stalwart_shield','坚盾','圣盾恢复时间缩短为 1 分钟',{},[{t:'stalwart_shield'}]),

    U('dodge',1,'evasive','闪避','闪避 +20%',{dodge:0.2}),
    U('dodge',2,'nimble','灵巧','闪避 +10%，移速 +10%',{dodge:0.1,moveSpeed:0.1}),
    U('dodge',2,'tiny','微小','闪避 +5%，体型 -25%',{dodge:0.05,charSize:-0.25}),
    U('dodge',3,'reflex','反射','移速 +15%；闪避受移速加成',{moveSpeed:0.15},[{t:'reflex'}]),

    U('soulheart',1,'soul_shield','魂盾','获得 1 颗魂心；每 90 秒再得 1 颗（上限 3）',{},[{t:'soul_shield'}]),
    U('soulheart',2,'soul_expand','魂扩','获得 1 颗魂心，上限 +2',{},[{t:'soul_expand'}]),
    U('soulheart',2,'soul_powered','魂力','每持有 1 颗魂心，子弹伤害 +10%',{},[{t:'soul_powered'}]),
    U('soulheart',3,'soul_link','魂链','获得 1 颗魂心；失去魂心时周围敌人失去 80% 最大生命（Boss 无效）',{},[{t:'soul_link'}]),

    // ---- 通用 ----
    U('magnet',1,'magnetism','磁力','拾取范围 +50%',{pickupRange:0.5}),
    U('magnet',2,'recharge','再充','拾取范围 +20%；每次拾取经验 10% 概率补 1 发弹药',{pickupRange:0.2},[{t:'recharge',chance:0.1}]),
    U('magnet',2,'watch_learn','观摩','拾取范围 +30%，视野 +25%',{pickupRange:0.3,visionRange:0.25}),
    U('magnet',3,'excitement','兴奋','拾取范围 +30%；拾取经验后 1 秒内射速 +50%',{pickupRange:0.3},[{t:'excitement'}]),

    U('speed',1,'haste','迅捷','移速 +20%，射速 +5%',{moveSpeed:0.2,fireRate:0.05}),
    U('speed',2,'blazing_speed','疾火','移速 +10%；奔跑时点燃附近敌人（越快越频繁）',{moveSpeed:0.1},[{t:'blazing_speed'}]),
    U('speed',2,'run_gun','跑打','开火时移速 +100%',{walkSpeed:1.0}),
    U('speed',3,'in_the_wind','风中','每 10 秒弹伤与移速 +10%（上限 40%），受击重置',{},[{t:'in_the_wind'}]),

    U('vision',1,'glare','凝视','视野 +25%；视野内敌人每秒受 15 伤害',{visionRange:0.25},[{t:'glare'}]),
    U('vision',2,'intense_glare','强凝视','视野 +25%；凝视伤害翻倍',{visionRange:0.25},[{t:'intense_glare'}]),
    U('vision',2,'sight_magic','视魔法','视野 +15%；凝视伤害附带子弹命中特效',{visionRange:0.15},[{t:'sight_magic'}]),
    U('vision',3,'saccade','扫视','视野 +25%；凝视频率翻倍',{visionRange:0.25},[{t:'saccade'}]),

    U('aero',1,'aero_magic','风魔法','每 2 秒射出旋风，每 0.5 秒造成 20 伤害',{},[{t:'aero_magic'}]),
    U('aero',2,'windborne','乘风','移速 +15%；旋风伤害受移速加成',{moveSpeed:0.15},[{t:'windborne'}]),
    U('aero',2,'eye_storm','风眼','每 2 秒对附近敌人造成双倍旋风伤害；旋风伤害 +5',{},[{t:'eye_storm'}]),
    U('aero',3,'aero_mastery','风之精通','旋风伤害 +15',{},[{t:'aero_mastery'}]),
  ];

  // ---------- 协同（12 条，需指定前置） ----------
  const SYNERGIES = [
    { id: 'death_rounds', name: '死亡弹', group: '协同',
      desc: '子弹额外造成 10 点伤害。', need: ['reaper_rounds','light_bullets'], mods: {flatDamage: 10} },
    { id: 'frost_fire', name: '霜火', group: '协同',
      desc: '施加冻结时，同时施加燃烧（6/秒）。', need: ['intense_burn','frostbite'], mods: {}, eff: [{t:'frost_fire'}] },
    { id: 'gun_mastery', name: '枪械精通', group: '协同',
      desc: '弹伤 +30%，射速 +15%，装填 +15%，弹匣 +1，穿透 +1。',
      need: ['armed_ready','power_shot','rapid_fire'], mods: {bulletDamage:0.3,fireRate:0.15,reloadRate:0.15,ammo:1,piercing:1} },
    { id: 'mini_clip', name: '微型弹匣', group: '协同',
      desc: '装填 +75%，弹伤 +50%，弹匣 -4。', need: ['fan_fire','fresh_clip'], mods: {reloadRate:0.75,bulletDamage:0.5,ammo:-4} },
    { id: 'overload', name: '超载', group: '协同',
      desc: '雷电击中燃烧中的敌人时，产生 25 伤害爆炸。', need: ['electro_mastery','fire_starter'], mods: {}, eff: [{t:'overload'}] },
    { id: 'stand_ground', name: '寸步不让', group: '协同',
      desc: '弹数 +2，射速 +25%，移速 -25%。', need: ['siege','fusillade'], mods: {projectiles:2,fireRate:0.25,moveSpeed:-0.25} },
    { id: 'summon_mastery', name: '召唤精通', group: '协同',
      desc: '召唤伤害 +35%，召唤攻速 +35%，弹伤 -35%。', need: ['vengeful_ghost','scythe_mastery'], mods: {summonDamage:0.35,summonAttackSpeed:0.35,bulletDamage:-0.35} },
    { id: 'death_plague', name: '死亡瘟疫', group: '协同',
      desc: '被诅咒杀死的敌人会把诅咒传播给附近敌人。', need: ['ritual','reaper_rounds'], mods: {}, eff: [{t:'death_plague'}] },
    { id: 'generator', name: '发电机', group: '协同',
      desc: '获得弹药时，射速 +35% 持续 2 秒。', need: ['recharge','energized'], mods: {}, eff: [{t:'generator'}] },
    { id: 'kunoichi', name: '女忍', group: '协同',
      desc: '每 10 秒射速 +10%、穿透 +1，受击重置。', need: ['in_the_wind','assassin'], mods: {}, eff: [{t:'kunoichi'}] },
    { id: 'sword_shield', name: '剑与盾', group: '协同',
      desc: '圣盾未激活时，惩戒击杀使圣盾恢复时间 -1 秒。', need: ['holy_shield','justice'], mods: {}, eff: [{t:'sword_shield'}] },
    { id: 'titan', name: '泰坦', group: '协同',
      desc: '最大生命 +2，移速 +25%，体型 +25%。', need: ['giant','angelic'], mods: {hp:2,moveSpeed:0.25,charSize:0.25} },
  ];

  // ---------- 秘典（12 条，Boss 掉落 3 选 1） ----------
  const TOMES = [
    { id: 'elasticity', name: '弹性秘典', desc: '弹跳 +2，弹伤 -25%，最大生命 -1', mods: {bounce:2,bulletDamage:-0.25,hp:-1} },
    { id: 'electro',    name: '雷之秘典', desc: '装填 +25%，弹伤 -16%；打空弹匣时对附近敌人落雷 22', mods: {reloadRate:0.25,bulletDamage:-0.16}, eff: [{t:'tome_electro'}] },
    { id: 'elements',   name: '元素秘典', desc: '燃烧伤害、雷电伤害、冻结时长 +35%', mods: {burnDamage:0.35,lightningDamage:0.35,freezeDuration:0.35} },
    { id: 'glass',      name: '玻璃秘典', desc: '你的伤害翻倍；受到任何伤害即死', mods: {}, eff: [{t:'glass'}] },
    { id: 'might',      name: '力量秘典', desc: '最大生命 +1；每点最大生命使伤害 +2', mods: {hp:1}, eff: [{t:'might'}] },
    { id: 'power',      name: '力量之书', desc: '弹伤 +50%，弹体 +100%，穿透 +1，射速 -25%，最大生命 -1', mods: {bulletDamage:0.5,bulletSize:1,piercing:1,fireRate:-0.25,hp:-1} },
    { id: 'rage',       name: '暴怒秘典', desc: '射速 +60%，散布 +60，弹伤 -50%，击退 -95%；基础弹匣 ×3', mods: {fireRate:0.6,spread:60,bulletDamage:-0.5,knockback:-0.95}, eff: [{t:'triple_ammo'}] },
    { id: 'speed',      name: '疾行秘典', desc: '移速 +50%，最大生命 -1', mods: {moveSpeed:0.5,hp:-1} },
    { id: 'stillness',  name: '静止秘典', desc: '移速 -100%，弹伤 +100%，弹体 +100%，弹数 +1', mods: {walkSpeed:-1,bulletDamage:1,bulletSize:1,projectiles:1} },
    { id: 'summoning',  name: '召唤秘典', desc: '召唤伤害 +50%，召唤攻速 +50%，装填 -50%', mods: {summonDamage:0.5,summonAttackSpeed:0.5,reloadRate:-0.5} },
    { id: 'vitality',   name: '活力秘典', desc: '最大生命 +4，闪避 -25%', mods: {hp:4,dodge:-0.25} },
    { id: 'wind',       name: '风之秘典', desc: '移速 +10%；所有伤害受移速加成；造成伤害 -15%', mods: {moveSpeed:0.1}, eff: [{t:'tome_wind'}] },
  ];

  // ---------- 角色专属升级（wiki Character_Upgrades，精英宝箱三选一） ----------
  // 数据来源：sources/Runes.txt 同批抓取；wiki 页面按角色分表，每角色 3 条
  const CU = (char, id, name, desc, mods, eff) =>
    ({ char, id, name, desc, group: '角色专属', mods: mods || {}, eff: eff || [], tier: 0 });

  const CHAR_UPGRADES = [
    // 莎娜
    CU('shana', 'halo', '莎娜的光环', '光环修复：射速 +50%、装填 +50%、视野 +75%', { fireRate: 0.5, reloadRate: 0.5, visionRange: 0.75 }, [{ t: 'halo' }]),
    CU('shana', 'ascension', '飞升', '立刻拼好光环（等价于集齐 3 片光环碎片）', {}, [{ t: 'halo_piece' }, { t: 'halo_piece' }, { t: 'halo_piece' }]),
    CU('shana', 'quick_learner', '快速学习', '获得经验 +40%', { xp: 0.4 }),
    CU('shana', 'specialize', '专精', '下一个拿到的升级效果 ×3', {}, [{ t: 'specialize' }]),
    CU('shana', 'halo_piece', '光环碎片', '集齐 3 片修复莎娜的光环', {}, [{ t: 'halo_piece' }]),
    // 黛梦
    CU('diamond', 'bulk_up', '壮硕', '每次回血：子弹伤害与弹体 +15%', {}, [{ t: 'bulk_up' }]),
    CU('diamond', 'strong_will', '意志', '生命 ≤ 一半时：穿透 +2、击退 +25%', {}, [{ t: 'strong_will' }]),
    CU('diamond', 'berserk', '狂暴', '每次受击：射速与装填永久 +10%', {}, [{ t: 'berserk' }]),
    // 斯嘉丽
    CU('scarlett', 'pyro_affinity', '火焰亲和', '子弹伤害 -25%，燃烧伤害 +67%', { bulletDamage: -0.25, burnDamage: 0.67 }),
    CU('scarlett', 'pyromania', '纵火狂', '每次点燃：射速 +10%（可叠加）', {}, [{ t: 'pyromania' }]),
    CU('scarlett', 'lasting_flame', '余烬', '燃烧持续时间翻倍', {}, [{ t: 'lasting_flame' }]),
    // 希娜
    CU('hina', 'maneuver', '机动', '冲刺时立即完成装填', {}, [{ t: 'hina_reload' }]),
    CU('hina', 'hidden_blade', '袖剑', '冲刺期间无敌并伤害路径上的敌人', {}, [{ t: 'hina_invuln' }]),
    CU('hina', 'enhanced_shadow', '强化幻影', '召唤伤害 +25%，影分身攻击速度 ×3', { summonDamage: 0.25 }, [{ t: 'shadow_fast' }]),
    // 斯帕克
    CU('spark', 'charged_up', '蓄能', '每第 3 道闪电双倍伤害并回 1 发子弹', {}, [{ t: 'charged_up' }]),
    CU('spark', 'electro_affinity', '雷电亲和', '子弹伤害 -25%，雷电伤害 +50%', { bulletDamage: -0.25, lightningDamage: 0.5 }),
    CU('spark', 'electrical_fire', '电火', '雷电命中点燃敌人 3/秒', {}, [{ t: 'electrical_fire' }]),
    // 莉莉丝
    CU('lilith', 'undead_army', '亡灵大军', '召唤伤害与召唤攻速 +35%', { summonDamage: 0.35, summonAttackSpeed: 0.35 }),
    CU('lilith', 'necrophile', '恋尸', '击杀后移速 +35% 持续 1 秒', {}, [{ t: 'necrophile' }]),
    CU('lilith', 'necromancer', '死灵法师', '召唤伤害 +20%，每次击杀额外放出幽灵', { summonDamage: 0.2 }, [{ t: 'necromancer' }]),
    // 阿比
    CU('abby', 'bullet_storm', '弹雨', '弹数 +2，射速 -31%，散布 +40', { projectiles: 2, fireRate: -0.31, spread: 40 }),
    CU('abby', 'whirlwind', '疾风', '装填后移速 +35%、装填 +35%，持续 2 秒', {}, [{ t: 'whirlwind' }]),
    CU('abby', 'make_it_rain', '倾盆大雨', '倾泻期间射速翻倍且不耗弹', {}, [{ t: 'make_it_rain' }]),
    // 小雪
    CU('yuki', 'pair_up', '成双', '额外获得 1 只霜蝶', {}, [{ t: 'pair_up' }]),
    CU('yuki', 'brittle', '脆化', '被冻结的敌人受到伤害 +30%', {}, [{ t: 'brittle' }]),
    CU('yuki', 'butterfly_dance', '蝶舞', '霜蝶飞出频率翻倍', {}, [{ t: 'butterfly_dance' }]),
    // 露娜
    CU('luna', 'cosmic_burst', '宇宙爆发', '黑洞结束时射出 3 发 50% 伤害子弹', {}, [{ t: 'cosmic_burst' }]),
    CU('luna', 'parallel_star', '平行星', '黑洞同时在身后再开一个', {}, [{ t: 'parallel_star' }]),
    CU('luna', 'implosion', '内爆', '黑洞造成一次弹伤', {}, [{ t: 'implosion' }]),
    // 达舍
    CU('dasher', 'hail_bringer', '冰雹使者', '鹿形态冲刺时射出雪球（25% 伤害）', {}, [{ t: 'hail_bringer' }]),
    CU('dasher', 'nature_blessing', '自然祝福', '体型 +50%，移速 +30%，召唤伤害 +30%', { charSize: 0.5, moveSpeed: 0.3, summonDamage: 0.3 }),
    CU('dasher', 'deer_friend', '鹿友', '召唤一只鹿朋友（50% 你的伤害）', {}, [{ t: 'deer_friend' }]),
    // 哈斯塔
    CU('hastur', 'frenzy', '狂乱', '触手触发频率 ×2', {}, [{ t: 'tent_fast' }]),
    CU('hastur', 'smash', '重击', '触手伤害 +30', {}, [{ t: 'tent_dmg' }]),
    CU('hastur', 'call_of_abyss', '深渊召唤', '触手触发频率再 ×2', {}, [{ t: 'tent_fast2' }]),
    // 瑞文
    CU('raven', 'shadow_affinity', '暗影亲和', '射速 -10%，诅咒伤害 +75%', { fireRate: -0.1 }, [{ t: 'shadow_affinity' }]),
    CU('raven', 'shadow_flame', '暗影烈焰', '诅咒同时造成 35% 诅咒伤害的燃烧', {}, [{ t: 'shadow_flame' }]),
    CU('raven', 'flock_crows', '群鸦', '乌鸦伤害改为等于子弹伤害', {}, [{ t: 'flock_crows' }]),
    // 卡塔娜
    CU('katana', 'sword_mastery', '剑术精通', '子弹伤害 +40%，魔剑同样受益', { bulletDamage: 0.4 }, [{ t: 'sword_mastery' }]),
    CU('katana', 'fire_edge', '火刃', '50% 概率点燃，魔剑附带火焰', {}, [{ t: 'fire_edge' }]),
    CU('katana', 'thousand_blades', '千刃', '装填时额外召唤 2 把魔剑', {}, [{ t: 'thousand_blades' }]),
  ];

  root.DAWN_UPGRADES = { UPGRADES, SYNERGIES, TOMES, CHAR_UPGRADES, TREE_NAMES, TREE_GROUP };
})(window);
