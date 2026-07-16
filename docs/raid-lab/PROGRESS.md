# Raid Lab — Progress

## Batch 2026-07-17f — Clear remaining LEFT/DEAD (labVersion 8)

### Experiments run

- cautious LEFT (seed 125 etc.): `attemptMove` used blind Bresenham that clipped through WALL @ ~(1428,1444) → corridor path hint + walkable stepping
- random-legal DEAD (seed 973): `random-rest` beside aggro at low HP → survive bias at hp≤40% + no adjacent rest

### Outcome ratios (smoke 0..99 / labVersion 8)

| Policy | SURVIVED | DEAD | LEFT | invariants |
|---|---:|---:|---:|---:|
| balanced | 100 | 0 | 0 | 0 |
| cautious | 100 | 0 | 0 | 0 |
| random-legal | 100 | 0 | 0 | 0 |

### Tests added/updated

- cautious seed 125 wall-chokepoint SURVIVED
- random-legal seed 973 low-HP rest trap SURVIVED
- determinism suite: **16 pass**

### Code changed

- `runner.ts` — path-hint + walkable move candidates
- `policies.ts` — random-legal low-HP / adjacent-rest guards
- `RAID_LAB_VERSION = 8`

### Verification

| Command | Result |
|---|---|
| typecheck | pass |
| raid-lab determinism tests | 16 pass |
| `raid-lab:smoke` / `:cautious` / `:random` | each **100% SURVIVED** |

### Outcome ratios (cohort 0..999 / labVersion 8)

| Policy | SURVIVED | DEAD | LEFT | invariants |
|---|---:|---:|---:|---:|
| balanced | **1000** | 0 | 0 | 0 |
| cautious | **1000** | 0 | 0 | 0 |
| random-legal | **1000** | 0 | 0 | 0 |

- Reports: `smoke-{balanced,cautious,random-legal}-s0-n1000-20260716.*` (labVersion 8)

### Next work queue

1. Phase 3 stress cohorts (forced low HP / denser nests)

---

## Batch 2026-07-17e — Multi-policy coverage (labVersion 7)

### Experiments run

- cautious smoke had 11% DEAD (seed 2 cornered-stall on extract) → disengage once `shouldExtract`
- random-legal smoke was 100% LEFT in ~1s via early `leave_manual` → remove that option
- npm scripts for cautious/random smoke + 1k cohorts

### Outcome ratios (smoke 0..99 / labVersion 7)

| Policy | SURVIVED | DEAD | LEFT | invariants |
|---|---:|---:|---:|---:|
| balanced | 100 | 0 | 0 | 0 |
| cautious | 100 | 0 | 0 | 0 |
| random-legal | 100 | 0 | 0 | 0 |

### Tests added/updated

- cautious seed 2 SURVIVED regression
- random-legal seed 0 no early `random-leave`
- determinism suite: **14 pass**

### Code changed

- `policies.ts` — cautious extract disengage; random-legal no early abandon
- `package.json` — `raid-lab:smoke:{cautious,random}`, `raid-lab:cohort1k:{cautious,random}`
- `RAID_LAB_VERSION = 7`

### Verification

| Command | Result |
|---|---|
| raid-lab determinism tests | 14 pass |
| `raid-lab:smoke` / `:cautious` / `:random` | each **100% SURVIVED** |

### Outcome ratios (cohort 0..999 / labVersion 7)

| Policy | SURVIVED | DEAD | LEFT | invariants |
|---|---:|---:|---:|---:|
| balanced | **1000** | 0 | 0 | 0 |
| cautious | 991 (99.1%) | 0 | 9 (0.9%) | 0 |
| random-legal | 999 (99.9%) | 1 (0.1%) | 0 | 0 |

- Reports: `smoke-{balanced,cautious,random-legal}-s0-n1000-20260716.*`

### Next work queue

1. Shrink cautious LEFT (9/1000) + random-legal DEAD (1/1000) if actionable
2. Optional Phase 3 stress cohorts

---

## Batch 2026-07-17d — Last DEAD shrink (labVersion 6)

### Experiments run

- DEAD/enemy 168/321: extract-clear stall (80–180 attacks, 0 kills) → remove extract-clear
- DEAD/curse 611/852: sealed reliquary pickup → skip hazard loot ids (`reliquary`/`cursed`/`hex`)

### Tests added/updated

- seed 168 clear-stall SURVIVED
- seed 852 cursed-reliquary skip SURVIVED
- determinism suite: **12 pass**

### Code changed

- `policies.ts` — no extract-clear; hazard loot filter
- `RAID_LAB_VERSION = 6`

### Outcome ratios (smoke 0..99 / balanced / labVersion 6)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 100 | **100.0%** |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 0 | 0.0% |

- mean elapsedSeconds: **35.82**; mean kills: **0.63**; ~32s
- Former DEAD 168/321/611/852: all **SURVIVED**
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md` (v6)

### Verification

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| raid-lab determinism tests | 12 pass |
| `npm run raid-lab:smoke` | **SURVIVED 100 / invariants 0** (~32s) |

### Outcome ratios (cohort 0..999 / balanced / labVersion 6)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 1000 | **100.0%** |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 0 | 0.0% |

- vs labVersion 5 1k: SURVIVED 99.6% → **100%**, DEAD 0.4% → **0%**
- invariants: **0**; runtime ~335s
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n1000-20260716.md` (v6)

### Next work queue

1. Optional: cautious / random-legal policy cohorts
2. Optional: stress cohorts (forced low HP / denser nests) for balance lab Phase 3

---

## Batch 2026-07-17c — Extract survival + bypass removal (labVersion 5)

### Experiments run

- DEAD seed 59: clear-attack stall + `mp_potion` treated as heal
- LEFT seeds 10/15/…: bypass oscillation mid-route; seed 53 west water shore with A* credits=0
- Fix: real heal-only items; extract-phase heal/rest; clear only on extract axis; remove bypass;
  top up A* credits when planning toward extraction goal

### Outcome ratios (smoke 0..99 / balanced / labVersion 5)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 100 | **100.0%** |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 0 | 0.0% |

- vs labVersion 4 smoke: SURVIVED 90% → **100%**, LEFT 9% → **0%**, DEAD 1% → **0%**
- mean elapsedSeconds: **43.64**; mean kills: **1.08**; runtime ~37s
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md` (v5)

### Tests added/updated

- seed 59 enemy-pack SURVIVED
- seed 10 mid-route bypass SURVIVED
- seed 53 west-shore SURVIVED
- determinism suite: **10 pass**

### Code changed

- `policies.ts` — extract heal/rest, selective clear, no bypass
- `runner.ts` — drop `mp_potion` from heal candidates; extract A* credit reserve
- `RAID_LAB_VERSION = 5`

### Verification

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| raid-lab determinism tests | 10 pass |
| `npm run raid-lab:smoke` | **SURVIVED 100 / invariants 0** (~37s) |

### Outcome ratios (cohort 0..999 / balanced / labVersion 5)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 996 | **99.6%** |
| DEAD | 4 | 0.4% |
| MIA | 0 | 0.0% |
| LEFT | 0 | **0.0%** |

- vs labVersion 4 1k: SURVIVED 89.2% → **99.6%**, LEFT 8.6% → **0%**, DEAD 2.2% → **0.4%**
- DEAD/enemy: **168**, **321**; DEAD/curse: **611**, **852**
- runtime ~365s; Report: `docs/raid-lab/reports/smoke-balanced-s0-n1000-20260716.md` (v5)

### Next work queue

1. Shrink remaining DEAD (enemy 168/321, curse 611/852) into regressions if actionable
2. Optional: cautious/random-legal cohorts for policy coverage

---

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
