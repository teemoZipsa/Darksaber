# Architecture Document

## 1. Client Engine Architecture
- **Rendering**: HTML5 Canvas Application. We will use `requestAnimationFrame` for a smooth game loop decoupled from game logic ticks.
- **Map Streaming (Chunk System)**:
  - The world is divided into chunks (e.g., 20x20 or 50x50 tiles per chunk).
  - The client keeps exactly a `3x3` chunk grid loaded in memory centered around the player's current chunk.
  - As the player steps over a chunk boundary, old furthest chunks are garbage collected and new ones are requested from the server/storage.

## 2. Server Architecture (Phase 4)
- **Node.js**: The central lightweight game server.
- **WebSockets (`ws`)**: Crucial for real-time grid positioning, chat, and Action Point synchronization without HTTP overhead.
- **Authoritative Server**: The server independently verifies pathfinding, line-of-sight, and combat formulas to prevent client-side memory manipulation or cheating.

## 3. Core Data Structures
- `Player Entity`: `{ id, x, y, hp, ap, class, inventory }`
- `Chunk Header`: `{ id (x_y), tilesMatrix, staticCollisionMap }`
- `Event Queue`: Client will maintain an event queue to process turn animations smoothly without desyncing from absolute server states.

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
- Network world session routing is realm + raid-instance based, not account-hash based. Default solo joins use the legacy `realm:primary` key; party/raid flows can pass `requestedRaidInstanceId` and route every member to `realm:raid:<id>`. Postgres-backed deployments use `world_session_leases` so only one server instance writes a raid instance at a time.
