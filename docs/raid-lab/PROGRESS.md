# Raid Lab — Progress

## Batch 2026-07-16b — Phase 2 extract path + clustering + 100-seed cohort

### Experiments run

- Extract-path fix (staged waypoints + shared WorldMap + no per-tick snapshots)
- Failure/outcome clustering in cohort reports
- Re-run balanced smoke seeds `0..99` (labVersion 2)
- Cautious SURVIVED regression test (seed 3 → `e_stronghold`)

### Seed range

- Determinism / SURVIVED regression: seeds covered by `tests/raid/raid-lab-determinism.test.ts`
- Smoke: seeds `0..99`, policy `balanced`, maxActions `1500`

### Outcome ratios (smoke 0..99 / balanced / labVersion 2)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 84 | 84.0% |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 16 | 16.0% |

- mean elapsedSeconds: **52.12**
- mean kills: **1.14**
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md`

### Invariant violations

- total: **0**

### Minimal reproductions / clusters

- Highest non-survive cluster: `stopReason=max_actions` / `LEFT` (16/100)
  - sample seeds: 6, 25, 29, 34, 37, 58, 62, 64
- No DEAD/MIA/invariant clusters in this cohort

### Tests added/updated

- `tests/raid/raid-lab-determinism.test.ts`
  - cautious extract seed 3 must `SURVIVED` at `e_stronghold`

### Code changed

- Staged waypoint routing (`scripts/raid-lab/pathing.ts`) to escape greedy dead-ends
- Extract phase in policies (hunt then extract; bypass nearby threats)
- Shared WorldMap + debug loot reads (faster cohort runs)
- Cohort clustering in `report.ts` / progress prints in CLI
- `RAID_LAB_VERSION = 2`
- npm script `raid-lab:cohort1k`

### Verification commands

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `node --import tsx --test tests/raid/raid-lab-determinism.test.ts` | 4 pass |
| `npm run raid-lab:smoke` | SURVIVED 84 / LEFT 16 / invariants 0 (~1247s) |

### Next work queue

1. Finish 1,000-seed cohort (`npm run raid-lab:cohort1k`) and compare against this 100-seed baseline
2. Shrink `max_actions` LEFT seeds (6, 25, …) — path traps vs combat delays
3. Add DEAD/MIA stress cohort (forced low HP / denser nests) once LEFT cluster is reduced
4. Keep regression seeds for any new invariant violations before fixes

---

## Batch 2026-07-16 — Phase 0 + Phase 1 minimal deterministic raid

See git commit `402589a` / earlier section in git history. Baseline LEFT-heavy 100-seed cohort was labVersion 1 before extract routing.

---

## Non-deterministic boundary catalog (living)

1. **sessionEpoch** — nest/loot/content seed root (`WorldSession`)
2. **CombatFormulas RNG** — physical hit/variance/crit; magic hit/variance
3. **SkillEffectResolver RNG** — skill hit rolls
4. **Scenario field-event RANDOM** — `WorldSessionScenarioRewards.rollFieldEventRandom`
5. **createToken** — resume token string (identity only; injected for digest stability)
6. **Wall clock on join/tick defaults** — lab always passes explicit `now`
7. **Client/presentation RNG** — excluded from lab path
