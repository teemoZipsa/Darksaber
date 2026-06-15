# Monster Data and Balance

## Current Model

Monster data is split into three layers:

1. **Original ledger**: `src/data/original/originalMonsters.ts`
   - Reads every original monster-like `ability.json` row with `classId >= 200`.
   - Keeps 451 original raw rows available for lookup and reporting.
   - Accepts ids as `302`, `302R`, or `302r`.

2. **Renderable catalog**: `src/data/MonsterCatalog.ts`
   - Contains only monsters this project can render.
   - `GENERAL_MONSTER_IDS` and `NEW_MONSTER_IDS` are authored field-spawn pools.
   - `RESERVED_RENDERABLE_MONSTER_IDS` are renderable but intentionally not automatic field spawns.

3. **Combat normalization**: `src/data/original/originalMonsterBalance.ts`
   - Converts original raw values to this game's combat scale.
   - Level drives the main curve.
   - Original raw values preserve relative ordering within that curve.
   - Custom early story boss ids alias back to original special boss rows:
     `burgos_wolf_boss` → `701R` (키스라), `zamora_fenris_boss` → `702R` (펜리스).
   - Missing original rows, currently limited in story scenarios to authored 600-series sprites
     `634R`~`639R`, use the previous formula as fallback.

## Why Raw Stats Are Not Used Directly

The original client's monster stats are on a different combat scale. For example,
low original monster rows can have `atk` around 105 while a fresh original-backed
fighter has `atk` 65. This project's physical formula is closer to:

```text
damage = atk - floor(def / 2)
```

Using raw original values directly would make starter monsters overpower early
characters. The normalization layer keeps the original ordering without importing
the original numeric scale verbatim.

## Spawn Application

`Enemy` accepts an optional `monsterId`.

- With `monsterId`: base stats come from `getNormalizedMonsterBalance(monsterId, level)`.
- Without `monsterId`: base stats use the fallback formula.
- Role tuning (`tank`, `archer`, `boss`, etc.) still applies after base stat creation.

Applied paths:

- Server scenario enemies: `server/WorldSession.ts`
- Server field nests: `server/WorldSession.ts`
- Local story interiors: `src/engine/world/WorldStoryScenarioController.ts`

Network clients receive authoritative enemy stats from server snapshots, so they
do not recompute server enemy balance locally.

## Story Monster Layouts

Story scenario monster ids live in `src/data/StoryScenarioMonsterData.ts`.
Both the server and local `WorldStoryScenarioController` use this shared table,
so scenario guards and bosses stay aligned across online and local story-interior entry.

## Tests

Relevant guards:

- `tests/field/original-monster-balance.test.ts`
- `tests/field/entity.test.ts`
- `tests/field/burgos-dungeon.test.ts`
- `tests/field/spawn-resolver.test.ts`
- `tests/net/world-session.test.ts`
- `tests/raid/data-guards.test.ts`

Expected validation before committing:

```powershell
npx tsc --noEmit
npm test
```
