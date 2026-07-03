import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineCombatControllers } from './WorldEngineCombatControllers';
import type { WorldEnginePresentationControllers } from './WorldEnginePresentationControllers';
import type { WorldEngineRaidLifecycleControllers } from './WorldEngineRaidLifecycleControllers';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineWorldControllers } from './WorldEngineWorldControllers';

export interface WorldEngineControllerState {
    combatControllers: WorldEngineCombatControllers | undefined;
    actionControllers: WorldEngineActionControllers | undefined;
    raidLifecycleControllers: WorldEngineRaidLifecycleControllers | undefined;
    presentationControllers: WorldEnginePresentationControllers | undefined;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers | undefined;
    worldControllers: WorldEngineWorldControllers | undefined;
}

export function createWorldEngineControllerState(): WorldEngineControllerState {
    return {
        combatControllers: undefined,
        actionControllers: undefined,
        raidLifecycleControllers: undefined,
        presentationControllers: undefined,
        scenarioNetworkControllers: undefined,
        worldControllers: undefined,
    };
}
