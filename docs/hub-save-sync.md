# Hub save sync checklist

Server-authoritative hub state (gold, backpack, stash, equipment, market) for authenticated sessions.

- [x] `stashSnapshot` on `CharacterSave` + migrate/createDefault/saveFromRow
- [x] Postgres `stash_snapshot` ALTER/UPDATE/INSERT + merge preserve
- [x] `applyCharacterSave` on login before hub flush (gold/questState)
- [x] `HubSavePatch` whitelist + `acquiredInRaid` strip + raid PATCH block (409)
- [x] `WorldSessionSaveState.buildPatch` omits stash; `cloneCharacterSave` clones stash
- [x] `HubSaveSerializer` + `persistHubSave` / `flushHubSave` debounce
- [x] Deploy barrier: flush fail blocks join + 409 retry in `AuthClient`
- [x] Raid end: `syncHubSaveFromServer` before hub flush resume
- [x] Authenticated `PlayerData.save()`/`load()` no-op + i18n `sessionOnlyNote`
- [x] CI: `build:server` + `npm run typecheck`
- [x] `/metrics` Bearer when `WORLD_METRICS_TOKEN` set
- [x] `WorldSessionMoveIntent` extract (move path planning)
- [x] combat-parity / hub-save / stash preserve tests

Manual smoke: town shop buy → refresh → gold/stash persist → deploy → raid survive → hub matches server.

Network raid smoke: scenario gold field event → survive → gold must not double after result screen → redeploy.

## Field restoration (2026-09-13)

Exploration no longer expires or discards inventory/equipment/EXP on defeat or early return. Acquired items are included in intermediate world save patches. Final return patches preserve earned loot, completed objectives and gold for every result; only an actual town arrival grants the one-time first-return bonus. The result summary is captured before hub sync clears acquisition flags, and a successful reconnect-grace sync must not grant rewards again on the client.
