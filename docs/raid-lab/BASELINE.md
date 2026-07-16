# Raid Lab — Baseline

Recorded: 2026-07-16

## Tooling baseline

| Check | Result |
|---|---|
| `npm run typecheck` | pass (client + server + test) |
| `npm test` | 754 pass, 0 fail, 1 skipped, 755 total, ~22s |

Skipped test count is pre-existing; not introduced by raid-lab.

## Existing harness / telemetry inventory

| Asset | Role |
|---|---|
| `server/WorldSessionBalanceTelemetry.ts` | Engagement gaps, loot acquired/secured, kills by danger band, death cause |
| `server/WorldSessionRaidResults.ts` | SURVIVED / DEAD / MIA / LEFT coercion via `RaidRules` |
| `src/raid/RaidRules.ts` | Town arrival / leave result rules |
| `tests/net/world-session-harness.ts` | Debug accessors for players/actors/enemies/scenario |
| `tests/net/world-session.test.ts` | Authoritative join/tick/intent/leave/loot coverage |
| `tests/net/world-session-balance-telemetry.test.ts` | Telemetry grouping unit tests |
| `tests/field/world-engine-harness.ts` | Client WorldEngine harness (not used for mass sim) |
| `tests/raid/world-raid-session.test.ts` | Client raid session timer/events |

## Non-deterministic boundaries (gameplay-affecting)

See also the catalog section in `PROGRESS.md` (kept in sync).

### Must control for deterministic lab digests

| Boundary | Location | Default | Lab injection |
|---|---|---|---|
| Session epoch / nest seed | `WorldSession` constructor `sessionEpoch` | `Date.now()` | Fixed from lab seed |
| Combat hit / variance / crit | `CombatFormulas` via `WorldSessionCombatResolution`, `WorldSessionEnemyTurnResolver` | `Math.random` | `WorldSessionOptions.random` |
| Skill effect rolls | `SkillEffectResolver` via `WorldSessionSkillResolver` | `Math.random` | same `random` |
| Scenario field-event RANDOM | `WorldSessionScenarioRewards.rollFieldEventRandom` | `Math.random` | same `random` |
| Resume token text | `createToken` in join | `Date.now` + `Math.random` | `WorldSessionOptions.createToken` |

### Already deterministic (seeded from sessionEpoch / content)

| Boundary | Notes |
|---|---|
| Raid modifier | `rollRaidModifier(sessionEpoch:shard:hub:playerId)` |
| Field nests / packs | `SpawnResolver` mulberry32 from `server:${sessionEpoch}` |
| Chunk / world gen | Deterministic from map algorithms |
| Marked cache / supply drop placement | Content spawner uses session epoch + tiles |

### Non-gameplay / out of lab scope

| Boundary | Why ignored for raid digests |
|---|---|
| Auth JWT / refresh tokens | Not on raid sim path |
| Market session `Math.random` | Separate market service |
| AtomicFile temp names | Persistence I/O only |
| Client presentation RNG (camera shake, VFX, audio) | Browser-only; not used by lab |
| Server metrics `Date.now` gauges | Observability only |

## Experiment result schema

Canonical schema: `docs/raid-lab/schema/experiment-result.schema.json`

Minimum fields: `labVersion`, `seed`, `policy`, `result`, `elapsedSeconds`,
`kills`, `telemetry`, `actions`, `invariantViolations`, `digest`.
