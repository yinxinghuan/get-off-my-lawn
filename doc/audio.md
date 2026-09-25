# Audio sources

The AlterU host build does not ship recorded music or sampled sound effects.

Every voice in that build is synthesized in the browser with the Web Audio API (`src/Lawn/audio.ts`):

- **Sound effects** — short oscillators and noise bursts (place, upgrade, shots, impacts, UI).
- **Night bed** — original A-minor drone (sine / triangle), a quiet band-passed noise wind, and a slow pentatonic bell line. Look-ahead scheduled, not a sample.
- **Boss bed** — original lower, slightly detuned drone with a faster minor pattern and a soft noise tick.

No third-party recording is included in the host build, so no CC0 (or other) sample license applies there. That music and those effects are original to this project and generated procedurally at runtime.

Volumes sit on two buses under one compressor: sound effects are attenuated so impacts do not clip, and the music bed stays under the effects.

The Crazy Games guest build replaces that module with recorded CC0 music and keeps the synthesized effects. Sources, licences, and the level match are in `doc/cg-audio.md`.
