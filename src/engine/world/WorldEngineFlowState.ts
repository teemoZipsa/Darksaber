import type { WorldEngineActionTurnFlow } from './WorldEngineActionTurnFlow';
import type { WorldEngineUpdateFlow } from './WorldEngineUpdateFlow';
import { WorldTurnStateController } from './WorldTurnStateController';

export interface WorldEngineFlowState {
    turnStateController: WorldTurnStateController;
    actionTurnFlow: WorldEngineActionTurnFlow | undefined;
    updateFlow: WorldEngineUpdateFlow | undefined;
}

export function createWorldEngineFlowState(): WorldEngineFlowState {
    return {
        turnStateController: new WorldTurnStateController(),
        actionTurnFlow: undefined,
        updateFlow: undefined,
    };
}
