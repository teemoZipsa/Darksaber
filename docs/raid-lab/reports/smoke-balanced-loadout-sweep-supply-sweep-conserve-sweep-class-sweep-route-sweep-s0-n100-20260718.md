# Raid Lab Cohort Report

- labVersion: 10
- policy: balanced
- stress: none
- seeds: 0..99 (n=100)
- mean elapsedSeconds: 394.51
- mean kills: 0.48
- mean engagements: 2.17
- mean loot acquired: 2.64
- mean heal uses: 0.69
- mean heal remaining: 2.65

## Outcomes

- SURVIVED: 65 (65.0%)
- DEAD: 26 (26.0%)
- MIA: 0 (0.0%)
- LEFT: 9 (9.0%)

## Coverage

- classes: cavalry=25, cleric=25, infantry=25, mage=25
- loadouts: bare=28, heavy=24, light=24, standard=24
- supply: lab=32, none=32, rich=16, starter=20
- conserve: hoard=33, spend=34, standard=33
- target towns: e_outpost=15, e_stronghold=15, nw_desert_city=14, s_coast_town=14, se_port=14, sw_hideout=14, w_forest_village=14
- final towns: central_castle=35, e_outpost=10, e_stronghold=15, nw_desert_city=7, s_coast_town=12, se_port=10, sw_hideout=8, w_forest_village=3

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 91 — seeds 0, 1, 2, 3, 4, 5, 7, 8
- `max_actions`: 9 — seeds 6, 13, 20, 34, 48, 55, 62, 69

## Clusters — deathCause

- `none`: 65 — seeds 1, 4, 5, 7, 8, 9, 10, 11
- `enemy`: 26 — seeds 0, 2, 3, 12, 14, 18, 23, 26
- `manual`: 9 — seeds 6, 13, 20, 34, 48, 55, 62, 69

## Clusters — invariant codes

- `none`: 100
