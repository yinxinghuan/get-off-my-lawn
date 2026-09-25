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

## Guest theme

The Crazy Games build adds the class `gol--cg` and restyles only that tree. The host build never sets the class, so its glass HUD is unchanged.

- Panels use a weathered stone gradient, an iron border, and a small inline noise texture. The attract call-to-action and the primary button are an old wood sign. No external image assets.
- Titles and numbers use GraveMark, a locally bundled unmodified copy of Creepster (SIL OFL 1.1, reserved name Creepster, `src/Lawn/fonts/OFL.txt`). The CSS family name is GraveMark so the host Google Fonts link is untouched. Body copy stays Archivo.
- Perk cards have a vector mark, a rarity stripe, hover lift, and keys `1` `2` `3` while the pick is open.
- Souls, shards, and banished pop when the value changes. The night banner, perk modal, upgrade plate, and game-over card fade or rise in.
- While placing, only the pad under the cursor draws a range ring. A built weapon's ring shows only while that pad is hovered.
- Locked weapons keep their night label and wear a chain ornament instead of a flat grey wash.

The first guest defence runs a five-step coach (place, start the night, upgrade, 2× speed, perk pick). It is stored in `localStorage` (`gol_tutorial_done`) and stays off after Skip or a finished pick. Attract and the game-over card offer Replay tutorial. The host build never shows it. While the place and start steps are up, night 1 does not auto-walk in; every later night still uses the normal countdown.

The guest panels are a cartoon graveyard HUD on one frame: purple fill, a 3px black outline, an 8/12px radius, and a hard `0 3px 0` shadow. Gold is reserved for the selected card, key numbers, and the “CLEARED!” fanfare. Captions are dim. Counts use Archivo tabular figures; Creepster stays on the logo, the score, and the fanfare. Weapon, perk, soul, and shard marks share one 24px stroke. The left column’s middle card is a shaded tombstone plus who is on the path, the boss countdown, and shards — the score plate does not repeat the boss. Night banner, unlock, and the upgrade hint share one top slot and, on desktop, sit in a sky band above the graves. Desktop copy says “click”. Portrait guests keep “tap” and the phone layout.

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
