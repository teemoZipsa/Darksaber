# Raid Lab Cohort Report

- labVersion: 11
- policy: balanced
- stress: none
- seeds: 0..99 (n=100)
- mean elapsedSeconds: 255.31
- mean kills: 0.38
- mean engagements: 1.22
- mean loot acquired: 2.56
- mean heal uses: 0.47
- mean heal remaining: 2.77

## Outcomes

- SURVIVED: 32 (32.0%)
- DEAD: 13 (13.0%)
- MIA: 0 (0.0%)
- LEFT: 55 (55.0%)

## Coverage

- classes: cavalry=25, cleric=25, infantry=25, mage=25
- loadouts: bare=28, heavy=24, light=24, standard=24
- supply: lab=32, none=32, rich=16, starter=20
- conserve: hoard=33, spend=34, standard=33
- partySize: 1=36, 2=32, 3=32
- multiReady: leader-first=34, lowest-hp=33, round-robin=33
- companionClasses: cavalry=24, cleric=24, infantry=24, mage=24
- pairwise: class×loadout:cavalry×bare=7, class×loadout:cavalry×heavy=6, class×loadout:cavalry×light=6, class×loadout:cavalry×standard=6, class×loadout:cleric×bare=7, class×loadout:cleric×heavy=6, class×loadout:cleric×light=6, class×loadout:cleric×standard=6, class×loadout:infantry×bare=7, class×loadout:infantry×heavy=6, class×loadout:infantry×light=6, class×loadout:infantry×standard=6, class×loadout:mage×bare=7, class×loadout:mage×heavy=6, class×loadout:mage×light=6, class×loadout:mage×standard=6, leader×companion:cavalry×cleric=16, leader×companion:cavalry×mage=8, leader×companion:cleric×infantry=8, leader×companion:cleric×mage=16, leader×companion:infantry×cavalry=16, leader×companion:infantry×cleric=8, leader×companion:mage×cavalry=8, leader×companion:mage×infantry=16, multiReady×loadout:leader-first×bare=11, multiReady×loadout:leader-first×heavy=7, multiReady×loadout:leader-first×light=6, multiReady×loadout:leader-first×standard=10, multiReady×loadout:lowest-hp×bare=7, multiReady×loadout:lowest-hp×heavy=10, multiReady×loadout:lowest-hp×light=10, multiReady×loadout:lowest-hp×standard=6, multiReady×loadout:round-robin×bare=10, multiReady×loadout:round-robin×heavy=7, multiReady×loadout:round-robin×light=8, multiReady×loadout:round-robin×standard=8, partySize×class:1×cavalry=9, partySize×class:1×cleric=9, partySize×class:1×infantry=9, partySize×class:1×mage=9, partySize×class:2×cavalry=8, partySize×class:2×cleric=8, partySize×class:2×infantry=8, partySize×class:2×mage=8, partySize×class:3×cavalry=8, partySize×class:3×cleric=8, partySize×class:3×infantry=8, partySize×class:3×mage=8, partySize×companion:2×cavalry=8, partySize×companion:2×cleric=8, partySize×companion:2×infantry=8, partySize×companion:2×mage=8, partySize×companion:3×cavalry=16, partySize×companion:3×cleric=16, partySize×companion:3×infantry=16, partySize×companion:3×mage=16, partySize×conserve:1×hoard=9, partySize×conserve:1×spend=18, partySize×conserve:1×standard=9, partySize×conserve:2×hoard=8, partySize×conserve:2×spend=8, partySize×conserve:2×standard=16, partySize×conserve:3×hoard=16, partySize×conserve:3×spend=8, partySize×conserve:3×standard=8, partySize×loadout:1×bare=12, partySize×loadout:1×heavy=8, partySize×loadout:1×light=8, partySize×loadout:1×standard=8, partySize×loadout:2×bare=8, partySize×loadout:2×heavy=8, partySize×loadout:2×light=8, partySize×loadout:2×standard=8, partySize×loadout:3×bare=8, partySize×loadout:3×heavy=8, partySize×loadout:3×light=8, partySize×loadout:3×standard=8, partySize×multiReady:1×leader-first=12, partySize×multiReady:1×lowest-hp=12, partySize×multiReady:1×round-robin=12, partySize×multiReady:2×leader-first=10, partySize×multiReady:2×lowest-hp=10, partySize×multiReady:2×round-robin=12, partySize×multiReady:3×leader-first=12, partySize×multiReady:3×lowest-hp=11, partySize×multiReady:3×round-robin=9, partySize×route:1×sweep=36, partySize×route:2×sweep=32, partySize×route:3×sweep=32, partySize×supply:1×lab=8, partySize×supply:1×none=12, partySize×supply:1×rich=8, partySize×supply:1×starter=8, partySize×supply:2×lab=12, partySize×supply:2×none=12, partySize×supply:2×rich=4, partySize×supply:2×starter=4, partySize×supply:3×lab=12, partySize×supply:3×none=8, partySize×supply:3×rich=4, partySize×supply:3×starter=8
- target towns: e_outpost=15, e_stronghold=15, nw_desert_city=14, s_coast_town=14, se_port=14, sw_hideout=14, w_forest_village=14
- final towns: central_castle=68, e_outpost=5, e_stronghold=9, nw_desert_city=3, s_coast_town=4, se_port=4, sw_hideout=5, w_forest_village=2

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 68 — seeds 0, 1, 2, 3, 5, 7, 8, 12
- `max_actions`: 32 — seeds 4, 6, 9, 10, 11, 13, 17, 18

## Clusters — deathCause

- `manual`: 55 — seeds 4, 6, 7, 9, 10, 11, 13, 16
- `none`: 32 — seeds 1, 5, 8, 15, 21, 24, 25, 27
- `enemy`: 13 — seeds 0, 2, 3, 12, 14, 26, 41, 45

## Clusters — invariant codes

- `none`: 100
