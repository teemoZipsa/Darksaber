import { ActionMenuUI } from '../../ui/ActionMenuUI';
import { EntityInfoUI } from '../../ui/EntityInfoUI';
import { EffectManager } from '../../ui/EffectManager';
import { FloatingTextManager } from '../../ui/FloatingTextManager';
import { FusionTempleUI } from '../../ui/FusionTempleUI';
import { WorldFieldFeedbackState } from './WorldFieldFeedbackState';

export interface WorldEngineUiState {
    actionMenuUI: ActionMenuUI;
    entityInfoUI: EntityInfoUI;
    fusionTempleUI: FusionTempleUI;
    fieldFeedback: WorldFieldFeedbackState;
    floatingText: FloatingTextManager;
    effectManager: EffectManager;
}

export function createWorldEngineUiState(): WorldEngineUiState {
    return {
        actionMenuUI: new ActionMenuUI(),
        entityInfoUI: new EntityInfoUI(),
        fusionTempleUI: new FusionTempleUI(),
        fieldFeedback: new WorldFieldFeedbackState(),
        floatingText: new FloatingTextManager(),
        effectManager: new EffectManager(),
    };
}
