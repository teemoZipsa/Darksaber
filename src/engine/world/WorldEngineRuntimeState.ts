import type { TilePoint } from '../../field/FieldPathing';
import type { WorldPhase } from './WorldRaidSession';

export interface WorldEngineRuntimeState {
    currentPhase: WorldPhase;
    hoverTile: TilePoint;
    followRepathTimer: number;
    fanfareLeaderActorId: string | null;
    worldTime: number;
}

export function createWorldEngineRuntimeState(): WorldEngineRuntimeState {
    return {
        currentPhase: 'lobby',
        hoverTile: { x: -1, y: -1 },
        followRepathTimer: 0,
        fanfareLeaderActorId: null,
        worldTime: 0,
    };
}
