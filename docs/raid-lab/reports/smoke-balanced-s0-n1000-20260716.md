# Raid Lab Cohort Report

- labVersion: 3
- policy: balanced
- seeds: 0..999 (n=1000)
- mean elapsedSeconds: 49.19
- mean kills: 1.00

## Outcomes

- SURVIVED: 908 (90.8%)
- DEAD: 4 (0.4%)
- MIA: 0 (0.0%)
- LEFT: 88 (8.8%)

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 912 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `max_actions`: 88 — seeds 9, 14, 18, 35, 63, 69, 77, 82

## Clusters — deathCause

- `none`: 908 — seeds 0, 1, 2, 3, 4, 5, 6, 7
- `manual`: 88 — seeds 9, 14, 18, 35, 63, 69, 77, 82
- `enemy`: 2 — seeds 301, 622
- `curse`: 2 — seeds 611, 852

## Clusters — invariant codes

- `none`: 1000
