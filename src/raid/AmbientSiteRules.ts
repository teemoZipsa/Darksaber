import type { WorldMapAmbientSiteKind } from '../map/WorldMap';
import type { ScenarioFieldEventRewardResult } from '../net/WorldProtocol';

export interface AmbientSiteOutcome {
    rewards: ScenarioFieldEventRewardResult[];
    trapMaxHpRatio?: number;
}

export function getAmbientSiteOutcome(kind: WorldMapAmbientSiteKind, siteId: string): AmbientSiteOutcome {
    const roll = hashString(siteId);
    switch (kind) {
        case 'abandonedCamp':
            return { rewards: [{ type: 'item', itemId: 'herb_common' }] };
        case 'roadsideRuins':
            return {
                rewards: [{
                    type: 'item',
                    itemId: roll < 0.5 ? 'trade_forest_resin' : 'trade_shadow_amber',
                }],
            };
        case 'brokenWaystone':
            return { rewards: [{ type: 'gold', amount: 35 + Math.floor(roll * 16) }] };
        case 'swampTotem':
            return roll < 0.42
                ? { rewards: [], trapMaxHpRatio: 0.12 }
                : { rewards: [{ type: 'item', itemId: 'antidote' }] };
    }
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0x1_0000_0000;
}
