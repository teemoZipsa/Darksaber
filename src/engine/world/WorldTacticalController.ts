import { t } from '../../i18n/LanguageManager';
import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldHitParty } from '../../field/FieldTypes';
import type { FieldHit } from '../../field/FieldInteraction';
import {
    TacticalMarkerStore,
    buildTacticalMenuItems,
    makeTacticalTargetKey,
    type TacticalCommand,
    type TacticalTargetRef,
} from '../../field/TacticalMarkers';
import { TacticalContextMenuUI } from '../../ui/TacticalContextMenuUI';

type WorldTacticalFieldHit = FieldHit<FieldHitParty, Enemy, LootObject>;

export interface WorldTacticalContext {
    resolveFieldHitAt: (tile: TilePoint) => WorldTacticalFieldHit;
    getEnemyById: (enemyId: string) => Enemy | null;
    getPartyActors: () => FieldActor[];
    getLoot: () => LootObject[];
    log(message: string): void;
}

export class WorldTacticalController {
    private readonly context: WorldTacticalContext;
    private readonly menuUI = new TacticalContextMenuUI();
    private readonly markerStore = new TacticalMarkerStore();
    private menuTarget: TacticalTargetRef | null = null;

    constructor(context: WorldTacticalContext) {
        this.context = context;
    }

    public isOpen(): boolean {
        return this.menuUI.getIsOpen();
    }

    public close(): void {
        this.menuTarget = null;
        this.menuUI.close();
    }

    public onMouseMove(x: number, y: number): void {
        this.menuUI.onMouseMove(x, y);
    }

    public render(ctx: CanvasRenderingContext2D): void {
        this.menuUI.render(ctx);
    }

    public open(tile: TilePoint, uiX: number, uiY: number, uiWidth: number, uiHeight: number): void {
        const target = this.getTacticalTarget(tile);
        const items = buildTacticalMenuItems(target);
        this.menuTarget = target;
        this.menuUI.open(uiX, uiY, items, uiWidth, uiHeight);
    }

    public handleClick(x: number, y: number): void {
        const result = this.menuUI.onClick(x, y);
        if (!result) return;
        if (result === 'outside') {
            this.close();
            return;
        }

        this.executeTacticalCommand(result);
    }

    public updateMarkers(dt: number): void {
        this.markerStore.update(dt, (targetKey) => this.resolveTacticalMarkerTile(targetKey));
    }

    public getMarkers() {
        return this.markerStore.getMarkers();
    }

    private executeTacticalCommand(command: TacticalCommand): void {
        const target = this.menuTarget;
        if (!target) return;

        switch (command) {
            case 'ping':
                this.markerStore.addPing(target);
                this.context.log(t('tactical.log.ping'));
                break;
            case 'rally':
                if (target.kind === 'ground') {
                    this.markerStore.setRally(target.tile);
                    this.context.log(t('tactical.log.rally'));
                }
                break;
            case 'watch':
                if (this.markerStore.setWatch(target)) {
                    this.context.log(t('tactical.log.watch'));
                }
                break;
            case 'clear':
                this.markerStore.clear(target);
                this.context.log(t('tactical.log.clear'));
                break;
        }

        this.close();
    }

    private getTacticalTarget(tile: TilePoint): TacticalTargetRef {
        const hit = this.context.resolveFieldHitAt(tile);
        switch (hit.kind) {
            case 'enemy':
                return {
                    kind: 'enemy',
                    tile: this.enemyTile(hit.enemy),
                    targetKey: makeTacticalTargetKey('enemy', hit.enemy.id),
                };
            case 'party':
                return {
                    kind: 'party',
                    tile: { x: hit.party.gridX, y: hit.party.gridY },
                    targetKey: makeTacticalTargetKey('party', hit.party.id),
                };
            case 'loot':
                return {
                    kind: 'loot',
                    tile: { x: hit.loot.x, y: hit.loot.y },
                    targetKey: makeTacticalTargetKey('loot', hit.loot.id),
                };
            case 'ground':
                return { kind: 'ground', tile: hit.tile };
            case 'blocked':
                return { kind: 'blocked', tile: hit.tile };
        }
    }

    private resolveTacticalMarkerTile(targetKey: string): TilePoint | null {
        const separator = targetKey.indexOf(':');
        if (separator < 0) return null;
        const kind = targetKey.slice(0, separator);
        const id = targetKey.slice(separator + 1);

        if (kind === 'enemy') {
            const enemy = this.context.getEnemyById(id);
            return enemy && enemy.stats.hp > 0 ? this.enemyTile(enemy) : null;
        }

        if (kind === 'loot') {
            const loot = this.context.getLoot().find((candidate) => candidate.id === id && !candidate.opened);
            return loot ? { x: loot.x, y: loot.y } : null;
        }

        if (kind === 'party') {
            const actor = this.context.getPartyActors().find((candidate) => candidate.id === id && !candidate.character.isDead);
            return actor ? { x: actor.entity.gridX, y: actor.entity.gridY } : null;
        }

        return null;
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }
}
