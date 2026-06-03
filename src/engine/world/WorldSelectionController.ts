import { getEffectiveStatsForCharacter, getEffectiveStatsForEnemy, getStatusIcons, getStatusKinds } from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { Entity } from '../../entity/Entity';
import { getEnemyRoleLabel } from '../../field/FieldDisplay';
import type { FieldActor } from '../../field/FieldTypes';
import type { EntityDisplayInfo, EntityDisplaySpriteSheet } from '../../ui/EntityInfoUI';

export interface WorldSelectionContext {
    getPartyActors: () => FieldActor[];
    getEnemyById: (enemyId: string) => Enemy | null;
    getLootById: (lootId: string) => LootObject | null;
}

export class WorldSelectionController {
    private readonly context: WorldSelectionContext;
    private selectedActorId: string | null = null;
    private selectedEnemyId: string | null = null;
    private selectedLootId: string | null = null;

    constructor(context: WorldSelectionContext) {
        this.context = context;
    }

    public get actorId(): string | null {
        return this.selectedActorId;
    }

    public get enemyId(): string | null {
        return this.selectedEnemyId;
    }

    public get lootId(): string | null {
        return this.selectedLootId;
    }

    public hasSelection(): boolean {
        return Boolean(this.selectedActorId || this.selectedEnemyId || this.selectedLootId);
    }

    public clear(): void {
        this.selectedActorId = null;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
    }

    public selectActor(actorId: string | null): void {
        this.selectedActorId = actorId;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
    }

    public selectEnemy(enemyId: string): void {
        this.selectedActorId = null;
        this.selectedEnemyId = enemyId;
        this.selectedLootId = null;
    }

    public selectLoot(lootId: string): void {
        this.selectedActorId = null;
        this.selectedEnemyId = null;
        this.selectedLootId = lootId;
    }

    public clearEnemyIfSelected(enemyId: string): void {
        if (this.selectedEnemyId === enemyId) this.selectedEnemyId = null;
    }

    public getSelectedDisplayInfo(): EntityDisplayInfo | null {
        if (this.selectedActorId) {
            const actor = this.context.getPartyActors().find((candidate) => candidate.id === this.selectedActorId);
            if (!actor) return null;
            const stats = getEffectiveStatsForCharacter(actor.character);
            return {
                name: actor.character.name,
                className: actor.character.getTierName(),
                level: actor.character.level,
                hp: stats.hp,
                maxHp: stats.maxHp,
                mp: stats.mp,
                maxMp: stats.maxMp,
                actionGauge: actor.entity.actionGauge,
                exp: actor.character.exp,
                maxExp: actor.character.expToNext,
                buffs: getStatusIcons(actor.character.statuses),
                statusKinds: getStatusKinds(actor.character.statuses),
                atk: stats.atk,
                def: stats.def,
                magAtk: stats.magAtk,
                magDef: stats.magDef,
                spriteColor: actor.entity.color,
                spriteSheet: toDisplaySpriteSheet(actor.entity),
                spriteImage: actor.character.portraitImage,
            };
        }

        if (this.selectedEnemyId) {
            const enemy = this.context.getEnemyById(this.selectedEnemyId);
            if (!enemy) return null;
            const stats = getEffectiveStatsForEnemy(enemy);
            return {
                name: enemy.name || enemy.label,
                className: getEnemyRoleLabel(enemy.role),
                level: enemy.level,
                hp: enemy.stats.hp,
                maxHp: enemy.stats.maxHp,
                mp: enemy.stats.mp,
                maxMp: enemy.stats.maxMp,
                actionGauge: enemy.actionGauge,
                buffs: getStatusIcons(enemy.statuses),
                statusKinds: getStatusKinds(enemy.statuses),
                atk: stats.atk,
                def: stats.def,
                magAtk: stats.magAtk,
                magDef: stats.magDef,
                spriteColor: enemy.color,
                spriteSheet: toDisplaySpriteSheet(enemy),
                spriteImage: enemy.image,
            };
        }

        return null;
    }
}

function toDisplaySpriteSheet(entity: Entity): EntityDisplaySpriteSheet | undefined {
    if (!entity.walkSprite) return undefined;
    return {
        ...entity.walkSprite,
        loaded: entity.walkSpriteLoaded,
    };
}
