# Dark Saver Spiritual Successor — Project Tasks

## Phase 1: Planning & Setup ✅
## Phase 2: Core Engine Architecture ✅
## Phase 3: Gameplay Systems ✅
### 3.1 Data Layer
- [x] `Stats.ts` — stat definitions + 9 growth rate tables
- [x] `ClassTree.ts` — full 10-tier × 9 class + 3 master fusions
- [x] `ItemDB.ts` — 14 items with Tarkov grid sizes

### 3.2 Character & Fusion
- [x] `Character.ts` — full character model with level/promote/fusion
- [x] `FusionSystem.ts` — 3-char merge logic

### 3.3 Tarkov-Style Inventory
- [x] `GridInventory.ts` — 2D grid backpack
- [x] `InventoryUI.ts` — canvas overlay with equipment slots + tooltips

### 3.4 Combat System
- [x] `TurnManager.ts` — AP-based turn queue
- [x] `CombatFormulas.ts` — damage/hit/crit/magic/heal formulas
- [x] `BuffSystem.ts` — 어택/프로텍션/퀵/힐 buffs

### 3.5 Enemy AI
- [x] `Enemy.ts` — aggro + pathfinding AI

### 3.6 Integration
- [x] GameEngine integration (inventory toggle, enemy spawn, combat, HP/MP bars, combat log)
- [x] Comprehensive UI/UX Polish (Backdrops, Key Help Panels, Navigation, Shop Tabs)
- [x] Browser verification passed
- [ ] Git commit & push Phase 3

### 4.1 Lobby System & Roster
- [x] `LobbyUI.ts` — Main menu / preparation screen (Hideout Theme)
- [x] `StashInventory.ts` — Huge grid inventory for safe storage
- [x] PC Roster System (Store unlimited characters)
- [x] Raid Party System (Max 4 active characters)
- [x] Integrate buff UI icons correctly
- [x] Support multiple characters and skill types
- [x] Connect buff skill metadata (`SkillDB.ts`) to player buff list
- [x] Dynamically scale combat damage calculations matching active buffsell items)
- [x] i18n Language Toggle (EN/KO) throughout UI
- [ ] Lobby Shop (Merchant to buy/sell items)

### 4.2 The Raid (Open World)
- [x] `GameModeManager.ts` — State machine (Lobby ↔ Raid)
- [x] Lootable objects (Chests, ground items) on the grid
- [x] Extraction Zones — Randomly placed tiles for escaping
- [x] Raid Time Limit — 20 min clock ticking down to MIA
- [x] Boss Monsters — 3 tiers (Corrupted Giant, Shadow Drake, Void Warden) spawning independently

### 4.3 Progression & Loss
- [x] Successful Extraction logic (keep stash and backpack, return to lobby)
- [x] Death logic (lose entire Shared Backpack, lose 1 random equipped item from EVERY party member, return to lobby)
- [ ] Implement Fog of War / Vision radius (optional, for tension)

### 4.4 Multiplayer
- [x] WebSocket server (`server/index.ts`)
- [x] NetworkManager client (`src/network/NetworkManager.ts`)
- [x] Remote player rendering with interpolation
- [x] Multiplayer lobby connection UI
- [x] Boss kill sync between players
