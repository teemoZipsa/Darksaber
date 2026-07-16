# Raid Lab Cohort Report

- labVersion: 4
- policy: balanced
- seeds: 0..999 (n=1000)
- mean elapsedSeconds: 73.32
- mean kills: 1.69

## Outcomes

- SURVIVED: 892 (89.2%)
- DEAD: 22 (2.2%)
- MIA: 0 (0.0%)
- LEFT: 86 (8.6%)

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 914 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `max_actions`: 86 — seeds 10, 15, 24, 45, 46, 53, 71, 89

## Clusters — deathCause

- `none`: 892 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `manual`: 86 — seeds 10, 15, 24, 45, 46, 53, 71, 89
- `enemy`: 20 — seeds 59, 137, 144, 194, 207, 238, 365, 378
- `curse`: 2 — seeds 611, 852

## Clusters — invariant codes

- `none`: 1000
