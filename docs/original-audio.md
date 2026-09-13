# Recovered original audio

The game uses the existing files in `public/assets/sounds/original` and
`public/assets/sounds/bgm`. No recovered files were edited or replaced.

## Music

There are 21 MIDI files but only seven byte-distinct tracks. The groups below
were checked with SHA-256. Story episode mappings remain as they were; the
general scene assignments are an inferred arrangement for this restoration,
not evidence of where the original game played each track.

| File / embedded name | Identical story files | General scene assignment |
| --- | --- | --- |
| story/01.mid / NCG01 | 01, 11 | Title |
| story/02.mid / NCG03 | 02, 07, 12, 17, 18 | Nearby field combat |
| story/03.mid / NCG04 | 03, 08, 13 | Cave, dangerous terrain, defeat |
| story/04.mid / NCG05 | 04, 06, 14, 16 | Open field exploration |
| story/05.mid / NCG07 | 05, 10, 15, 20 | Forest, snow, successful return |
| story/09.mid / NCG10 | 09, 19 | Nearby boss |
| tutorial/Sh-Fil2.mid | Separate track | Town, training tutorial |

Episodes 21–31 retain the existing episode-20 fallback because separate assets
have not been recovered. Story interiors keep their episode music during combat.

`GameManager` owns one `GameMusic` controller. It reads `WorldEngine.getMusicKey()`
after each update. Result, tutorial, town and story music take priority over
terrain/combat music. Ambient changes must persist for 2.5 seconds; transitions
crossfade for 900 ms. Aliases of the same MIDI continue without restarting and
share one decoded buffer. An older decode cannot override a newer scene request.

MIDI contains musical instructions, not recorded instrument audio. The existing
`MidiSynth` uses Web Audio oscillators; the melodies are recovered, but its
instrument/drum timbres do not reproduce the original General MIDI sound source.

## Effects

All 20 recovered WAV files have active gameplay aliases. Numbered magic aliases
reuse the previous catalog's `MagicPtn.atr` interpretation. The additional
gameplay assignments below are inferred; the original data source was not
available to recheck those labels during this integration.

| WAV | Gameplay assignment |
| --- | --- |
| 00 | Fire magic |
| 01 | Loot pickup, purchases and sales |
| 02 | Ice magic |
| 03 | Blizzard, metal impact |
| 04 | Opening loot, entering town (low confidence) |
| 05 | Thunder magic |
| 06 | Wind cutter |
| 07 | Weapon swing / physical hit |
| 08 | Tornado |
| 09 | Quake |
| 10 | Miss (low confidence) |
| 12 | Drain |
| 15 | Meteor / atomic wave, critical impact |
| 17 | Status magic |
| 18 | Mute |
| 19 | Resist / anti-resist |
| 20 | Protection |
| 21 | Buff, level-up |
| 22 | Quick / poison |
| 24 | Healing magic, recovery item, clinic treatment |

Existing small UI/equipment WAVs and procedural footsteps remain in use.
Identical effects share a short playback throttle; at most 12 simultaneous
one-shot voices play. Stale effects and effects triggered while the browser
audio context is suspended are discarded. BGM and effects follow existing
settings, including unmuting after changing scenes.

## Local verification

- `npm run verify:assets`: required audio files and gameplay references.
- `tests/field/audio-manager.test.ts`: asynchronous music changes, alias reuse,
  mute-independent track gain, voice throttling and suspended effects.
- `tests/field/burgos-dungeon.test.ts`: local/network story music through episode 31.
- `tests/e2e/original-audio.spec.ts`: desktop/mobile first gesture unlock, all
  recovered sound buffers, nonzero mixed signal, mute/unmute across scene changes.
  This measures audio output; it is not a listening comparison with the original.
