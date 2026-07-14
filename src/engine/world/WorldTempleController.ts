import type { PartyManager } from '../../character/PartyManager';
import {
    fuseActivePartyBranch,
    getFusionCandidates,
    hasActiveMasterCharacter,
} from '../../character/FusionSystem';
import type { Player } from '../../entity/Player';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { WorldMap } from '../../map/WorldMap';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import type { MasterBranch } from '../../data/ClassTree';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldRealmId } from '../../net/WorldProtocol';
import { t } from '../../i18n/LanguageManager';

export interface WorldTempleContext {
    party: PartyManager;
    raidSession: WorldRaidSession;
    fusionTempleUI: FusionTempleUI;
    getWorldMap(): WorldMap;
    getControlledActor(): FieldActor | null;
    getFieldEnemies(): FieldEnemy[];
    isNetworkRaid(): boolean;
    getPhase(): WorldPhase;
    setPhase(phase: WorldPhase): void;
    beginRaidFromCurrentHub(realm: WorldRealmId): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    placePartyNear(tile: TilePoint): void;
    setPlayer(player: Player): void;
    setFieldEnemies(enemies: FieldEnemy[]): void;
    clearWorldLoot(): void;
    selectActor(actorId: string | null): void;
    log(message: string): void;
}

export class WorldTempleController {
    private readonly context: WorldTempleContext;
    private dismissedTempleVisitKey: string | null = null;

    constructor(context: WorldTempleContext) {
        this.context = context;
        this.context.fusionTempleUI.onFuse = (branch) => this.performFusion(branch);
        this.context.fusionTempleUI.onEnterMasterWorld = () => this.enterMasterWorld();
        this.context.fusionTempleUI.onReturnToMortalWorld = () => this.returnToMortalWorld();
        this.context.fusionTempleUI.onClose = () => {
            this.dismissedTempleVisitKey = this.getCurrentTempleVisitKey();
        };
    }

    public checkArrival(): void {
        const actor = this.context.getControlledActor();
        if (!actor) return;

        const worldMap = this.context.getWorldMap();
        const temple = worldMap.getTempleAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!temple) {
            this.dismissedTempleVisitKey = null;
            return;
        }

        const key = this.getCurrentTempleVisitKey();
        if (!key || this.dismissedTempleVisitKey === key || this.context.fusionTempleUI.isVisible()) return;

        const hostileActive = this.context.getFieldEnemies().some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro);
        if (hostileActive) {
            this.context.log(t('field.log.templeBlocked'));
            this.dismissedTempleVisitKey = key;
            return;
        }

        this.openFusionTemple();
    }

    private openFusionTemple(): void {
        const worldMap = this.context.getWorldMap();
        this.context.closeFieldOverlays();
        this.context.clearFieldTurnState();
        this.context.fusionTempleUI.show({
            realm: worldMap.getRealm(),
            candidates: getFusionCandidates(this.context.party),
            canEnterMasterWorld: hasActiveMasterCharacter(this.context.party),
        });
        this.context.log(worldMap.getRealm() === 'master'
            ? t('field.log.templeMasterGate')
            : t('field.log.templeFusion'));
    }

    private performFusion(branch: MasterBranch): void {
        const result = fuseActivePartyBranch(this.context.party, branch);
        this.context.log(result.message);
        if (!result.success) {
            this.context.fusionTempleUI.show({
                realm: this.context.getWorldMap().getRealm(),
                candidates: getFusionCandidates(this.context.party),
                canEnterMasterWorld: hasActiveMasterCharacter(this.context.party),
            });
            return;
        }

        this.context.fusionTempleUI.hide();
        this.enterMasterWorld();
    }

    private enterMasterWorld(): void {
        if (!hasActiveMasterCharacter(this.context.party)) {
            this.context.log(t('field.log.masterClassRequired'));
            return;
        }

        this.context.fusionTempleUI.hide();
        this.context.beginRaidFromCurrentHub('master');
    }

    private returnToMortalWorld(): void {
        this.context.fusionTempleUI.hide();
        if (this.context.isNetworkRaid() || this.context.getPhase() === 'raid') {
            this.context.beginRaidFromCurrentHub('mortal');
            return;
        }
        const worldMap = this.context.getWorldMap();
        this.context.raidSession.failBackToTown(this.context.raidSession.currentHubTownId);
        this.context.setPhase('lobby');
        worldMap.setRealm('mortal');
        this.context.placePartyNear(worldMap.getPrimaryTempleTile());
        const controlled = this.context.getControlledActor();
        if (controlled) this.context.setPlayer(controlled.entity);
        this.context.selectActor(controlled?.id ?? null);
        this.context.setFieldEnemies([]);
        this.context.clearWorldLoot();
        this.context.clearFieldTurnState();
        this.dismissedTempleVisitKey = this.getCurrentTempleVisitKey();
        this.context.log(t('field.log.returnedToMortalTemple'));
    }

    private getCurrentTempleVisitKey(): string | null {
        const actor = this.context.getControlledActor();
        if (!actor) return null;
        const worldMap = this.context.getWorldMap();
        const temple = worldMap.getTempleAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!temple) return null;
        return `${worldMap.getRealm()}:${temple.id}:${actor.entity.gridX},${actor.entity.gridY}`;
    }
}
