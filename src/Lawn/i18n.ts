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
  title:      { en: 'GET OFF MY LAWN', zh: '滚出我的草坪' },
  tapToStart: { en: 'TAP TO DEFEND',   zh: '点击开始守卫' },
  tapPlant:   { en: 'TAP A PATCH TO PLANT A SPRINKLER', zh: '点空地放洒水器' },
  tapUpgrade: { en: 'TAP IT AGAIN TO UPGRADE',          zh: '再点一下升级' },
  wave:       { en: 'WAVE',  zh: '波次' },
  score:      { en: 'REPELLED', zh: '已击退' },
  best:       { en: 'BEST',  zh: '最高' },
  gameOver:   { en: 'THEY TOOK THE LAWN', zh: '草坪失守了' },
  again:      { en: 'DEFEND AGAIN', zh: '再守一次' },
  leaderboard:{ en: 'LAWN LEGENDS', zh: '草坪传奇' },
  guestbook:  { en: 'YARD TALK', zh: '院子留言' },
  newBest:    { en: 'NEW BEST!', zh: '新纪录！' },
};

export function t(key: keyof typeof STR): string {
  return (STR[key] && STR[key][lang]) || key;
}
