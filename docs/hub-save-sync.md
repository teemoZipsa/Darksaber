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
- [x] CI: `build:server` + `npx tsc --noEmit`
- [x] `/metrics` Bearer when `WORLD_METRICS_TOKEN` set
- [x] `WorldSessionMoveIntent` extract (move path planning)
- [x] combat-parity / hub-save / stash preserve tests

Manual smoke: town shop buy → refresh → gold/stash persist → deploy → raid survive → hub matches server.

Network raid smoke: scenario gold field event → survive → gold must not double after result screen → redeploy.
