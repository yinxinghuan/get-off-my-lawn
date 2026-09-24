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

The default `npm run build` path is unchanged for GitHub Pages and any AlterU/Aigram embed.

The Pages workflow publishes this guest build next to the root site, without replacing it:

https://yinxinghuan.github.io/get-off-my-lawn/crazygames/

Progress sync through the Crazy Games SDK Data module is not wired up. Local best score is enough for this version.

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
