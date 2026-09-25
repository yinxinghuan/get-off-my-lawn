# Crazy Games audio

The AlterU host build (`npm run build`) still synthesizes every voice in `src/Lawn/audio.ts`. It does not fetch these files.

The Crazy Games guest build (`npm run build:crazygames`) redirects `./audio` to `src/Lawn/audio-cg.ts` and plays the files below. Sound effects stay synthesized. Playback starts only after the first pointer gesture. Mute and master volume are stored under `gol_cg_audio_v1` (scoped `alteruLocalStorage`). Music pauses while `document.hidden` is true.

Shipped files are loudness-normalized derivatives (trailing silence trimmed, an 8 ms loop crossfade on the beds, Vorbis). CC0 1.0 allows that. Total size is about 2.5 MB.

| File | Role | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `src/Lawn/audio/cg/night.ogg` | Looping night battle | [Haunting Chiptune Loop (Void Estate), haunted-arcade mix](https://opengameart.org/content/haunting-chiptune-loop-void-estate) · [ogg](https://opengameart.org/sites/default/files/void_estate_haunted_arcade_0.ogg) | Zane Little Music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `src/Lawn/audio/cg/boss.ogg` | Looping boss bed | Same page, clean mix · [ogg](https://opengameart.org/sites/default/files/void_estate_0.ogg) | Zane Little Music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `src/Lawn/audio/cg/menu.ogg` | Title loop, after a gesture that does not immediately start the defence | [Creepy Ambient Loop](https://opengameart.org/content/creepy-ambient-loop) · [ogg](https://opengameart.org/sites/default/files/creepyloop-v2_0.ogg) | epb9000 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `src/Lawn/audio/cg/clear.ogg` | Night-clear sting | [Victory sting](https://opengameart.org/content/victory-sting) · [ogg](https://opengameart.org/sites/default/files/victory%20sting_0.ogg) | congusbongus | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `src/Lawn/audio/cg/over.ogg` | Game-over sting | [Game Over IV](https://opengameart.org/content/game-over-iv) · [mp3](https://opengameart.org/sites/default/files/game_over_iv_0.mp3) | Kistol | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Gains (linear, into the music bus) were chosen from measured integrated loudness so the beds sit near −26 LUFS and the stings near −20 LUFS: night `0.62`, boss `0.75`, menu `0.76`, stings `0.78`. The night-clear sting ducks the bed to 28% until it ends or the next march starts. Synthesized effects use the same oscillator levels as the host, on a unity bus, so their peaks land near −14 dBFS.
