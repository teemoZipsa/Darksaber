# Raid Lab — Progress

## Batch 2026-07-17b — Extract stall fixes (labVersion 4)

### Experiments run

- LEFT seed 9: A* credits burned by short-range chase → coast-failed wall pocket ~(1474,1486)
- LEFT seed 77: extract-bypass vector cancelled near town ~(1970,1526) with 600+ bypass moves
- Fix: A* only for goals ≥32 tiles; refund failed searches; no bypass when distToExtract ≤96

### Outcome ratios (smoke 0..99 / balanced / labVersion 4)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 90 | 90.0% |
| DEAD | 1 | 1.0% |
| MIA | 0 | 0.0% |
| LEFT | 9 | 9.0% |

- vs labVersion 3 smoke: SURVIVED 89% → **90%**, LEFT 11% → **9%** (new DEAD seed 59)
- Former LEFT samples 9/14/18/35/63/69/77/82: all **SURVIVED**
- Remaining LEFT: 10, 15, 24, 45, 46, 53, 71, 89
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md` (v4)

### Tests added/updated

- seed 9 wall-pocket SURVIVED regression
- seed 77 near-town bypass SURVIVED regression

### Code changed

- `scripts/raid-lab/pathing.ts` — short-range A* skip + credit refund
- `scripts/raid-lab/policies.ts` — extract bypass only when far from town
- `RAID_LAB_VERSION = 4`
- optional `RAID_LAB_TRACE=1` position samples in runner

### Verification

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| raid-lab determinism tests | 7 pass |
| `npm run raid-lab:smoke` | SURVIVED 90 / LEFT 9 / DEAD 1 / invariants 0 (~61s) |

### Outcome ratios (cohort 0..999 / balanced / labVersion 4)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 892 | 89.2% |
| DEAD | 22 | 2.2% |
| MIA | 0 | 0.0% |
| LEFT | 86 | 8.6% |

- vs labVersion 3 1k: SURVIVED 90.8% → **89.2%**, LEFT 8.8% → **8.6%**, DEAD 0.4% → **2.2%**
- Near-town no-bypass fixed LEFT stalls but increased combat deaths
- DEAD/enemy samples: 59, 137, 144, …; DEAD/curse: **611**, **852** (stable vs v3)
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n1000-20260716.md` (v4)

### Next work queue

1. Reduce DEAD/enemy (near-town extract push) without reintroducing bypass stall — seed 59
2. Shrink new LEFT set (10, 15, 24, 45, …)
3. Keep curse DEAD 611/852 as known hazard seeds

---

## Batch 2026-07-17 — Water-chokepoint routing (labVersion 3)

### Experiments run

- Root-caused LEFT cluster seed 6: stuck at ~(1662,1584) where east is water
- Coast-slide alone preferred a short southern gap into a longer trap / combat death
- Lab corridor now uses sticky paths + unit-cost binary-heap A* when greedy steps block
- Regression: balanced seed 6 must `SURVIVED` at `e_stronghold`

### Seed range

- Determinism + extract regressions in `tests/raid/raid-lab-determinism.test.ts`
- Smoke / 1k cohort pending re-run under labVersion 3

### Outcome ratios (smoke 0..99 / balanced / labVersion 3)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 89 | 89.0% |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 11 | 11.0% |

- mean elapsedSeconds: **49.95**
- mean kills: **0.89**
- vs labVersion 2 smoke: SURVIVED 84% → **89%**, LEFT 16% → **11%**
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md` (overwritten with v3)

### Invariant violations

- total: **0**

### Minimal reproductions / clusters

- `max_actions` / LEFT (11/100): seeds 9, 14, 18, 35, 63, 69, 77, 82 (+ samples in report)
- Seed 6 water trap: **fixed** (now in SURVIVED / raid_result)

### Tests added/updated

- `tests/raid/raid-lab-determinism.test.ts` — water chokepoint seed 6

### Code changed

- `scripts/raid-lab/pathing.ts` — greedy improving steps, sticky corridor, unit-cost heap A*
  - A* stops at first Manhattan improvement; credits + coast fallback avoid cohort hangs
  - Soft rejoin + stderr progress every 10 seeds
- `RAID_LAB_VERSION = 3`

### Verification commands

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `node --import tsx --test tests/raid/raid-lab-determinism.test.ts` | 5 pass |
| `npm run raid-lab:smoke` | SURVIVED 89 / LEFT 11 / invariants 0 (~42s) |

### Outcome ratios (cohort 0..999 / balanced / labVersion 3)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 908 | 90.8% |
| DEAD | 4 | 0.4% |
| MIA | 0 | 0.0% |
| LEFT | 88 | 8.8% |

- mean elapsedSeconds: **49.19**
- mean kills: **1.00**
- runtime: **~443s**
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n1000-20260716.md`

### 1k clusters

- `max_actions` / LEFT (88): samples 9, 14, 18, 35, 63, 69, 77, 82
- DEAD / enemy: seeds **301**, **622**
- DEAD / curse: seeds **611**, **852**
- invariants: **0**

### Next work queue

1. Shrink remaining LEFT seeds (9, 14, …) into regression cases
2. Reproduce DEAD seeds 301/622 (enemy) and 611/852 (curse)
3. Add DEAD/MIA stress cohort once LEFT cluster is reduced further

---

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
