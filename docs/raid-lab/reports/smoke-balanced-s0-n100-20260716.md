# Raid Lab Cohort Report

- labVersion: 4
- policy: balanced
- seeds: 0..99 (n=100)
- mean elapsedSeconds: 91.16
- mean kills: 1.89

## Outcomes

- SURVIVED: 90 (90.0%)
- DEAD: 1 (1.0%)
- MIA: 0 (0.0%)
- LEFT: 9 (9.0%)

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 91 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `max_actions`: 9 — seeds 10, 15, 24, 45, 46, 53, 71, 89

## Clusters — deathCause

- `none`: 90 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `manual`: 9 — seeds 10, 15, 24, 45, 46, 53, 71, 89
- `enemy`: 1 — seeds 59

## Clusters — invariant codes

- `none`: 100
