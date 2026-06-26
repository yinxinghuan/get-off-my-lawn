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
  tapUpgrade: { en: 'TAP IT AGAIN TO STOKE THE FLAME', zh: '再点一下旺火' },
  wave:       { en: 'NIGHT', zh: '夜' },
  score:      { en: 'BANISHED', zh: '已超度' },
  best:       { en: 'BEST',  zh: '最高' },
  gameOver:   { en: 'THEY TOOK YOUR PLOT', zh: '墓位被抢了' },
  again:      { en: 'RISE AGAIN', zh: '再守一次' },
  leaderboard:{ en: 'GRAVE KEEPERS', zh: '守墓传奇' },
  guestbook:  { en: 'EPITAPHS', zh: '墓志铭' },
  newBest:    { en: 'NEW BEST!', zh: '新纪录！' },
};

export function t(key: keyof typeof STR): string {
  return (STR[key] && STR[key][lang]) || key;
}
