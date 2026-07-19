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
3. Policies: `balanced`, `cautious`, `random-legal` (unbiased intent fuzzer)
4. Intents: move, attack, rest/heal, loot, manual leave, extraction leave
5. Post-action invariant checks
6. Same-seed replay equality test
7. 100-seed smoke + report

### Phase 2 — Failure Loop

1. Expand to 1,000 seeds
2. Cluster failures by cause
3. Shrink technical failures → regression test → minimal fix → re-run prior cohort
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
| `random-legal` | Uniform choice among enumerated executable intents (seeded); includes manual leave and hazards, with no survival bias |

Policies read the visibility-filtered `WorldSnapshot` used by real clients. The
runner may inspect its own player's carried inventory and server attack range,
but policies must not inspect hidden enemies, hidden ownership state, or encode
internal hazard item ids.

### Coverage matrix (labVersion 9+)

- `--class infantry|cavalry|cleric|mage|sweep` (default `sweep`)
- `--route nearest|sweep` (default `sweep`)
- committed path-regression seeds use the explicit `infantry + nearest` baseline
- cohort reports include class and extraction-town coverage plus engagement and
  loot means; survival percentage alone is not a balance success metric

### Phase 3 — Stress Cohorts (balance lab)

Once baseline policies are deterministic and free of technical stalls or
invariant violations, add hardship presets that probe survival under worse
starting conditions — still on real `WorldSession` rules, still deterministic.

1. `stress=low-hp` — join at ≈30% HP with no starter healing supply
2. `stress=dense-nests` — shorter nest respawn, wider roam, higher spawn caps
3. `stress=low-hp+dense-nests` — both presets combined
4. Cluster DEAD/LEFT by gameplay cause; fix only technical stalls, illegal
   intents, or invariant failures. Expected deaths and manual leaves remain data.
5. Do not tune combat formulas from a single stressed seed

CLI: `--stress none|low-hp|dense-nests|low-hp+dense-nests` (default `none`).
npm: `raid-lab:smoke:stress:low-hp`, `:dense-nests`, `:combo`.

## Success signals

- Bit-identical digests for the same `(seed, policy, labVersion[, stress])`
- Invariant violations become regression tests then disappear
- Outcome mix (SURVIVED / DEAD / MIA / LEFT) is stable across cohort re-runs
- Matrix cohorts exercise every starting class and multiple destination towns
- Stress cohorts create measurably different engagement, loot, death, or leave
  distributions instead of being optimized back to 100% survival

## Future breadth phases

The current runner is an extraction-reliability foundation, not the complete
game-balance program. The following remain separate deliverables:

1. ~~party composition, equipment/loadout, consumable and item-conservation matrix~~
   - **Phase 4a (labVersion 10):** solo loadout / supply / conserve matrix — done
   - **Phase 4b (labVersion 11):** multi-actor party composition (1–3) + multi-ready — done
2. episode 1–31 story campaigns and exactly-once quest/reward persistence
3. disconnect/reconnect, duplicated messages, delayed ticks, and save-conflict chaos

### Phase 4a — Loadout / Supply / Conserve Matrix (labVersion 10)

Solo-only balance axes orthogonal to class / route / stress / policy:

| Axis | Values | Default (regression-safe) |
|---|---|---|
| `loadout` | `bare`, `light`, `standard`, `heavy` | `bare` |
| `supply` | `none`, `lab`, `starter`, `rich` | `lab` |
| `conserve` | `spend`, `standard`, `hoard` | `standard` |

- `bare` + `lab` + `standard` preserves pre-matrix combat behavior (no equipment
  bonuses, `herb_common×3`, historical heal thresholds).
- Non-`bare` loadouts wire `createWorldJoinSaveState` equipment bonuses and
  carried weight into `WorldSession.join`.
- CLI: `--loadout` / `--supply` / `--conserve` (each accepts `sweep`).
- Sweep scheduling uses a 192-seed mixed-radix cycle. The first 64 seeds cover
  every class/loadout/supply tuple, and the full cycle covers every conserve
  value without coupling class and loadout.
- npm: `raid-lab:smoke:loadout`

### Phase 4b — Multi-Actor Party Composition (labVersion 11)

Builds on 4a with real production join/save party paths (`partySnapshot` /
`rosterSnapshot` → `createWorldJoinSaveState` → `WorldSession.join`):

| Axis | Values | Default (regression-safe) |
|---|---|---|
| `partySize` | `1`, `2`, `3` | `1` |
| `multiReady` | `leader-first`, `lowest-hp`, `round-robin` | `leader-first` |
| companion classes | derived per seed when `partySize > 1` | `[]` |

- Solo `partySize=1` + `bare` still skips join-save gear wiring (4a regression path).
- Multi-ready selects among independently ready ATB actors (not all-must-ready).
- Sweep uses ÷4 partySize and ÷3 multiReady strides so they do not lock to
  conserve's `seed % 3`; seeds `0..35` cover every `partySize×class`,
  `partySize×conserve`, and `partySize×multiReady` pair.
- Holdout seeds start at `30000` (`RAID_LAB_HOLDOUT_SEED_START`).
- Invariants: party size, ownership, duplicate local/server/entity IDs,
  exactly-once `RAID_RESULT`.
- CLI: `--party-size` / `--multi-ready` (each accepts `sweep`).
- npm: `raid-lab:smoke:party`, `raid-lab:cohort1k:party`
