// Lightweight i18n — English default (platform faces US/English users), zh optional.
type Lang = 'en' | 'zh';

function detect(): Lang {
  const o = alteruLocalStorage.getItem('game_locale');
  if (o === 'en' || o === 'zh') return o;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let lang: Lang = detect();
export function getLang(): Lang { return lang; }

const STR = {
  title:      { en: 'GET OFF MY GRAVE', zh: '滚出我的墓地' },
  tapToStart: { en: 'TAP TO DEFEND',   zh: '点击开始守墓' },
  tapPlant:   { en: 'TAP A PLOT TO LIGHT A BRAZIER', zh: '点空地点燃招魂火' },
  tapUpgrade: { en: 'TAP A BRAZIER TO STOKE THE FLAME', zh: '点火盆可旺火升级' },
  guideBuild: { en: 'TAP A GLOWING SOCKET', zh: '点亮的台座放置' },
  guideBuildSub: { en: 'to place the chosen weapon', zh: '放下选中的武器' },
  guideEarn:  { en: 'BANISH THE DEAD TO EARN SOULS', zh: '超度亡灵攒取魂魄' },
  souls:      { en: 'souls', zh: '魂' },
  howDead:    { en: 'The dead march in', zh: '亡灵沿路涌来' },
  howBuild:   { en: 'Tap sockets to build weapons', zh: '点台座建造武器' },
  howGuard:   { en: 'Don’t let them reach your grave', zh: '别让它们摸到你的墓' },
  tapUpgrade2:{ en: 'Tap a weapon to upgrade it', zh: '点武器可升级' },
  clickUpgrade2:{ en: 'Click a weapon to upgrade · U', zh: '点击武器升级 · U' },
  clickBuild: { en: 'CLICK A GLOWING SOCKET', zh: '点击发光的台座' },
  clickBuildSub: { en: 'Keys 1–5, then click to place', zh: '按 1–5，再点击放置' },
  clickToStart: { en: 'CLICK TO DEFEND', zh: '点击开始守墓' },
  onThePath: { en: 'ON THE PATH', zh: '亡灵来路' },
  railWait: { en: 'NEXT WAVE', zh: '下一波' },
  clearedBang: { en: 'CLEARED!', zh: '守住了!' },
  takePrize: { en: 'Pick your loot', zh: '挑一件战利品' },
  wave:       { en: 'NIGHT', zh: '夜' },
  score:      { en: 'BANISHED', zh: '已超度' },
  best:       { en: 'BEST',  zh: '最高' },
  gameOver:   { en: 'THEY TOOK YOUR PLOT', zh: '墓位被抢了' },
  again:      { en: 'RISE AGAIN', zh: '再守一次' },
  leaderboard:{ en: 'GRAVE KEEPERS', zh: '守墓传奇' },
  guestbook:  { en: 'EPITAPHS', zh: '墓志铭' },
  newBest:    { en: 'NEW BEST!', zh: '新纪录！' },
  boss:       { en: 'BOSS RISES', zh: '强敌降临' },
  newWeapon:  { en: 'NEW WEAPON', zh: '解锁新武器' },
  wFire:      { en: 'Fire Cannon', zh: '火焰炮' },
  wFrost:     { en: 'Frost Lance', zh: '霜矛' },
  wBone:      { en: 'Bone Mortar', zh: '骨臼炮' },
  wStorm:     { en: 'Storm Coil', zh: '风暴线圈' },
  wPlague:    { en: 'Plague Urn', zh: '瘟疫瓮' },
  range:      { en: 'Range', zh: '射程' },
  dmg:        { en: 'Dmg', zh: '伤害' },
  rate:       { en: 'Rate', zh: '射速' },
  lv:         { en: 'LV', zh: '级' },
  nightClear: { en: 'CLEARED', zh: '守住' },
  nightKills: { en: 'Banished', zh: '超度' },
  nightSouls: { en: 'Souls', zh: '魂' },
  nightCandles:{ en: 'Candles', zh: '蜡烛' },
  chooseOne:  { en: 'Choose one', zh: '三选一' },
  perkHaste:  { en: 'Quickflame', zh: '急火' },
  perkHasteD: { en: 'All weapons attack 15% faster', zh: '全部武器攻速 +15%' },
  perkSight:  { en: 'Long Sight', zh: '远望' },
  perkSightD: { en: 'All weapons gain 10% range', zh: '全部武器射程 +10%' },
  perkEdge:   { en: 'Sharpened', zh: '磨锋' },
  perkEdgeD:  { en: 'All weapons deal 12% more damage', zh: '全部武器伤害 +12%' },
  perkSouls:  { en: 'Soul Tithe', zh: '献魂' },
  perkSoulsD: { en: 'Gain 45 souls now', zh: '立刻获得 45 魂' },
  perkCandle: { en: 'Extra Candle', zh: '续烛' },
  perkCandleD:{ en: 'Light 1 more candle', zh: '蜡烛 +1' },
  perkTithe:  { en: 'Grave Tax', zh: '墓税' },
  perkTitheD: { en: 'Enemies drop 15% more souls', zh: '敌人掉魂 +15%' },
  beginNight: { en: 'SPACE to begin', zh: '按空格开始' },
  bossIn:     { en: 'BOSS IN', zh: '距强敌' },
  bossNow:    { en: 'BOSS NIGHT', zh: '强敌之夜' },
  furthest:   { en: 'FURTHEST', zh: '最远' },
  shards:     { en: 'SHARDS', zh: '碎片' },
  shardsPlus: { en: '+{n} this defence', zh: '本局 +{n}' },
  nextUnlock: { en: 'Next unlock', zh: '下一个解锁' },
  unlockStorm:{ en: 'Storm Coil — reach night 4', zh: '风暴线圈 — 撑到第 4 夜' },
  unlockPlague:{ en: 'Plague Urn — reach night 8', zh: '瘟疫瓮 — 撑到第 8 夜' },
  unlockDone: { en: 'Grave fully warded', zh: '墓地已加护' },
  rank_candle:{ en: 'Warding Candle', zh: '护墓烛' },
  rank_purse: { en: 'Soul Purse', zh: '魂袋' },
  rank_edge:  { en: 'Keen Edge', zh: '利刃' },
  metaCandle: { en: '+1 starting candle', zh: '开局蜡烛 +1' },
  metaPurse:  { en: '+25 starting souls', zh: '开局魂 +25' },
  metaEdge:   { en: '+6% weapon damage', zh: '武器伤害 +6%' },
  metaNext:   { en: 'Applies on the next defence', zh: '下一局生效' },
  maxed:      { en: 'MAX', zh: '已满' },
  keyWeapons: { en: 'weapons', zh: '武器' },
  keyUpgrade: { en: 'upgrade', zh: '升级' },
  keyStart:   { en: 'start night', zh: '开夜' },
  keySpeed:   { en: 'fast', zh: '加速' },
  ghost:      { en: 'Ghosts', zh: '幽灵' },
  ghoul:      { en: 'Ghouls', zh: '尸鬼' },
  skeleton:   { en: 'Skeletons', zh: '骷髅' },
  zombie:     { en: 'Zombies', zh: '僵尸' },
  mummy:      { en: 'Mummies', zh: '木乃伊' },
  vampire:    { en: 'Vampires', zh: '吸血鬼' },
  werewolf:   { en: 'Werewolves', zh: '狼人' },
  elite:      { en: 'Elites', zh: '精英' },
  boneTitan:  { en: 'Bone Titan', zh: '骨巨灵' },
  direWolf:   { en: 'Dire Wolf', zh: '恐狼' },
  speedLabel: { en: 'Speed', zh: '倍速' },
} as const;

export type StrKey = keyof typeof STR;

export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = (STR[key] && STR[key][lang]) || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}
