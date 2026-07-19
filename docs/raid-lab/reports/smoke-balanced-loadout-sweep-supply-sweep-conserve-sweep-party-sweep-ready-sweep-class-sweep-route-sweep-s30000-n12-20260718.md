# Raid Lab Cohort Report

- labVersion: 11
- policy: balanced
- stress: none
- seeds: 30000..30011 (n=12)
- mean elapsedSeconds: 340.92
- mean kills: 0.25
- mean engagements: 0.92
- mean loot acquired: 3.25
- mean heal uses: 0.50
- mean heal remaining: 6.08

## Outcomes

- SURVIVED: 4 (33.3%)
- DEAD: 1 (8.3%)
- MIA: 0 (0.0%)
- LEFT: 7 (58.3%)

## Coverage

- classes: cavalry=3, cleric=3, infantry=3, mage=3
- loadouts: bare=4, light=4, standard=4
- supply: rich=12
- conserve: hoard=4, spend=4, standard=4
- partySize: 1=4, 2=4, 3=4
- multiReady: leader-first=3, lowest-hp=6, round-robin=3
- companionClasses: cavalry=3, cleric=3, infantry=3, mage=3
- pairwise: class×loadout:cavalry×bare=1, class×loadout:cavalry×light=1, class×loadout:cavalry×standard=1, class×loadout:cleric×bare=1, class×loadout:cleric×light=1, class×loadout:cleric×standard=1, class×loadout:infantry×bare=1, class×loadout:infantry×light=1, class×loadout:infantry×standard=1, class×loadout:mage×bare=1, class×loadout:mage×light=1, class×loadout:mage×standard=1, leader×companion:cavalry×cleric=2, leader×companion:cavalry×mage=1, leader×companion:cleric×infantry=1, leader×companion:cleric×mage=2, leader×companion:infantry×cavalry=2, leader×companion:infantry×cleric=1, leader×companion:mage×cavalry=1, leader×companion:mage×infantry=2, multiReady×loadout:leader-first×light=2, multiReady×loadout:leader-first×standard=1, multiReady×loadout:lowest-hp×bare=3, multiReady×loadout:lowest-hp×standard=3, multiReady×loadout:round-robin×bare=1, multiReady×loadout:round-robin×light=2, partySize×class:1×cavalry=1, partySize×class:1×cleric=1, partySize×class:1×infantry=1, partySize×class:1×mage=1, partySize×class:2×cavalry=1, partySize×class:2×cleric=1, partySize×class:2×infantry=1, partySize×class:2×mage=1, partySize×class:3×cavalry=1, partySize×class:3×cleric=1, partySize×class:3×infantry=1, partySize×class:3×mage=1, partySize×companion:2×cavalry=1, partySize×companion:2×cleric=1, partySize×companion:2×infantry=1, partySize×companion:2×mage=1, partySize×companion:3×cavalry=2, partySize×companion:3×cleric=2, partySize×companion:3×infantry=2, partySize×companion:3×mage=2, partySize×conserve:1×hoard=1, partySize×conserve:1×spend=2, partySize×conserve:1×standard=1, partySize×conserve:2×hoard=1, partySize×conserve:2×spend=1, partySize×conserve:2×standard=2, partySize×conserve:3×hoard=2, partySize×conserve:3×spend=1, partySize×conserve:3×standard=1, partySize×loadout:1×bare=4, partySize×loadout:2×light=4, partySize×loadout:3×standard=4, partySize×multiReady:1×lowest-hp=3, partySize×multiReady:1×round-robin=1, partySize×multiReady:2×leader-first=2, partySize×multiReady:2×round-robin=2, partySize×multiReady:3×leader-first=1, partySize×multiReady:3×lowest-hp=3, partySize×route:1×sweep=4, partySize×route:2×sweep=4, partySize×route:3×sweep=4, partySize×supply:1×rich=4, partySize×supply:2×rich=4, partySize×supply:3×rich=4
- target towns: e_outpost=2, e_stronghold=2, nw_desert_city=2, s_coast_town=1, se_port=1, sw_hideout=2, w_forest_village=2
- final towns: central_castle=8, e_outpost=1, e_stronghold=1, s_coast_town=1, sw_hideout=1

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 8 — seeds 30000, 30002, 30003, 30004, 30005, 30009, 30010, 30011
- `max_actions`: 4 — seeds 30001, 30006, 30007, 30008

## Clusters — deathCause

- `manual`: 7 — seeds 30001, 30004, 30006, 30007, 30008, 30010, 30011
- `none`: 4 — seeds 30000, 30003, 30005, 30009
- `enemy`: 1 — seeds 30002

## Clusters — invariant codes

- `none`: 12
