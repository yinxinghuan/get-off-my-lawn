// Lightweight i18n — English default (platform faces US/English users), zh optional.
type Lang = 'en' | 'zh';

function detect(): Lang {
  const o = localStorage.getItem('game_locale');
  if (o === 'en' || o === 'zh') return o;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let lang: Lang = detect();
export function getLang(): Lang { return lang; }

const STR: Record<string, { en: string; zh: string }> = {
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
};

export function t(key: keyof typeof STR): string {
  return (STR[key] && STR[key][lang]) || key;
}
