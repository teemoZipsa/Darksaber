import type { Camera } from '../Camera';
import type { InputManager } from '../InputManager';

export interface WorldEngineUpdateFlowContext {
    advanceWorldTime: (dt: number) => void;
    syncTown: () => void;
    isRaidOutcomeVisible: () => boolean;
    updateRaidOutcomeInput: (input: InputManager) => void;
    isFusionTempleVisible: () => boolean;
    updateFusionTempleInput: (input: InputManager) => void;
    isTownVisible: () => boolean;
    updateTownInput: (input: InputManager) => void;
    isTutorialActive: () => boolean;
    isTutorialCompletePending: () => boolean;
    updateTutorialCompletion: (input: InputManager, dt: number, camera: Camera) => void;
    finishTutorial: (skipReward: boolean) => void;
    addTutorialBlockedLog: () => void;
    isNetworkRaid: () => boolean;
    updateNetworkRaid: (dt: number, input: InputManager, camera: Camera) => void;
    updateStoryPresentation: (dt: number, camera: Camera) => boolean;
    refreshOpenActionMenuState: () => void;
    processInput: (input: InputManager, camera: Camera) => void;
    updatePartyMovement: (dt: number) => void;
    updateEnemyMovement: (dt: number) => void;
    refreshEnemyIntentPreviews: () => void;
    updateRestingActors: (dt: number) => void;
    updateEffects: (dt: number) => void;
    updateFloatingText: (dt: number) => void;
    updateAttackCues: (dt: number) => void;
    processQueuedIntents: () => void;
    refreshLootState: () => void;
    updateTacticalMarkers: (dt: number) => void;
    startNextReadyTurn: () => void;
    updateRaidTimer: (dt: number) => void;
    checkRaidEndConditions: () => void;
    checkTempleArrival: () => void;
    checkDungeonArrival: () => void;
    syncControlledPlayer: () => void;
    followPlayerCamera: (camera: Camera, dt: number) => void;
}

export class WorldEngineUpdateFlow {
    public constructor(private readonly context: WorldEngineUpdateFlowContext) {}

    public update(dt: number, input: InputManager, camera: Camera): void {
        this.context.advanceWorldTime(dt);
        this.context.syncTown();

        if (this.context.isRaidOutcomeVisible()) {
            this.context.updateRaidOutcomeInput(input);
            this.context.followPlayerCamera(camera, dt);
            return;
        }

        if (this.context.isFusionTempleVisible()) {
            this.context.updateFusionTempleInput(input);
            this.context.followPlayerCamera(camera, dt);
            return;
        }

        if (this.context.isTownVisible()) {
            this.context.updateTownInput(input);
            this.context.followPlayerCamera(camera, dt);
            return;
        }

        if (this.context.isTutorialActive() && this.context.isTutorialCompletePending()) {
            this.context.updateTutorialCompletion(input, dt, camera);
            return;
        }

        if (this.context.isTutorialActive() && input.justPressed('Escape')) {
            this.context.finishTutorial(true);
            this.context.followPlayerCamera(camera, dt);
            return;
        }

        if (this.context.isNetworkRaid()) {
            this.context.updateNetworkRaid(dt, input, camera);
            return;
        }

        if (this.context.updateStoryPresentation(dt, camera)) return;

        if (this.context.isTutorialActive() && input.mouseRightJustDown) {
            this.context.addTutorialBlockedLog();
            this.context.followPlayerCamera(camera, dt);
            return;
        }

        this.context.refreshOpenActionMenuState();
        this.context.processInput(input, camera);
        this.context.updatePartyMovement(dt);
        this.context.updateEnemyMovement(dt);
        this.context.refreshEnemyIntentPreviews();
        this.context.refreshOpenActionMenuState();
        this.context.updateRestingActors(dt);
        this.context.updateEffects(dt);
        this.context.updateFloatingText(dt);
        this.context.updateAttackCues(dt);
        this.context.processQueuedIntents();
        this.context.refreshLootState();
        this.context.updateTacticalMarkers(dt);
        this.context.startNextReadyTurn();
        this.context.updateRaidTimer(dt);
        this.context.checkRaidEndConditions();
        this.context.checkTempleArrival();
        this.context.checkDungeonArrival();
        this.context.syncControlledPlayer();
        this.context.followPlayerCamera(camera, dt);
    }
}
