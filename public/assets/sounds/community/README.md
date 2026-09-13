# Supplementary game audio

Selected on 2026-09-13 to fill missing sound roles around the recovered Darksaber
audio. These 19 files use CC0 1.0, as stated on the creator's asset pages and in
the included archive license files. Commercial use and adaptation are permitted
by [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en).

| Creator / source | Included use |
| --- | --- |
| [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | Nine grass, hard-ground and snow step variations; metal repair hit |
| [Kenney — RPG Audio](https://kenney.nl/assets/rpg-audio) | Book open/close, metal click for gem removal |
| [Kenney — Music Jingles](https://kenney.nl/assets/music-jingles) | Rising/descending pizzicato cues for completion and defeat |
| [Juhani Junkala / SubspaceAudio — JRPG Pack 2 Towns](https://opengameart.org/content/jrpg-pack-2-towns) | Home Town, Sunshine Coast, Bazaar |
| [Juhani Junkala / SubspaceAudio — JRPG Pack 1 Exploration](https://opengameart.org/content/jrpg-pack-1-exploration) | Tha'el Mines |

## Game assignments

- `village.ogg`: Belfuers and Southern Refuge.
- `port.ogg`: Sicilio and Arikna.
- `desert.ogg`: Desert Outpost and sandy field terrain. The same buffer continues
  across these two scene aliases without restarting.
- `mines.ogg`: Non-story dungeon exploration; combat retains recovered music.
- Steps rotate three variants per surface, with a small pitch variation and low
  playback volume. Wet ground retains the existing procedural splash.
- Repair/unsocket cues follow successful blacksmith operations. Journal opening
  and closing use the book sounds. Empty routine returns have no completion cue.
- Recovered title, main field, combat, boss, tutorial and episode music remain.

Selection is based on the creators' JRPG/foley descriptions and signal analysis,
not a claim of matching original instrument samples. Music has been reduced to
approximately -28 dBFS RMS, close to the recovered town MIDI's rendered level.
One-shot WAVs have peaks normalized to -8 dBFS, then use lower runtime gains.
Full music lengths are retained for looping; no sections were rearranged.

`manifest.json` records every original archive member, download URL, creator,
archive/source/output SHA-256 and processing settings. `LICENSE-*.txt` are copied
from the downloaded source archives. These licenses apply only to the community
files in this folder; the recovered original game assets have separate provenance.
