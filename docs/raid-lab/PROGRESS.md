# Raid Lab — Progress

## Batch 2026-07-16 — Phase 0 + Phase 1 minimal deterministic raid

### Experiments run

- Phase 0 tooling baseline (`npm run typecheck`, `npm test`)
- Phase 1 same-seed determinism suite (`tests/raid/raid-lab-determinism.test.ts`)
- Phase 1 100-seed smoke (`npm run raid-lab:smoke`, policy `balanced`)

### Seed range

- Determinism: seed `42` (all policies), seeds `7`/`8` divergence check, seed `1` legality
- Smoke: seeds `0..99` (policy `balanced`, maxActions default 600)

### Outcome ratios (smoke 0..99 / balanced)

| Result | Count | Share |
|---|---:|---:|
| SURVIVED | 0 | 0.0% |
| DEAD | 0 | 0.0% |
| MIA | 0 | 0.0% |
| LEFT | 100 | 100.0% |

- mean elapsedSeconds: **111.50**
- mean kills: **21.94**
- Report: `docs/raid-lab/reports/smoke-balanced-s0-n100-20260716.md`

Notes: LEFT-heavy is expected for Phase 1 — starter parties hit the action budget while hunting
departure-area nests (~100+ tiles out) before reaching a non-departure town for SURVIVED.

### Invariant violations

- total: **0**

### Minimal reproductions

None yet (no invariant failures in the first 100-seed cohort).

### Tests added

- `tests/raid/raid-lab-determinism.test.ts`
  - same seed → identical digests for `balanced` / `cautious` / `random-legal`
  - seed self-stability
  - legal raid result for starter expedition

### Code changed

- Optional `WorldSessionOptions.random` / `createToken` DI (defaults unchanged for production)
- Threaded RNG through combat, enemy turns, skills, scenario field-event rolls
- `scripts/raid-lab/*` WorldSession headless runner, policies, invariants, digest, CLI
- `docs/raid-lab/*` plan, baseline, schema, progress, smoke reports
- npm scripts: `raid-lab`, `raid-lab:smoke`
- `tsconfig.test.json` includes `scripts/raid-lab`

### Verification commands

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (after stopReason fix) |
| `node --import tsx --test tests/raid/raid-lab-determinism.test.ts` | 3 pass |
| `npm run raid-lab:smoke` | 100 seeds, 0 invariant violations |

### Next work queue

1. Phase 2: expand to 1,000 seeds; keep the same cohort comparison discipline
2. Probe why SURVIVED remains 0 under action budgets — longer extract path / path quality
3. Add rest/heal stress cohort (force low HP) and DEAD/MIA clusters
4. Shrink any future invariant violation into `tests/raid/raid-lab-regression-*.test.ts` before fixes

---

## Non-deterministic boundary catalog (living)

1. **sessionEpoch** — nest/loot/content seed root (`WorldSession`)
2. **CombatFormulas RNG** — physical hit/variance/crit; magic hit/variance
3. **SkillEffectResolver RNG** — skill hit rolls
4. **Scenario field-event RANDOM** — `WorldSessionScenarioRewards.rollFieldEventRandom`
5. **createToken** — resume token string (identity only; injected for digest stability)
6. **Wall clock on join/tick defaults** — lab always passes explicit `now`
7. **Client/presentation RNG** — excluded from lab path
