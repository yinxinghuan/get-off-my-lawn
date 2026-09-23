// Shown only on non-Crazy Games builds when the player is outside Aigram.
// Kept in its own module so the Crazy Games bundle can drop the App Store link.
const ALTERU_APP_URL = 'https://apps.apple.com/app/id6769646546';

function detectLang(): 'zh' | 'en' {
  try {
    const override = alteruLocalStorage.getItem('game_locale');
    if (override === 'zh' || override === 'en') return override;
  } catch { /* ignore */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export default function AlterULeaderboardPrompt() {
  const zh = detectLang() === 'zh';
  return (
    <div className="lb-state lb-state--download">
      <span className="lb-state__icon">🏆</span>
      <span className="lb-state__text">
        {zh ? '在 AlterU 中打开即可查看排行榜' : 'Open in AlterU to view the leaderboard.'}
      </span>
      <a
        className="lb-state__download"
        href={ALTERU_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {zh ? '下载 AlterU' : 'Get AlterU on the App Store'}
      </a>
    </div>
  );
}
