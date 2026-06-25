import type { Character } from '../character/Character';
import type { PartyManager } from '../character/PartyManager';
import type { PlayerData } from '../data/PlayerData';
import type { GridInventory, PlacedItem } from '../inventory/GridInventory';
import type { CharacterSavePatch, InventorySaveItem, InventorySaveSnapshot } from '../shared/CharacterSave';
import { normalizeLoadout } from '../magic/MagicLoadout';

export interface HubSaveSerializerInput {
    playerData: PlayerData;
    inventory: GridInventory;
    stash: GridInventory;
    party: PartyManager;
    hubTownId: string;
}

export function buildHubSavePatch(input: HubSaveSerializerInput): CharacterSavePatch {
    const activeCharacter = input.party.getActive();
    return {
        hubLocation: {
            realm: 'mortal',
            townId: input.hubTownId,
            pendingRestMenuId: input.playerData.pendingRestMenuId,
        },
        questState: {
            gold: input.playerData.gold,
            questItemIds: Array.from(input.playerData.questItems),
            storyCompanionIds: Array.from(input.playerData.storyCompanions),
            marketState: input.playerData.marketState,
            marketCycle: input.playerData.marketCycle,
            marketContracts: input.playerData.marketContracts,
        },
        inventory: serializeGridInventory(input.inventory),
        stashSnapshot: serializeGridInventory(input.stash),
        equipment: activeCharacter ? serializeEquipment(activeCharacter) : {},
        partySnapshot: {
            activeCharacterIds: input.party.getCharacters().map((character) => character.id),
        },
        rosterSnapshot: {
            characters: input.party.getRoster().map((character) => ({
                id: character.id,
                name: character.name,
                classKey: character.classLineId,
                classLineId: character.classLineId,
                gender: character.gender,
                tier: character.currentTier,
                level: character.level,
                exp: character.exp,
                baseStats: character.stats,
                magicLoadout: normalizeLoadout(character.magicLoadout, character),
                skillUpgradeLevels: { ...character.skillUpgradeLevels },
            })),
        },
    };
}

export function serializeGridInventory(grid: GridInventory): InventorySaveSnapshot {
    return {
        width: grid.width,
        height: grid.height,
        items: grid.items.map(serializePlacedItem),
    };
}

function serializePlacedItem(placed: PlacedItem): InventorySaveItem {
    return {
        itemId: placed.item.id,
        gridX: placed.gridX,
        gridY: placed.gridY,
        quantity: Math.max(1, Math.floor(placed.quantity)),
        durability: Math.max(0, Math.floor(placed.durability)),
        ...(placed.acquiredInRaid ? { acquiredInRaid: true } : {}),
        ...(placed.sockets && placed.sockets.length > 0
            ? { sockets: placed.sockets.map((socket) => socket.id) }
            : {}),
    };
}

function serializeEquipment(character: Character): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [slot, placed] of character.equipment.entries()) {
        if (!placed) {
            result[slot] = null;
            continue;
        }
        result[slot] = serializePlacedItem(placed);
    }
    return result;
}
