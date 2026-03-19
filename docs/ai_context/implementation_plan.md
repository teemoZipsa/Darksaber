# Phase 4: Extraction RPG Loop — Implementation Plan

## Goal
Transform the current engine into a **Tarkov-inspired Extraction SRPG** set in a huge, persistent io-style open world. Players will gear up in a safe lobby, deploy into a massive grid map, scavenge for loot, fight enemies in AP-based turn combat, and attempt to extract before they are overwhelmed.

## User Review Required
> [!IMPORTANT]
> **Extraction RPG Death Penalties**: Confirmed by User!
> - The Backpack is a **Shared Inventory** for the entire party.
> - Equipment slots remain per-character.
> - On Death: The player loses the **entire Shared Backpack**, PLUS **1 random equipped item** from EVERY deployed character.

> **UI Language**: Added an `i18n` language toggle to support both English (EN) and Korean (KO) dynamically without mixed strings.

---

## Proposed Changes

### 4.1 The Lobby (Hideout / 은신처)
The Lobby is an HTML/UI-driven state where the player organizes before a raid. It is themed as the player's personal Hideout.
- **Stash (창고 시스템)**: A massive grid inventory (e.g., 20x15) where the player stores items safely.
- **Merchant / Shop**: An NPC interface to sell excess loot and buy basic gear/consumables.
- **PC Roster System**: Similar to the Pokemon Box, all owned characters are stored here.
- **Raid Party Builder**: The player selects up to **4 characters** from the PC Roster to take into the Raid.
- **i18n Toggle**: Top right button to instantly switch UI text between English and Korean.
- **Auto-Heal**: Characters returning to the hideout are automatically fully healed.
- **Deployment**: Enter the Raid map.

### 4.2 The Raid (Open World io-style Map)
The actual gameplay state using our `GameEngine` and `WorldMap` chunk system.
- **Procedural Map**: Infinite virtual map.
- **Raid Timer**: A strict time limit (e.g., 10-15 minutes or 100 turns). If the timer hits zero, the player is considered MIA (Missing in Action) and suffers the Death Penalty.
- **Random Extraction Zones**: Escape points are generated randomly across the map to prevent camping.
- **AI Enemies & Bosses**: Normal monsters roaming everywhere, with occasional high-tier Bosses that drop rare loot.
- **AP Management**: Running away or fighting costs Action Points. The player must carefully manage AP to survive. for X turns to extract.

### 4.3 Combat & Survival AI
- **Wandering Mobs**: Enemies will spawn dynamically around the player, mimicking an active world.
- **AP Management**: Running away or fighting costs Action Points. The player must carefully manage AP to survive.
- **Visibility/Fog of War (Optional step)**: To add tension, players will only see a certain radius or line-of-sight.

### 4.4 Flow Control & Data (`src/engine/GameModeManager.ts`)
- [NEW] `GameModeManager.ts` / `GameState.ts`: State machine handling `LOBBY` ↔ `RAID`.
- [NEW] `LobbyUI.ts`: The main menu for the Lobby state, linking the Roster and Shared Backpack.
- [NEW] `LanguageManager.ts`: Stores EN/KO translation dictionaries.
- [NEW] `ExtractionSystem.ts`: Handles the logic of successful extraction (moving backpack items to Stash) or death (clearing backpack and deleting 1 random equip per char).

---

## Verification Plan

### Automated Tests
- Test Stash ↔ Backpack drag-and-drop.
- Test transitioning between Lobby and Raid states.

### Manual Verification
1. User drops into the map with empty spaces in backpack.
2. User loots a sword from a chest.
3. User reaches an extraction point and extracts.
4. User verifies the sword is now in the Lobby Stash.
5. User drops into the map, dies to an enemy, and verifies backpack is wiped.
