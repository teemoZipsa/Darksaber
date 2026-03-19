# Darksaber — Phase 2 & 3 Walkthrough

## What Was Built

### Phase 2: Core Engine ✅
- **Procedural terrain** via multi-octave noise (grass, water, sand, forest, stone, wall, lava)
- **Chunk streaming** — seamless infinite map with OffscreenCanvas caching (60 FPS)
- **Camera** with smooth lerp follow
- **Movement** with terrain collision (can't walk on water/walls)
- **Grid overlay** with Dark Saver-style yellow diamond movement range

### Phase 3: Gameplay Systems ✅
- **10-tier class tree** — 9 base classes across 3 branches, 3 master fusions
- **Tarkov-style inventory** — variable-size items in a 10×6 grid backpack (Tab key)
- **Combat** — Space to attack adjacent enemies, hit/miss/crit rolls, combat log
- **5 enemy types** — aggro detection, chase AI, counterattack
- **HP/MP bars** — player and enemy health tracking

### Phase 4: The Raid & Open World 🚧 (In Progress)
- **Hideout UI** — Safe lobby (Stash + Roster) with an i18n English/Korean toggle.
- **Drag-and-Drop Stash** — Manage the shared backpack between raids.
- **Raid Entry & Timers** — Strict raid timers and randomly positioned Extraction Zones to escape.
- **Real-Time ATB Combat** — Action Gauges fill continuously based on the Speed stat. Fast enemies act autonomously while the player's gauge is filling.
- **High-Stakes Death Penalty** — Dying in a raid deletes the entire shared backpack and 1 random equipped piece per character.

---

## Screenshots

### Procedural Map with Diamond Range Indicator
![Initial engine render](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/initial_spawn_check_1773904398011.png)

### Tarkov-Style Grid Inventory (Tab key)
![Inventory overlay](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/inventory_overlay_1773905329838.png)

### Combat with Enemies
![Combat engagement](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/after_attack_1773905345738.png)

## Browser Recording (Phase 3 Turn Combat)
![Phase 3 gameplay test](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/phase3_gameplay_test_1773905302057.webp)

## Browser Recording (Phase 4 ATB Combat)
![Phase 4 gameplay test](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/atb_combat_test_v2_1773908831160.webp)

## Browser Recording (Pure i18n Language Toggle)
![Pure i18n Toggle Test](C:/Users/arasoftGJ_01/.gemini/antigravity/brain/74600803-e60a-4128-87f0-7de5225526a9/i18n_toggle_test_1773909320287.webp)

---

## Controls
| Key | Action |
|-----|--------|
| ↑↓←→ / WASD | Move on grid |
| Space | Attack adjacent enemy |
| Tab / I | Toggle inventory |

## Files Created (Phase 3)
| File | Purpose |
|------|---------|
| [Stats.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/data/Stats.ts) | 9 growth rate tables |
| [ClassTree.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/data/ClassTree.ts) | Full 10-tier × 9 class + 3 master fusions |
| [ItemDB.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/data/ItemDB.ts) | 14 items with Tarkov grid sizes |
| [Character.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/character/Character.ts) | Level/promote/fusion model |
| [FusionSystem.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/character/FusionSystem.ts) | 3-char merge logic |
| [GridInventory.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/inventory/GridInventory.ts) | Tarkov 2D grid backpack |
| [InventoryUI.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/inventory/InventoryUI.ts) | Canvas overlay UI |
| [TurnManager.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/combat/TurnManager.ts) | AP-based turn queue |
| [CombatFormulas.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/combat/CombatFormulas.ts) | Damage/hit/crit formulas |
| [BuffSystem.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/combat/BuffSystem.ts) | 4 core buffs |
| [Enemy.ts](file:///c:/Users/arasoftGJ_01/companyWork/Darksaber/src/entity/Enemy.ts) | Enemy AI |
