# Audio sources

Get Off My Grave does not ship recorded music or sampled sound effects.

Every voice is synthesized in the browser with the Web Audio API (`src/Lawn/audio.ts`):

- **Sound effects** — short oscillators and noise bursts (place, upgrade, shots, impacts, UI).
- **Night bed** — original A-minor drone (sine / triangle), a quiet band-passed noise wind, and a slow pentatonic bell line. Look-ahead scheduled, not a sample.
- **Boss bed** — original lower, slightly detuned drone with a faster minor pattern and a soft noise tick.

No third-party recording is included, so no CC0 (or other) sample license applies. The music and effects are original to this project and generated procedurally at runtime.

Volumes sit on two buses under one compressor: sound effects are attenuated so impacts do not clip, and the music bed stays under the effects.
