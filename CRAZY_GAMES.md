# Crazy Games build

Get Off My Grave ships two static builds. That is the name players and the Crazy Games portal see (HTML `<title>`, `application-name`, in-game wordmark). Chinese copy stays 滚出我的墓地. The repository and Pages path stay `get-off-my-lawn`.

| | GitHub Pages / other hosts | Crazy Games |
| --- | --- | --- |
| Command | `npm run build` | `npm run build:crazygames` |
| Output | `dist/` | `dist-crazygames/`, copied to `artifacts/crazygames/` |
| Upload zip | — | `artifacts/get-off-my-lawn-crazygames.zip` (`index.html` at the zip root) |
| Asset paths | relative (`./`) | relative (`./`), safe for iframe hosting |
| AlterU / Aigram | optional; active when the host passes a session (guest shell or `api_origin` + `telegram_id`) | **off**. Guests play immediately. No login wall and no App Store link |

## Guest play

Crazy Games requires that guests can play and that the game does not add its own login (including AlterU / Aigram) before play. This build:

- Starts on the attract screen. Tap to defend. There is no account screen.
- Strips AlterU guest-shell scripts (`images.aiwaves.tech/alteru` and `alteru.app`) from `index.html`. The default build still loads the guest shell.
- Removes `#alteru-guest-banner`, login, and coupon hosts if one is injected, so no AlterU or Aigram mark is visible.
- Saves the best score in `localStorage` on the device (via the existing scoped storage adapter).
- Opens the leaderboard as a local note (“best score stays on this device”) instead of “Open in AlterU” / the App Store.
- Does not treat Crazy Games query parameters as an Aigram session.

The default `npm run build` path is unchanged for GitHub Pages and any AlterU/Aigram embed. Its layout stays the phone HUD (score on top, weapons along the bottom) at every window size.

## Landscape iframe

Crazy Games reviewers play in a landscape 16:9 iframe. On that guest build only, a wide viewport (`width > height`, at least 800×460) uses a desktop frame:

- The orthographic camera zooms so the cemetery fills the iframe, and during a fight the lane sits between the side columns.
- Lives, banished, night, boss countdown, shards, and souls sit in a left rail. Weapons stack in a right rail with keys `1–5`, `U` on the stat plate, `Space` on the rail, and `F` on the speed button. Hover states are on the weapon, perk, and rank buttons.
- The night banner, the three perk cards, and the game-over card are laid out across the playfield.
- A portrait guest iframe (and every host build) keeps the original phone layout. Resizing the window switches between the two.

The Pages workflow publishes this guest build next to the root site, without replacing it:

https://yinxinghuan.github.io/get-off-my-lawn/crazygames/

Progress sync through the Crazy Games SDK Data module is not wired up. Local best score is enough for this version. Grave shards, the furthest night, and the permanent ranks (candle, purse, edge) stay in the same on-device storage.

## Audio

Music and sound effects are synthesized in the browser. There are no sampled recordings. See `doc/audio.md`.

## Build the upload package

```bash
npm ci
npm run build:crazygames
```

Upload `artifacts/get-off-my-lawn-crazygames.zip` in the Crazy Games developer portal. Do not submit from this repository’s automation.

`artifacts/crazygames/` is the same unpacked folder (`index.html` plus `./assets/...`) if you need to preview it:

```bash
npx --yes serve artifacts/crazygames
```
