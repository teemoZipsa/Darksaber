import type { Character } from '../../character/Character';
import {
    applyGuardToDamage,
    applyStatuses,
    cleanseNegativeStatuses,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
} from '../../combat/StatusEffects';
import type { Skill } from '../../data/SkillDB';
import { getLearnedSkills } from '../../data/SkillDB';
import { getClassLine } from '../../data/ClassTree';
import type { Enemy } from '../../entity/Enemy';
import type { TileType } from '../../map/Tile';
import type { SkillEffectEnemyInput, SkillEffectResult, SkillTerrainContext } from '../../combat/SkillEffectResolver';
import { resolveSkillEffect } from '../../combat/SkillEffectResolver';
import { MAGIC_AP_COST } from '../../field/FieldActionEconomy';
import type { TilePoint } from '../../field/FieldPathing';
import { tileKey } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldMagicState } from '../../field/FieldTypes';
import {
    buildSkillTerrainContext,
    getSkillCandidateEnemies as resolveSkillCandidateEnemies,
} from '../../field/FieldTargeting';
import { getEffectTiles, getSelectableTiles, type PatternContext } from '../../field/TargetPatterns';
import { getSkillAttackProfile } from '../../data/AttackPatternProfiles';
import { isTerrainLineOfSightBlocking } from '../../field/TerrainRules';
import { MagicUI } from '../../ui/MagicUI';

export interface WorldMagicContext {
    getActivePartyTurnActor: () => FieldActor | null;
    getFieldEnemies: () => FieldEnemy[];
    getEnemyById: (enemyId: string) => Enemy | null;
    getRemainingActionPoints: () => number;
    getTileAt: (tile: TilePoint) => TileType;
    getBoundsTiles: () => { width: number; height: number };
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint) => boolean;
    spendAp: (cost: number) => boolean;
    reopenActionMenu: (actor: FieldActor) => void;
    resumeOrEndActiveTurn: (actor: FieldActor) => void;
    handleEnemyDefeated: (actor: FieldActor, enemy: Enemy) => void;
    tryEnemyCounterAttack: (enemy: Enemy, actor: FieldActor) => boolean;
}

export interface WorldMagicEventSink {
    log(message: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
    spawnHitEffect(x: number, y: number): void;
    spawnBuffEffect(x: number, y: number): void;
    spawnDebuffEffect(x: number, y: number): void;
    spawnElementEffect(element: Skill['element'], x: number, y: number): void;
}

export class WorldMagicController {
    private readonly context: WorldMagicContext;
    private readonly sink: WorldMagicEventSink;
    private readonly magicUI = new MagicUI();
    private state: FieldMagicState = { mode: 'idle' };

    constructor(context: WorldMagicContext, sink: WorldMagicEventSink) {
        this.context = context;
        this.sink = sink;
        this.magicUI.onSkillSelect = (skill) => this.handleSkillSelect(skill);
    }

    public getState(): FieldMagicState {
        return this.state;
    }

    public isActive(): boolean {
        return this.state.mode !== 'idle' || this.magicUI.isVisible();
    }

    public isVisible(): boolean {
        return this.magicUI.isVisible();
    }

    public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.magicUI.render(ctx, width, height);
    }

    public onMouseMove(x: number, y: number): void {
        this.magicUI.onMouseMove(x, y);
    }

    public onMouseUp(): void {
        this.magicUI.onMouseUp();
    }

    public onScroll(delta: number): void {
        this.magicUI.onScroll(delta);
    }

    public updateMp(mp: number): void {
        this.magicUI.updateMp(mp);
    }

    public handleMenuMouseDown(x: number, y: number): void {
        const wasMenu = this.state.mode === 'menu';
        this.magicUI.onMouseDown(x, y);
        if (wasMenu && this.state.mode === 'menu' && !this.magicUI.isVisible()) {
            this.reset();
        }
    }

    public open(actor: FieldActor): void {
        if (hasStatus(actor.character.statuses, 'silence')) {
            this.sink.log('침묵 상태로 마법을 사용할 수 없습니다.');
            this.context.reopenActionMenu(actor);
            return;
        }
        if (this.context.getRemainingActionPoints() < MAGIC_AP_COST) {
            this.sink.log('마법을 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        const unlocked = this.getUnlockedSkillIds(actor.character);
        const learned = getLearnedSkills(actor.character.classLineId, actor.character.currentTier, unlocked);
        if (learned.length === 0) {
            this.sink.log('사용 가능한 마법이 없습니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        this.state = { mode: 'menu' };
        const effective = getEffectiveStatsForCharacter(actor.character);
        this.magicUI.show(
            actor.character.classLineId,
            actor.character.currentTier,
            actor.character.stats.mp,
            effective.maxMp,
            unlocked
        );
        this.sink.log('마법을 선택하세요.');
    }

    public handleTargetClick(tile: TilePoint): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor || this.state.mode !== 'targeting') return;

        const targetTileKey = tileKey(tile.x, tile.y);
        if (!this.state.validTiles.has(targetTileKey)) {
            this.sink.log('마법 사거리 밖입니다.');
            return;
        }

        const enemy = this.context.getFieldEnemies()
            .map((entry) => entry.enemy)
            .find((candidate) => candidate.stats.hp > 0 && candidate.gridX === tile.x && candidate.gridY === tile.y);
        if (!enemy) {
            this.sink.log('대상을 선택하세요.');
            return;
        }

        this.cast(actor, this.state.skill, enemy);
    }

    public updateHoverPreview(hoverTile: TilePoint): void {
        if (this.state.mode !== 'targeting') return;
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        const enemy = this.context.getFieldEnemies()
            .map((entry) => entry.enemy)
            .find((candidate) =>
                candidate.stats.hp > 0 &&
                candidate.gridX === hoverTile.x &&
                candidate.gridY === hoverTile.y &&
                this.state.mode === 'targeting' &&
                this.state.validTiles.has(tileKey(candidate.gridX, candidate.gridY))
            );
        const hoverAoeTiles = new Set<string>();
        if (enemy && this.state.mode === 'targeting') {
            const profile = getSkillAttackProfile(this.state.skill);
            for (const tile of getEffectTiles(profile, this.getPatternContext(actor, this.enemyTile(enemy)))) {
                hoverAoeTiles.add(tileKey(tile.x, tile.y));
            }
        }

        this.state = {
            ...this.state,
            hoverAoeTiles,
        };
    }

    public reset(): void {
        this.state = { mode: 'idle' };
        this.magicUI.hide();
    }

    public hasCastableFieldSkill(character: Character): boolean {
        if (hasStatus(character.statuses, 'silence')) return false;
        return this.getLearnedFieldSkills(character).some((skill) => character.stats.mp >= skill.mpCost);
    }

    private handleSkillSelect(skill: Skill): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (this.context.getRemainingActionPoints() < MAGIC_AP_COST) {
            this.sink.log('마법을 사용할 행동력이 부족합니다.');
            this.reset();
            this.context.reopenActionMenu(actor);
            return;
        }

        if (actor.character.stats.mp < skill.mpCost) {
            this.sink.log(`MP 부족! (${skill.mpCost} 필요)`);
            this.reset();
            this.context.reopenActionMenu(actor);
            return;
        }

        if (skill.type === 'heal' || skill.type === 'buff') {
            this.cast(actor, skill);
            return;
        }

        const validTiles = this.computeTargetTiles(actor, skill);
        this.state = { mode: 'targeting', skill, validTiles, hoverAoeTiles: new Set() };
        this.sink.log(`${skill.icon} ${skill.nameKr}: 대상을 선택하세요.`);
    }

    private cast(actor: FieldActor, skill: Skill, targetEnemy?: Enemy): void {
        if (this.context.getRemainingActionPoints() < MAGIC_AP_COST) {
            this.sink.log('마법을 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }
        if (actor.character.stats.mp < skill.mpCost) {
            this.sink.log(`MP 부족! (${skill.mpCost} 필요)`);
            this.context.reopenActionMenu(actor);
            return;
        }
        if ((skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe') && !targetEnemy) {
            this.sink.log('대상 없음!');
            return;
        }

        const targetEnemies = this.getCandidateEnemies(skill, targetEnemy);
        const effect = resolveSkillEffect({
            casterStats: actor.character.stats,
            casterCharacter: actor.character,
            skill,
            targetEnemy: targetEnemy ? this.toSkillEnemyInput(targetEnemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => this.toSkillEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(targetEnemy),
            terrainContext: this.getSkillTerrainContext(actor, targetEnemies, targetEnemy),
        });

        if (!this.context.spendAp(MAGIC_AP_COST)) {
            this.sink.log('마법을 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        this.applySkillEffect(actor, skill, effect);
        this.reset();
        this.context.resumeOrEndActiveTurn(actor);
    }

    private applySkillEffect(actor: FieldActor, skill: Skill, effect: SkillEffectResult): void {
        const effective = getEffectiveStatsForCharacter(actor.character);
        actor.character.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.character.stats.mp + effect.casterMpDelta));
        actor.character.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.character.stats.hp + effect.casterHpDelta));
        if (effect.casterHpDelta > 0) {
            this.sink.spawnHeal(actor.entity.gridX, actor.entity.gridY, effect.casterHpDelta);
            this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        } else if (effect.casterHpDelta < 0) {
            this.sink.spawnDamage(actor.entity.gridX, actor.entity.gridY, Math.abs(effect.casterHpDelta), false, false);
            this.sink.spawnHitEffect(actor.entity.gridX, actor.entity.gridY);
        }
        if (effect.cleansesCasterStatuses) {
            actor.character.statuses = cleanseNegativeStatuses(actor.character.statuses);
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'CLEANSE');
            this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }
        if (effect.casterStatusEffects) {
            actor.character.statuses = applyStatuses(actor.character.statuses, effect.casterStatusEffects);
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
            this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        } else if (effect.appliesBuff) {
            actor.character.applyBuff(effect.appliesBuff);
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
            this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }

        let counterTriggered = false;
        for (const enemyResult of effect.enemyResults) {
            const enemy = this.context.getEnemyById(enemyResult.enemyId);
            if (!enemy) continue;

            if (enemyResult.isMiss) {
                this.sink.spawnDamage(enemy.gridX, enemy.gridY, 0, false, true);
                this.sink.log(`${skill.nameKr} 명중 실패: ${enemy.name} (${Math.floor(enemyResult.hitChance ?? 0)}%)`);
                continue;
            }

            if (enemyResult.statusEffects) {
                enemy.statuses = applyStatuses(enemy.statuses, enemyResult.statusEffects);
                this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'WEAK');
                this.sink.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            }

            if (skill.element !== 'none' && skill.element !== 'physical') {
                this.sink.spawnElementEffect(skill.element, enemy.gridX, enemy.gridY);
            } else {
                this.sink.spawnHitEffect(enemy.gridX, enemy.gridY);
            }
            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            this.sink.spawnDamage(enemy.gridX, enemy.gridY, guarded.damage, false, false);
            if (guarded.guarded) this.sink.log(`${enemy.name} 방어: 피해 감소`);
            if (dead) this.context.handleEnemyDefeated(actor, enemy);
            else if (!guarded.guarded && !counterTriggered && this.context.tryEnemyCounterAttack(enemy, actor)) counterTriggered = true;
        }

        for (const log of effect.logs) this.sink.log(log);
    }

    private toSkillEnemyInput(enemy: Enemy): SkillEffectEnemyInput {
        return {
            id: enemy.id,
            name: enemy.name,
            gridX: enemy.gridX,
            gridY: enemy.gridY,
            stats: getEffectiveStatsForEnemy(enemy),
        };
    }

    private getUnlockedSkillIds(character: Character): string[] {
        const classLine = getClassLine(character.classLineId);
        const unlocked: string[] = [];
        if (!classLine) return unlocked;

        for (let tier = 1; tier <= character.currentTier; tier++) {
            const ids = classLine.skillUnlocks[tier];
            if (ids) unlocked.push(...ids);
        }
        return unlocked;
    }

    private getLearnedFieldSkills(character: Character): Skill[] {
        return getLearnedSkills(character.classLineId, character.currentTier, this.getUnlockedSkillIds(character));
    }

    private computeTargetTiles(actor: FieldActor, skill: Skill): Set<string> {
        const result = new Set<string>();
        const profile = getSkillAttackProfile(skill);
        for (const tile of getSelectableTiles(profile, this.getPatternContext(actor))) {
            result.add(tileKey(tile.x, tile.y));
        }
        return result;
    }

    private getCandidateEnemies(skill: Skill, targetEnemy?: Enemy): Enemy[] {
        const alive = this.context.getFieldEnemies()
            .map((entry) => entry.enemy)
            .filter((enemy) => enemy.stats.hp > 0);
        if (!targetEnemy) return alive;

        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return [targetEnemy];
        const profile = getSkillAttackProfile(skill);
        return resolveSkillCandidateEnemies(alive, profile, this.getPatternContext(actor, this.enemyTile(targetEnemy)), targetEnemy);
    }

    private getSkillTerrainContext(actor: FieldActor, targetEnemies: Enemy[], targetEnemy?: Enemy): SkillTerrainContext {
        return buildSkillTerrainContext({
            casterTile: this.actorTile(actor),
            targetEnemies,
            targetEnemy,
            getTileAt: (tile) => this.context.getTileAt(tile),
        });
    }

    private getPatternContext(actor: FieldActor, selectedTile?: TilePoint): PatternContext {
        const bounds = this.context.getBoundsTiles();
        return {
            casterTile: this.actorTile(actor),
            selectedTile,
            isInsideMap: (tile) => tile.x >= 0 && tile.y >= 0 && tile.x < bounds.width && tile.y < bounds.height,
            isBlockingTile: (tile) => isTerrainLineOfSightBlocking(this.context.getTileAt(tile)),
            hasLineOfSight: (from, to) => this.context.hasFieldLineOfSight(from, to),
        };
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }
}
