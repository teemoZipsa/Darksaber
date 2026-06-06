# 원작 시나리오 이식 노트

## Source Root

- Local source root: `C:\Users\Seonkyu\Downloads\saver200010_extracted\Saver_Files\Saver`
- Event/script candidates: `Glib/gscene*.lsc`, `Wlib/scene*.lsc`
- Map candidates: `MAP/*.mrc`, `MAP/*t.mrc`, `MAP/*hmap.bmp`, `MAP/*set.arc`
- Text/name candidates: `MAP/*set.arc` members (`*.DEO`, `*.evt`, `*.srf`), `gameres/duty.arc`, `Glib/GameLib.ltn`, `Glib/GameLib.lnm`, `Glib/GameLib.lce`

## Import Policy

- Indoor story dungeons should follow original map structure, doors, blocked paths, boss positions, and event order as closely as the current combat model allows.
- Outdoor story missions should prefer original coordinates/hmaps first, then adjust only where the current world map would break movement or combat.
- Dialogue is keyed separately from event flow. Burgos v1 scenario lines use original CP949 text extracted from `MAP/01set.arc` (`01.DEO`, `01.evt`, `01.srf`).
- Burgos local inspect events record original event item outcomes as raid-scoped runtime flags (`burgos_key`, `cain_necklace`) during the raid. On survival, those flags are promoted into persistent `PlayerData.questItems` (`quest_burgos_key`, `quest_cain_necklace`); on raid failure they are discarded with the session.
- Burgos throne-room seal at `{ x: 27, y: 9 }` is locked in local story-interior play until the raid has `burgos_key` or the player owns persistent `quest_burgos_key`.
- Burgos survivor and Cain's son inspect markers are generated from `StoryScenarioFieldEvent.triggerTiles` and disappear once the corresponding runtime flag or persistent quest item exists.
- Cain's necklace is shown as an Episode 1 optional quest objective while held as the in-raid `cain_necklace` flag or persistent `quest_cain_necklace`.
- Zamora v1 entry flow uses original CP949 text extracted from `MAP/02set.arc` (`02.DEO`). The scenario goal is princess rescue, while the tactical combat condition remains defeating Fenris. The captive princess marker is shown in the Fenris chamber until the in-raid `princess_rescued` flag is set.
- Zamora `02.evt` chest events 01-04 grant 100 gold each. Events 05-08 use original `GETITEM 300`; v1 maps that reward to `herb_common` until the original item id table is confirmed.
- Etna v1 map analysis uses `MAP/03.mrc`, `MAP/03hmap.BMP`, and `MAP/03set.arc` metadata. The current interior pass is a vertical lava-cave route with lava blocked paths, choke doors, and Ganomas placed in the upper lair. Entry dialogue uses original `03.DEO` text, and `03.evt` chest events 01-08 are connected as local inspect events.
- Episodes 4-6 are outdoor/field scenarios. Their v1 event data keeps the original `DEO` entry dialogue and `evt` reward/objective events, but field placement is adapted to the current world map instead of forcing original coordinates. Inspect events are projected from original map coordinates onto deterministic walkable tiles around each current scenario entrance.
- Network outdoor field events are server-authoritative: clients send only the selected event id, while `server/WorldSession.ts` validates distance/completion and returns the approved presentation steps and rewards. Completion flags are split into viewer-specific `player` scope and session-wide `shared` scope; true party-id progression is intentionally deferred.
- Tests should validate event order, key presence, and counts, not snapshot full original dialogue.

## Tooling

- `scripts/scan-original-scenario.mjs` scans `.lsc` files as little-endian 4-byte words and emits JSON summaries.
- `scripts/extract-original-arc.mjs` extracts text-like members from `gameres/duty.arc` and `MAP/*set.arc` into `outputs/original_arc_unpacked` by default.
  - Example: `node scripts/extract-original-arc.mjs`
  - Use `--manifest-only` to inspect archive tables without unpacking files.
  - Use `--all` only when bitmap/audio members are needed.
- `scripts/analyze-original-burgos-map.mjs` extracts and summarizes `MAP/01.mrc`, `01t.mrc`, `01hmap.BMP`, and `01set.arc` into `outputs/original_burgos_map_analysis/burgos-map-summary.json`.
- `scripts/analyze-original-story-map.mjs --episode N` extracts and summarizes any numbered `MAP/NN.mrc`, `NNt.mrc`, `NNhmap.BMP`, and `NNset.arc` into `outputs/original_story_map_analysis/NN/NN-map-summary.json`.
- Original `.arc` files use the `0901` archive table. For Burgos dialogue verification, `Compress.dll` exports (`OpenArcFile`, `UnpackAFile`, `GetPointer`, `GetBuf2Size`) were used from 32-bit PowerShell to unpack CP949 text members.
- The scanner reports byte/word counts, stable hashes, opcode candidates, coordinate candidates, text-reference candidates, scene-reference candidates, and `MAP` file manifest entries.
- The scanner is intentionally descriptive only; it does not rewrite game data.

## Episode Mapping

| Episode | Dungeon | Status | Scene Candidate | Global Candidate | Map Candidates | Notes |
|---|---|---|---|---|---|---|
| 1 | `burgos_castle` | verified-v1 | `Wlib/scene1.lsc` | `Glib/gscene1.lsc` | `MAP/01.mrc`, `MAP/01t.mrc`, `MAP/01hmap.BMP`, `MAP/01set.arc` | v1 layout split into gatehouse, barracks, great hall, inner keep, and throne room. Entry sequence uses `01.DEO`; Cain's son/key handoff are connected as local `01.evt` inspect events. Doors and blocked paths are represented in layout metadata. |
| 2 | `zamora_fortress` | event-v1 | `Wlib/scene2.lsc` | `Glib/gscene2.lsc` | `MAP/02.mrc`, `MAP/02t.mrc`, `MAP/02hmap.BMP`, `MAP/02set.arc` | `02.mrc`/`02t.mrc` are 40x40 and `02hmap.BMP` is 138x138. `02set.arc` contains `02.DEO`, `02.evt`, `02.srf`, `02A.DEE`, and `02B.DEE`; v1 layout is split into gatehouse, crypt wings, cross hall, ramparts, central keep, and Fenris chamber. Entry sequence uses `02.DEO`; objective text is princess rescue and combat condition is Fenris defeat. Chest events 01-08 are connected as local inspect events. |
| 3 | `etna_volcano` | event-v1 | `Wlib/scene3.lsc` | `Glib/gscene3.lsc` | `MAP/03.mrc`, `MAP/03t.mrc`, `MAP/03hmap.BMP`, `MAP/03set.arc` | `03.mrc` is 50x65 and `03hmap.BMP` is 138x138. `03set.arc` contains `03.ai`, `03.DEE`, `03.DEO`, `03.srf`, and `03.evt`; v1 layout is a vertical volcano cave with lower tunnel, steam vent, ash shelf, magma bridge, upper tunnel, and Ganomas lair. Entry sequence uses original `03.DEO`; `03.evt` events 01-08 include four `GOLD 100` and four `GETITEM 300` chest events, and `EVENT 54` is represented in the Ganomas defeat sequence while permanent sword reward remains gated by raid survival. |
| 4 | `arcadia_plain` | event-v1 | `Wlib/scene4.lsc` | `Glib/gscene4.lsc` | `MAP/04.mrc`, `MAP/04t.mrc`, `MAP/04hmap.BMP`, `MAP/04set.arc` | `04.mrc`/`04t.mrc` are 40x40 and `04hmap.BMP` is 138x138/8bpp. `04set.arc` contains `04.DEE`, `04.DEO`, `04.ai`, `04.evt`, and `04.srf`; entry sequence uses original `04.DEO`, chest events 01-06 include four `GOLD 100` and two `GETITEM 300`, `EVENT 18` records Eria's child rescue, and Eurytion defeat uses `EVENT 24`. Field inspect events are mapped around the current Arcadia entrance. |
| 5 | `cacaora_highland` | event-v1 | `Wlib/scene5.lsc` | `Glib/gscene5.lsc` | `MAP/05.mrc`, `MAP/05t.mrc`, `MAP/05hmap.BMP`, `MAP/05set.arc` | `05.mrc`/`05t.mrc` report 50x4 through the legacy header and `05hmap.BMP` is 138x138/8bpp. `05set.arc` contains `05.DEE`, `05.DEO`, `05.ai`, `05.evt`, `05.srf`, and `05.evt.BAK`; entry sequence uses original Minotaur dialogue, chest events include two `GOLD 100`, a rusted sword event, and `GETITEM 305` mapped to `mp_potion`. Field inspect events are mapped around the current Cacaora entrance. |
| 6 | `remote_village` | event-v1 | `Wlib/scene6.lsc` | `Glib/gscene6.lsc` | `MAP/06.mrc`, `MAP/06t.mrc`, `MAP/06hmap.BMP`, `MAP/06set.arc` | `06hmap.BMP` is 138x138/8bpp and `06set.arc` contains `06.evt`, `06.AI`, `06.dee`, `06.deo`, and `06.srf`; entry sequence uses original village/temple-gate text, villager aid events 01-02 are represented as inspect data, `EVENT 10` records dark-root removal, and Pachi defeat uses the original `CHARDEAD 700` clear event. Field inspect events are mapped around the current Remote Village entrance. |
| 7 | `sagrajas_temple` | candidate | `Wlib/scene7.lsc` | `Glib/gscene7.lsc` | `MAP/07.*` | Indoor temple layout. |
| 8 | `sagunto_port` | candidate | `Wlib/scene8.lsc` | `Glib/gscene8.lsc` | `MAP/08.*` | Outdoor/port adaptation. |
| 9 | `sicilio_island` | candidate | `Wlib/scene9.lsc` | `Glib/gscene9.lsc` | `MAP/09.*` | Outdoor/island adaptation. |
| 10 | `dalai_lake` | candidate | `Wlib/scene10.lsc` | `Glib/gscene10.lsc` | `MAP/10.*` | Outdoor/lake adaptation. |
| 11 | `oasis` | candidate | `Wlib/scene11.lsc` | `Glib/gscene11.lsc` | `MAP/11.*` | Outdoor/oasis adaptation. |
| 12 | `pyramid_front` | candidate | `Wlib/scene12.lsc` | `Glib/gscene12.lsc` | `MAP/12.*`, `MAP/1200.*` | Outdoor/front approach. |
| 13 | `pyramid_inside` | candidate | `Wlib/scene13.lsc` | `Glib/gscene13.lsc` | `MAP/13.*`, `MAP/1300.*` | Indoor pyramid layout. |
| 14 | `skeria` | candidate | `Wlib/scene14.lsc` | `Glib/gscene14.lsc` | `MAP/14.*` | Outdoor adaptation. |
| 15 | `skeria_2` | candidate | `Wlib/scene15.lsc` | `Glib/gscene15.lsc` | `MAP/15.*`, `MAP/1500.*` | Outdoor adaptation. |
| 16 | `valhalla_plain` | candidate | `Wlib/scene16.lsc` | `Glib/gscene16.lsc` | `MAP/16.*` | Outdoor adaptation. |
| 17 | `airship` | candidate | `Wlib/scene17.lsc` | `Glib/gscene17.lsc` | `MAP/17.*` | Vehicle mission. |
| 18 | `ament_gate` | candidate | `Wlib/scene18.lsc` | `Glib/gscene18.lsc` | `MAP/18.*` | Indoor Ament entrance. |
| 19 | `ament_1f` | candidate | `Wlib/scene19.lsc` | `Glib/gscene19.lsc` | `MAP/19.*` | Indoor Ament 1F. |
| 20 | `ament_2f` | candidate | `Wlib/scene20.lsc` | `Glib/gscene20.lsc` | `MAP/20.*`, `MAP/2000.*` | Indoor Ament 2F. |
