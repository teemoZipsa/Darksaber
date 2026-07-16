# Expedition Reliability & Balance Lab — Plan

Long-running campaign to run thousands–tens of thousands of deterministic raids
against the real server-authoritative `WorldSession` and game rules, then turn
every failure into a minimal regression seed/test.

## Non-goals

- Reimplement combat, loot, or survival formulas in the simulator
- Browser / Canvas simulation
- Multi-shard, PvP, guild, chat
- Episode 32+ content
- Balance changes from a single seed
- Touching protected UI surfaces (`InventoryUI`, `GridInventory`, `OverlayRoot`,
  `UiStore`, `UiContext`, shared UI tokens) unless a failure directly points there

## Architecture

```
scripts/raid-lab/          headless runner + policies + reports
docs/raid-lab/             plan, progress, baseline, schemas, reports
tests/raid/raid-lab-*.ts   determinism + regression seeds
WorldSession (+ DI)        real authority; optional random/token for lab only
```

The runner joins a real `WorldSession`, issues real client intents
(`PLAYER_INTENT`, `LOOT_PICKUP`, `AUTO_LOOT_RESOLVE`, `WORLD_LEAVE`), advances
time with `session.tick(now)`, and asserts invariants after each step.

## Phases

### Phase 0 — Baseline (this batch)

1. Record `npm run typecheck` / `npm test` baseline
2. Survey existing raid telemetry + harnesses
3. Catalog gameplay-affecting non-deterministic boundaries
4. Author PLAN / PROGRESS / BASELINE + experiment JSON schema

### Phase 1 — Deterministic Headless Runner

1. Optional DI for `random` / `createToken` on `WorldSession` (production defaults unchanged)
2. Starter solo deploy from `central_castle`
3. Policies: `balanced`, `cautious`, `random-legal`
4. Intents: move, attack, rest/heal, loot, manual leave, extraction leave
5. Post-action invariant checks
6. Same-seed replay equality test
7. 100-seed smoke + report

### Phase 2 — Failure Loop

1. Expand to 1,000 seeds
2. Cluster failures by cause
3. Shrink → regression test → minimal fix → re-run prior cohort
4. Continue to next cluster

## Experiment protocol

- Always compare the same seed cohort before/after a change
- Never tune balance from one seed
- Failures must be minimized and stored as regression seeds before fixes
- Each completed independent task leaves at least one of: new experiment result,
  failure seed, regression test, or removed invariant violation
- One commit per independent task; run lint/typecheck/targeted tests each batch

## Policies (Phase 1)

| Policy | Intent |
|---|---|
| `balanced` | Engage nearby enemies when healthy; heal when low; extract toward nearest other town |
| `cautious` | Prefer rest/heal and extraction path; fight only when cornered or very close |
| `random-legal` | Uniform choice among currently legal intents (seeded) |

### Phase 3 — Stress Cohorts (balance lab)

Once baseline policies clear 1k with 0 LEFT/DEAD, add hardship presets that
probe survival under worse starting conditions — still on real `WorldSession`
rules, still deterministic.

1. `stress=low-hp` — join at ≈30% HP (heal/rest path pressure)
2. `stress=dense-nests` — shorter nest respawn, wider roam, higher spawn caps
3. `stress=low-hp+dense-nests` — both presets combined
4. Cluster new DEAD/LEFT → regression seeds → minimal policy/pathing fixes
5. Do not tune combat formulas from a single stressed seed

CLI: `--stress none|low-hp|dense-nests|low-hp+dense-nests` (default `none`).
npm: `raid-lab:smoke:stress:low-hp`, `:dense-nests`, `:combo`.

## Success signals

- Bit-identical digests for the same `(seed, policy, labVersion[, stress])`
- Invariant violations become regression tests then disappear
- Outcome mix (SURVIVED / DEAD / MIA / LEFT) is stable across cohort re-runs
