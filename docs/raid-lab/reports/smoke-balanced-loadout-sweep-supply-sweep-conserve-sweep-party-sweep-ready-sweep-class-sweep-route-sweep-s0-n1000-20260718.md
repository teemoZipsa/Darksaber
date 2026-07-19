# Raid Lab Cohort Report

- labVersion: 11
- policy: balanced
- stress: none
- seeds: 0..999 (n=1000)
- mean elapsedSeconds: 260.63
- mean kills: 0.38
- mean engagements: 1.27
- mean loot acquired: 2.70
- mean heal uses: 0.49
- mean heal remaining: 3.10

## Outcomes

- SURVIVED: 336 (33.6%)
- DEAD: 96 (9.6%)
- MIA: 0 (0.0%)
- LEFT: 568 (56.8%)

## Coverage

- classes: cavalry=250, cleric=250, infantry=250, mage=250
- loadouts: bare=252, heavy=248, light=252, standard=248
- supply: lab=256, none=256, rich=240, starter=248
- conserve: hoard=333, spend=334, standard=333
- partySize: 1=336, 2=332, 3=332
- multiReady: leader-first=334, lowest-hp=333, round-robin=333
- companionClasses: cavalry=249, cleric=249, infantry=249, mage=249
- pairwise: class×loadout:cavalry×bare=63, class×loadout:cavalry×heavy=62, class×loadout:cavalry×light=63, class×loadout:cavalry×standard=62, class×loadout:cleric×bare=63, class×loadout:cleric×heavy=62, class×loadout:cleric×light=63, class×loadout:cleric×standard=62, class×loadout:infantry×bare=63, class×loadout:infantry×heavy=62, class×loadout:infantry×light=63, class×loadout:infantry×standard=62, class×loadout:mage×bare=63, class×loadout:mage×heavy=62, class×loadout:mage×light=63, class×loadout:mage×standard=62, leader×companion:cavalry×cleric=166, leader×companion:cavalry×mage=83, leader×companion:cleric×infantry=83, leader×companion:cleric×mage=166, leader×companion:infantry×cavalry=166, leader×companion:infantry×cleric=83, leader×companion:mage×cavalry=83, leader×companion:mage×infantry=166, multiReady×loadout:leader-first×bare=84, multiReady×loadout:leader-first×heavy=84, multiReady×loadout:leader-first×light=84, multiReady×loadout:leader-first×standard=82, multiReady×loadout:lowest-hp×bare=84, multiReady×loadout:lowest-hp×heavy=83, multiReady×loadout:lowest-hp×light=84, multiReady×loadout:lowest-hp×standard=82, multiReady×loadout:round-robin×bare=84, multiReady×loadout:round-robin×heavy=81, multiReady×loadout:round-robin×light=84, multiReady×loadout:round-robin×standard=84, partySize×class:1×cavalry=84, partySize×class:1×cleric=84, partySize×class:1×infantry=84, partySize×class:1×mage=84, partySize×class:2×cavalry=83, partySize×class:2×cleric=83, partySize×class:2×infantry=83, partySize×class:2×mage=83, partySize×class:3×cavalry=83, partySize×class:3×cleric=83, partySize×class:3×infantry=83, partySize×class:3×mage=83, partySize×companion:2×cavalry=83, partySize×companion:2×cleric=83, partySize×companion:2×infantry=83, partySize×companion:2×mage=83, partySize×companion:3×cavalry=166, partySize×companion:3×cleric=166, partySize×companion:3×infantry=166, partySize×companion:3×mage=166, partySize×conserve:1×hoard=84, partySize×conserve:1×spend=168, partySize×conserve:1×standard=84, partySize×conserve:2×hoard=83, partySize×conserve:2×spend=83, partySize×conserve:2×standard=166, partySize×conserve:3×hoard=166, partySize×conserve:3×spend=83, partySize×conserve:3×standard=83, partySize×loadout:1×bare=84, partySize×loadout:1×heavy=84, partySize×loadout:1×light=84, partySize×loadout:1×standard=84, partySize×loadout:2×bare=84, partySize×loadout:2×heavy=84, partySize×loadout:2×light=84, partySize×loadout:2×standard=80, partySize×loadout:3×bare=84, partySize×loadout:3×heavy=80, partySize×loadout:3×light=84, partySize×loadout:3×standard=84, partySize×multiReady:1×leader-first=112, partySize×multiReady:1×lowest-hp=112, partySize×multiReady:1×round-robin=112, partySize×multiReady:2×leader-first=110, partySize×multiReady:2×lowest-hp=110, partySize×multiReady:2×round-robin=112, partySize×multiReady:3×leader-first=112, partySize×multiReady:3×lowest-hp=111, partySize×multiReady:3×round-robin=109, partySize×route:1×sweep=336, partySize×route:2×sweep=332, partySize×route:3×sweep=332, partySize×supply:1×lab=84, partySize×supply:1×none=88, partySize×supply:1×rich=80, partySize×supply:1×starter=84, partySize×supply:2×lab=88, partySize×supply:2×none=84, partySize×supply:2×rich=80, partySize×supply:2×starter=80, partySize×supply:3×lab=84, partySize×supply:3×none=84, partySize×supply:3×rich=80, partySize×supply:3×starter=84
- target towns: e_outpost=143, e_stronghold=143, nw_desert_city=143, s_coast_town=143, se_port=143, sw_hideout=143, w_forest_village=142
- final towns: central_castle=664, e_outpost=60, e_stronghold=73, nw_desert_city=45, s_coast_town=54, se_port=38, sw_hideout=58, w_forest_village=8

## Invariant violations

- total: 0
- none

## Clusters — stopReason

- `raid_result`: 659 — seeds 0, 1, 2, 3, 5, 7, 8, 12
- `max_actions`: 341 — seeds 4, 6, 9, 10, 11, 13, 17, 18

## Clusters — deathCause

- `manual`: 568 — seeds 4, 6, 7, 9, 10, 11, 13, 16
- `none`: 336 — seeds 1, 5, 8, 15, 21, 24, 25, 27
- `enemy`: 94 — seeds 0, 2, 3, 12, 14, 26, 41, 45
- `curse`: 2 — seeds 611, 852

## Clusters — invariant codes

- `none`: 1000
