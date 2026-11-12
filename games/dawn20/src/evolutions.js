/* 武器进化（wiki Weapon Evolutions，v1.0.0）：20 级触发，本武器三选一
 * mods 走通用属性系统；eff 由 game.js 解释
 */
(function (root) {
  'use strict';
  const EVO = [
    // --- 左轮 ---
    { id: 'headshot',  weap: 'revolver', name: '爆头',   desc: '子弹 30% 概率造成 3 倍伤害。', eff: { critTriple: 0.3 } },
    { id: 'trickshot', weap: 'revolver', name: '跳弹',   desc: '弹跳 +1；每次弹跳后子弹伤害 +20%。', mods: { bounce: 1 }, eff: { bounceDmg: 0.2 } },
    { id: 'volley',    weap: 'revolver', name: '齐射',   desc: '第一发与最后一发子弹额外射出 3 个弹丸。', eff: { volley: 3 } },
    // --- 霰弹枪 ---
    { id: 'melee_shot', weap: 'shotgun', name: '近战喷射', desc: '弹伤 +200%，弹丸 +2，穿透 +2，弹体 +200%，散布 +50：伤害更高、射程更短。', mods: { bulletDamage: 2, projectiles: 2, piercing: 2, bulletSize: 2, spread: 50 } },
    { id: 'dual_wield', weap: 'shotgun', name: '双持',   desc: '弹匣 +2；背后多出一把霰弹枪同时开火。', mods: { ammo: 2 }, eff: { backShot: true } },
    { id: 'focused',    weap: 'shotgun', name: '聚焦轰击', desc: '弹丸固定为 1，弹体 +500%；每点被移除的弹丸改为 +50% 伤害。', eff: { focusBlast: true } },
    // --- 十字弩 ---
    { id: 'quantum',    weap: 'crossbow', name: '量子箭', desc: '子弹飞到画面边缘时从对面穿回来。', eff: { quantum: true } },
    { id: 'quick_load', weap: 'crossbow', name: '速装',   desc: '装填速度大幅提升。', mods: { reloadRate: 1.2 } },
    { id: 'wind_bolt',  weap: 'crossbow', name: '疾风箭', desc: '移速 +25%，走速 +100%；子弹伤害额外吃移速加成。', mods: { moveSpeed: 0.25, walkSpeed: 1 }, eff: { dmgFromSpeed: true } },
    // --- 火焰炮 ---
    { id: 'overclock',  weap: 'flame', name: '超频',     desc: '未打空弹匣时停火快速回弹；装填变慢；弹量低于 75% 时燃烧伤害 ×2。', eff: { overclock: true } },
    { id: 'meteor',     weap: 'flame', name: '陨火',     desc: '射速大降，基础伤害变为 30；燃烧伤害吃弹伤加成。', eff: { meteor: true } },
    { id: 'combustion', weap: 'flame', name: '焚地',     desc: '每第 3 个击杀在地面留下燃烧地带（3 伤/秒）。', eff: { combustion: true } },
    // --- 双持冲锋枪 ---
    { id: 'flash_mag',  weap: 'dual_smg', name: '闪光弹匣', desc: '每第 10 发释放一波闪电，每道 22 伤害。', eff: { flashMag: true } },
    { id: 'hail_shot',  weap: 'dual_smg', name: '冰雹弹', desc: '10% 概率冻结；对冻结目标伤害 ×4。', eff: { hail: true } },
    { id: 'firey',      weap: 'dual_smg', name: '燃烧载荷', desc: '20% 概率在小范围内点燃 6 伤/秒。', eff: { firey: true } },
    // --- 蝠枪 ---
    { id: 'hellfire',   weap: 'batgun', name: '炼狱蝠',   desc: '50% 概率点燃 3 伤/秒；燃烧伤害吃召唤伤害。', eff: { hellfire: true } },
    { id: 'shadow',     weap: 'batgun', name: '暗影蝠',   desc: '50% 概率施加诅咒；诅咒伤害吃召唤伤害。', eff: { shadow: true } },
    { id: 'vampiric',   weap: 'batgun', name: '吸血蝠',   desc: '生命上限 +1；每 200 个击杀掉落治疗物。', mods: { hp: 1 }, eff: { vampiric: true } },
    // --- 榴弹发射器 ---
    { id: 'blast_shield', weap: 'grenade', name: '爆破护盾', desc: '弹体 +25%；免疫爆炸伤害。', mods: { bulletSize: 0.25 }, eff: { blastImmune: true } },
    { id: 'napalm',     weap: 'grenade', name: '凝固汽油', desc: '弹体 +30%，弹速 -30%；点燃 50% 弹伤/秒。', mods: { bulletSize: 0.3 }, eff: { napalm: true } },
    { id: 'cluster',    weap: 'grenade', name: '集束炸弹', desc: '榴弹爆炸后分裂成 5 枚小榴弹（各 20% 弹伤）。', eff: { cluster: true } },
    // --- 魔弓 ---
    { id: 'arrow_caller',   weap: 'magic_bow', name: '唤箭', desc: '命中去程不造成伤害，回程造成 3 倍伤害。', eff: { arrowCaller: true } },
    { id: 'thunder_caller', weap: 'magic_bow', name: '唤雷', desc: '回程可触发命中效果；20% 概率落雷 22 伤害。', eff: { thunderCaller: true } },
    { id: 'bomb_arrows',    weap: 'magic_bow', name: '爆裂箭', desc: '箭不再返回；装填时在原地爆炸造成 3 倍弹伤。', eff: { bombArrows: true } },
    // --- 魔剑 ---
    { id: 'death_sickle', weap: 'katana', name: '死神镰', desc: '装填完成后大旋斩，造成 4 倍弹伤并施加诅咒。', eff: { deathSickle: true } },
    { id: 'wind_katana',  weap: 'katana', name: '风刀',   desc: '移速 +30%；旋风伤害吃移速加成。', mods: { moveSpeed: 0.3 }, eff: { katanaSpeed: true } },
    { id: 'light_blade',  weap: 'katana', name: '光刃',   desc: '生命上限 +1；命中 50% 概率制裁 20 伤害。', mods: { hp: 1 }, eff: { lightBlade: true } },
    // --- 齐射飞刀 ---
    { id: 'thousand',  weap: 'salvo', name: '千刀',   desc: '弹匣 +999；移速 +50%。', mods: { ammo: 999, moveSpeed: 0.5 } },
    { id: 'trick_knife', weap: 'salvo', name: '花刀', desc: '穿透 +1，但穿透转为弹跳。', eff: { pierceToBounce: true } },
    { id: 'wind_knife', weap: 'salvo', name: '风刀',  desc: '移速 +30%；飞刀伤害吃移速加成。', mods: { moveSpeed: 0.3 }, eff: { dmgFromSpeed: true } },
    // --- 浇水枪 ---
    { id: 'jet_stream',  weap: 'watering', name: '高压水流', desc: '射速 +20%，子弹射程提升。', mods: { fireRate: 0.2 }, eff: { jetStream: true } },
    { id: 'magic_spray', weap: 'watering', name: '魔法喷雾', desc: '孢子花可以触发命中效果。', eff: { magicSpray: true } },
    { id: 'power_spray', weap: 'watering', name: '强力喷雾', desc: '孢子花伤害吃弹伤加成。', eff: { powerSpray: true } },
  ];
  root.DAWN_EVOLUTIONS = EVO;
})(typeof window !== 'undefined' ? window : globalThis);
