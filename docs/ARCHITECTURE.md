# Architecture Document

**As-built baseline**: 2026-07-10. 미래 구상과 현재 구현이 충돌하면 코드와 이 문서의
명시적 운영 계약을 우선하고, 게임 규칙은 `docs/GDD.md`를 따른다.

## 1. Client Engine Architecture
- **Rendering**: DPR-aware HTML5 Canvas field plus a React DOM overlay for blocking panels. The client uses `requestAnimationFrame` for the field loop.
- **Map Streaming (Chunk System)**:
  - The world is divided into 32x32-tile chunks.
  - `WorldMap.updateLoadedChunks` derives the loaded rectangle from the logical viewport plus a preload margin; it is not fixed to exactly `3x3`.
  - Chunks outside the required rectangle are discarded and deterministic chunks entering it are generated on demand.

## 2. Server Architecture (Current)
- **Node.js**: The central lightweight game server.
- **WebSockets (`ws`)**: Carries authoritative world snapshots, intents, combat, loot, market, scenario, reconnect, and raid-result messages. Chat is not currently implemented.
- **Authoritative Server**: The server independently verifies pathfinding, line-of-sight, and combat formulas to prevent client-side memory manipulation or cheating.
- **Persistence**: Versioned Postgres migrations cover auth/save/stash and active world snapshots/leases. Local recovery spools protect pending writes.

## 3. Core Data Structures
- `ServerPlayer`: ownership/resume identity, raid origin, elapsed time, kills, carried loot, modifier, scenario progress, actor ids, and save snapshot.
- `ServerActor`: authoritative tile/facing/stats/status/AP state for one deployed character.
- `WorldSessionPersistentSnapshot`: players, actors, enemies, nests, scenario flags, loot, generated chunks, sequencing, and dirty-save ids.
- `Chunk`: deterministic 32x32 tile/collision/render cache unit.
- Client presentation controllers consume absolute snapshots and transient combat/events without becoming the save authority.

## 4. Monster Data and Balance
- Original monster rows are exposed through `src/data/original/originalMonsters.ts`.
- Renderable monsters and authored spawn pools live in `src/data/MonsterCatalog.ts`.
- Original raw monster stats are normalized through `src/data/original/originalMonsterBalance.ts` before they become `Enemy` base stats.
- `Enemy` accepts an optional `monsterId`; when present, it uses normalized original-backed stats, then applies role tuning.
- Server scenario enemies and field nests pass `monsterId` into `Enemy`, and clients consume authoritative snapshot stats.
- Local story interiors use the same `src/data/StoryScenarioMonsterData.ts` layout table as the server.

See `docs/monster-balance.md` for the detailed model and tests.

## 5. World Engine Controllers
- `WorldEngine` is the field-loop orchestrator; domain flows should move into `src/engine/world/*` controllers when they become self-contained.
- `WorldStoryScenarioController` owns story dungeon arrival, local story-interior entry/exit, network scenario entry state, outdoor story field-event presentation, and story objective completion.
- `WorldNetworkSyncController` owns client-side network snapshot application, network combat event presentation, network loot grants, and pending network move/loot state.
- `WorldTutorialController` owns intro tutorial state, training map setup/teardown, tutorial action gating, and tutorial HUD rendering.
- `WorldRaidLifecycleController` owns town entry, network raid deploy/resume, network raid result handling, raid timer expiry, and extraction-town arrival checks.
- `WorldTempleController` owns fusion temple arrival, fusion callbacks, master-world entry, and mortal-world return flow.
- `WorldRestingController` owns field resting recovery timers, periodic HP/MP recovery, and damage-based rest interruption.
- `WorldLootController` owns enemy loot creation, local/network loot opening, inventory loot-secured callbacks, and opened-loot refresh.
- `WorldCombatFeedbackController` owns grouped combat feedback priority, camera shake dispatch, and hitstop dispatch.
- `WorldNetworkIntentController` owns client-side network intent submission and pending move preview registration.
- `WorldTurnStateController` owns active turn id, ready queue, remaining AP, major-action flag, reserved action state, and pure turn lifecycle state transitions.
  Other world controllers should access turn state through its explicit methods rather than `WorldEngine` compatibility accessors.
- `WorldEngine` should access active story-interior state through the controller instead of owning that state directly.

## 6. Network Story Field Events
- Outdoor story field events use deterministic original-coordinate placement from `src/data/StoryScenarioFieldEventPlacement.ts`; the client and server share the same placement function.
- Network raids submit only `dungeonId` and `eventId` for outdoor field-event interaction. `server/WorldSession.ts` validates actor ownership, active scenario, distance, completion scope, and rewards from server-side scenario data.
- Scenario field reward result item payloads preserve original GETITEM ids as optional `originalItemId` when available; `NetworkRaidClient` validates the reward payload shape before dispatch.
- Field-event completion is tracked as viewer-specific `playerFieldEventFlagsByDungeonId` plus session-wide `sharedFieldEventFlagsByDungeonId` in `ScenarioSnapshot`. True multi-account party progression remains a future party-system migration.
- Network world session routing is realm + raid-instance based, not account-hash based. Default solo joins use the legacy `realm:primary` key; party/raid flows can pass `requestedRaidInstanceId` and route every member to `realm:raid:<id>`. `WORLD_SHARD_COUNT=1` is the current supported operating contract; startup intentionally rejects larger counts. Postgres-backed deployments use `world_session_leases` so only one server instance writes a raid instance at a time, but multi-process shard placement remains future work.
