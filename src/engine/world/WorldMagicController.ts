import type { Character } from '../../character/Character';
import {
    applyGuardToDamage,
    applyStatuses,
    applyStatusesToCarrier,
    cleanseNegativeStatuses,
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    hasStatus,
} from '../../combat/StatusEffects';
import type { Skill } from '../../data/SkillDB';
import { getSkill } from '../../data/SkillDB';
import { formatT, t } from '../../i18n/LanguageManager';
import {
    getEffectiveSkill,
    getUpgradeLevel,
    normalizeLoadout,
} from '../../magic/MagicLoadout';
import type { SkillVisualPhase } from '../../data/SkillVisualProfiles';
import type { Enemy } from '../../entity/Enemy';
import type { TileType } from '../../map/Tile';
import type { SkillEffectEnemyInput, SkillEffectResult, SkillTerrainContext } from '../../combat/SkillEffectResolver';
import { resolveSkillEffect } from '../../combat/SkillEffectResolver';
import { MAGIC_ACTION_GAUGE_COST } from '../../field/FieldActionEconomy';
import type { TilePoint } from '../../field/FieldPathing';
import { manhattan, tileKey } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldMagicState } from '../../field/FieldTypes';
import {
    buildSkillTerrainContext,
    getSkillCandidateEnemies as resolveSkillCandidateEnemies,
} from '../../field/FieldTargeting';
import { getEffectTiles, getSelectableTiles, type PatternContext } from '../../field/TargetPatterns';
import { getSkillAttackProfile } from '../../data/AttackPatternProfiles';
import { isTerrainLineOfSightBlocking } from '../../field/TerrainRules';
import { FieldMagicMenu, type FieldMagicSlot } from '../../ui/FieldMagicMenu';
import type { CombatFeedbackKind } from './CombatFeedback';
import { AudioManager } from '../AudioManager';

export interface WorldMagicContext {
    getActivePartyTurnActor: () => FieldActor | null;
    getPartyActors: () => FieldActor[];
    getFieldEnemies: () => FieldEnemy[];
    getEnemyById: (enemyId: string) => Enemy | null;
    getRemainingActionPoints: () => number;
    getTileAt: (tile: TilePoint) => TileType;
    getBoundsTiles: () => { width: number; height: number };
    hasFieldLineOfSight: (from: TilePoint, to: TilePoint) => boolean;
    spendAp: (cost: number) => boolean;
    isMajorActionUsed: () => boolean;
    markMajorActionUsed: () => void;
    submitNetworkSkillIntent?: (actor: FieldActor, skill: Skill, targetEnemy?: Enemy) => boolean;
    reopenActionMenu: (actor: FieldActor) => void;
    resumeOrEndActiveTurn: (actor: FieldActor) => void;
    handleEnemyDefeated: (actor: FieldActor, enemy: Enemy, feedbackGroupId?: string) => void;
    onActionCompleted?: (action: 'magic') => void;
}

export interface WorldMagicEventSink {
    log(message: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
    spawnHitEffect(x: number, y: number, feedbackGroupId?: string, feedbackKind?: CombatFeedbackKind): void;
    spawnBuffEffect(x: number, y: number): void;
    spawnDebuffEffect(x: number, y: number): void;
    spawnElementEffect(element: Skill['element'], x: number, y: number, feedbackGroupId?: string): void;
    spawnSkillEffect(skill: Skill, x: number, y: number, phase: SkillVisualPhase, feedbackGroupId?: string): void;
    beginFeedbackGroup?(): string;
    flushFeedbackGroup?(feedbackGroupId: string): void;
}

export class WorldMagicController {
    private readonly context: WorldMagicContext;
    private readonly sink: WorldMagicEventSink;
    private readonly menu = new FieldMagicMenu();
    private state: FieldMagicState = { mode: 'idle' };

    constructor(context: WorldMagicContext, sink: WorldMagicEventSink) {
        this.context = context;
        this.sink = sink;
    }

    public getState(): FieldMagicState {
        return this.state;
    }

    public isActive(): boolean {
        return this.state.mode !== 'idle' || this.menu.isVisible();
    }

    public isVisible(): boolean {
        return this.menu.isVisible();
    }

    /** Rendered in world-zoom space around the actor (see WorldRenderController). */
    public render(ctx: CanvasRenderingContext2D, playerScreenX: number, playerScreenY: number): void {
        this.menu.render(ctx, playerScreenX, playerScreenY);
    }

    public onMouseMove(x: number, y: number): void {
        this.menu.onMouseMove(x, y);
    }

    public onMouseUp(): void {
        this.menu.onMouseUp();
    }

    public onScroll(_delta: number): void {
        /* radial menu does not scroll */
    }

    /** Refresh per-slot MP affordability while the menu is open. */
    public updateMp(_mp: number): void {
        const actor = this.context.getActivePartyTurnActor();
        if (actor && this.menu.isVisible()) this.menu.show(this.buildSlots(actor));
    }

    public handleMenuMouseDown(x: number, y: number): void {
        if (this.state.mode !== 'menu') return;
        const result = this.menu.onClick(x, y);
        const actor = this.context.getActivePartyTurnActor();
        if (result.kind === 'cancel') {
            if (actor) this.cancelToActionMenu(actor);
            else this.reset();
            return;
        }
        this.selectSlot(result.index);
    }

    /** Number-key (1..8) skill selection while the radial menu is open. */
    public handleMenuDigit(digit: number): boolean {
        if (this.state.mode !== 'menu') return false;
        const index = this.menu.indexForDigit(digit);
        if (index === null) return false;
        this.selectSlot(index);
        return true;
    }

    /** Esc / right-click / outside-click: abort selection and reopen the action menu. */
    public cancelToActionMenu(actor: FieldActor): void {
        this.reset();
        this.context.reopenActionMenu(actor);
    }

    public open(actor: FieldActor): void {
        if (hasStatus(actor.character.statuses, 'silence')) {
            this.sink.log(t('field.magic.silenced'));
            this.context.reopenActionMenu(actor);
            return;
        }
        if (this.context.getRemainingActionPoints() < MAGIC_ACTION_GAUGE_COST) {
            this.sink.log(t('field.magic.noAp'));
            this.context.reopenActionMenu(actor);
            return;
        }

        const slots = this.buildSlots(actor);
        if (slots.length === 0) {
            this.sink.log(t('field.magic.noSkills'));
            this.context.reopenActionMenu(actor);
            return;
        }

        this.state = { mode: 'menu' };
        this.menu.show(slots);
        this.sink.log(t('field.magic.selectSpell'));
    }

    /** Build radial slots from the character's equipped loadout (+ disable reasons). */
    private buildSlots(actor: FieldActor): FieldMagicSlot[] {
        const character = actor.character;
        const loadout = normalizeLoadout(character.magicLoadout, character);
        const silenced = hasStatus(character.statuses, 'silence');
        const hasAp = this.context.getRemainingActionPoints() >= MAGIC_ACTION_GAUGE_COST;
        const slots: FieldMagicSlot[] = [];
        for (const id of loadout) {
            const skill = getSkill(id);
            if (!skill) continue;
            let enabled = true;
            let disabledReason: string | undefined;
            if (silenced) { enabled = false; disabledReason = t('magic.menu.silenced'); }
            else if (!hasAp) { enabled = false; disabledReason = t('magic.menu.noAp'); }
            else if (character.stats.mp < skill.mpCost) { enabled = false; disabledReason = t('magic.menu.noMp'); }
            slots.push({ skill, level: getUpgradeLevel(character.skillUpgradeLevels, id), enabled, disabledReason });
        }
        return slots;
    }

    private selectSlot(index: number): void {
        const slot = this.menu.getSlot(index);
        if (!slot) return;
        if (!slot.enabled) {
            if (slot.disabledReason) this.sink.log(`${slot.skill.icon} ${slot.skill.nameKr}: ${slot.disabledReason}`);
            return;
        }
        this.handleSkillSelect(slot.skill);
    }

    public handleTargetClick(tile: TilePoint): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor || this.state.mode !== 'targeting') return;

        const targetTileKey = tileKey(tile.x, tile.y);
        if (!this.state.validTiles.has(targetTileKey)) {
            this.sink.log(t('field.magic.outOfRange'));
            return;
        }

        const enemy = this.context.getFieldEnemies()
            .map((entry) => entry.enemy)
            .find((candidate) => candidate.stats.hp > 0 && candidate.gridX === tile.x && candidate.gridY === tile.y);
        if (!enemy) {
            this.sink.log(t('field.magic.selectTarget'));
            return;
        }

        this.cast(actor, this.state.skill, enemy);
    }

    public updateHoverPreview(hoverTile: TilePoint): void {
        if (this.state.mode !== 'targeting') return;
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        const hoverAoeTiles = new Set<string>();
        if (this.state.validTiles.has(tileKey(hoverTile.x, hoverTile.y))) {
            const profile = getSkillAttackProfile(this.state.skill);
            for (const tile of getEffectTiles(profile, this.getPatternContext(actor, hoverTile))) {
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
        this.menu.hide();
    }

    public hasCastableFieldSkill(character: Character): boolean {
        if (hasStatus(character.statuses, 'silence')) return false;
        return this.getLearnedFieldSkills(character).some((skill) => character.stats.mp >= skill.mpCost);
    }

    private handleSkillSelect(skill: Skill): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (this.context.getRemainingActionPoints() < MAGIC_ACTION_GAUGE_COST) {
            this.sink.log(t('field.magic.noAp'));
            this.reset();
            this.context.reopenActionMenu(actor);
            return;
        }

        if (actor.character.stats.mp < skill.mpCost) {
            this.sink.log(formatT('field.magic.noMp', { cost: skill.mpCost }));
            this.reset();
            this.context.reopenActionMenu(actor);
            return;
        }

        if (skill.type === 'heal' || skill.type === 'buff') {
            this.cast(actor, skill);
            return;
        }

        const validTiles = this.computeTargetTiles(actor, skill);
        this.menu.hide();
        this.state = { mode: 'targeting', skill, validTiles, hoverAoeTiles: new Set() };
        this.sink.log(formatT('field.magic.selectSkillTarget', { icon: skill.icon, skill: skill.nameKr }));
    }

    private cast(actor: FieldActor, skill: Skill, targetEnemy?: Enemy): void {
        if (this.context.getRemainingActionPoints() < MAGIC_ACTION_GAUGE_COST) {
            this.sink.log(t('field.magic.noAp'));
            this.context.reopenActionMenu(actor);
            return;
        }
        if (actor.character.stats.mp < skill.mpCost) {
            this.sink.log(formatT('field.magic.noMp', { cost: skill.mpCost }));
            this.context.reopenActionMenu(actor);
            return;
        }
        if ((skill.type === 'damage' || skill.type === 'debuff' || skill.type === 'aoe') && !targetEnemy) {
            this.sink.log(t('field.magic.noTarget'));
            return;
        }

        if (targetEnemy) actor.entity.faceToward(targetEnemy.gridX, targetEnemy.gridY);

        if (this.context.submitNetworkSkillIntent?.(actor, skill, targetEnemy)) {
            actor.entity.playActionMotion('magic');
            AudioManager.playSfx(getSkillCastSfx(skill), { volume: 0.72, rate: 0.03 });
            this.reset();
            this.context.onActionCompleted?.('magic');
            return;
        }

        // Offline / tutorial path: apply enhancement scaling locally so it matches
        // the server's authoritative result (which scales by the same helper).
        const effectiveSkill = getEffectiveSkill(skill, getUpgradeLevel(actor.character.skillUpgradeLevels, skill.id));
        const targetEnemies = this.getCandidateEnemies(effectiveSkill, targetEnemy);
        const effect = resolveSkillEffect({
            casterStats: actor.character.stats,
            casterCharacter: actor.character,
            skill: effectiveSkill,
            targetEnemy: targetEnemy ? this.toSkillEnemyInput(targetEnemy) : undefined,
            allEnemies: targetEnemies.map((enemy) => this.toSkillEnemyInput(enemy)),
            targetsResolvedByPattern: Boolean(targetEnemy),
            terrainContext: this.getSkillTerrainContext(actor, targetEnemies, targetEnemy),
        });

        if (!this.context.spendAp(MAGIC_ACTION_GAUGE_COST)) {
            this.sink.log(t('field.magic.noAp'));
            this.context.reopenActionMenu(actor);
            return;
        }

        actor.entity.playActionMotion('magic');
        AudioManager.playSfx(getSkillCastSfx(effectiveSkill), { volume: 0.72, rate: 0.03 });
        this.applySkillEffect(actor, effectiveSkill, effect);
        this.reset();
        this.context.onActionCompleted?.('magic');
        this.context.resumeOrEndActiveTurn(actor);
    }

    private applySkillEffect(actor: FieldActor, skill: Skill, effect: SkillEffectResult): void {
        this.sink.spawnSkillEffect(
            skill,
            actor.entity.gridX,
            actor.entity.gridY,
            skill.type === 'heal' || skill.type === 'buff' ? 'impact' : 'cast'
        );

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
            if (skill.targetScope === 'selfAndNearbyAllies') {
                this.applyAllyAreaBuff(actor, skill, effect.casterStatusEffects);
            } else {
                applyStatusesToCarrier(actor.character, effect.casterStatusEffects);
                this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
                this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
            }
        } else if (effect.appliesBuff) {
            actor.character.applyBuff(effect.appliesBuff);
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'BUFF');
            this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }

        const feedbackGroupId = effect.enemyResults.length > 0 ? this.sink.beginFeedbackGroup?.() : undefined;
        for (const enemyResult of effect.enemyResults) {
            const enemy = this.context.getEnemyById(enemyResult.enemyId);
            if (!enemy) continue;

            if (enemyResult.isMiss) {
                this.sink.spawnDamage(enemy.gridX, enemy.gridY, 0, false, true);
                AudioManager.playSfx('sfx.miss', { volume: 0.58, rate: 0.03 });
                this.sink.log(formatT('field.magic.missChance', {
                    skill: skill.nameKr,
                    target: enemy.name,
                    chance: Math.floor(enemyResult.hitChance ?? 0),
                }));
                continue;
            }

            if (enemyResult.statusEffects) {
                enemy.statuses = applyStatuses(enemy.statuses, enemyResult.statusEffects);
                this.sink.spawnStatus(enemy.gridX, enemy.gridY, 'WEAK');
                this.sink.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            }

            if (enemyResult.mpDamage !== undefined && enemyResult.mpDamage > 0) {
                const drainedMp = Math.min(enemy.stats.mp, enemyResult.mpDamage);
                enemy.stats.mp = Math.max(0, enemy.stats.mp - drainedMp);
                this.restoreCasterResources(actor, 0, drainedMp);
                if (drainedMp > 0) this.sink.spawnStatus(enemy.gridX, enemy.gridY, `MP-${drainedMp}`);
            }

            const guarded = applyGuardToDamage(enemy.statuses, enemyResult.damage);
            enemy.statuses = guarded.statuses;
            const dead = enemy.takeDamage(guarded.damage);
            this.sink.spawnSkillEffect(skill, enemy.gridX, enemy.gridY, 'impact', guarded.damage > 0 ? feedbackGroupId : undefined);
            this.sink.spawnDamage(enemy.gridX, enemy.gridY, guarded.damage, false, false);
            if (guarded.guarded) this.sink.log(formatT('field.combat.guardReduced', { target: enemy.name }));
            if (enemyResult.casterHpRestore !== undefined && enemyResult.casterHpRestore > 0) {
                this.restoreCasterResources(actor, enemyResult.casterHpRestore, 0);
            }
            if (dead) this.context.handleEnemyDefeated(actor, enemy, feedbackGroupId);
        }
        if (feedbackGroupId) this.sink.flushFeedbackGroup?.(feedbackGroupId);

        for (const log of effect.logs) this.sink.log(log);
    }

    private restoreCasterResources(actor: FieldActor, hpAmount: number, mpAmount: number): void {
        const effective = getEffectiveStatsForCharacter(actor.character);
        const hpRestored = Math.max(0, Math.min(hpAmount, effective.maxHp - actor.character.stats.hp));
        const mpRestored = Math.max(0, Math.min(mpAmount, effective.maxMp - actor.character.stats.mp));

        if (hpRestored > 0) {
            actor.character.stats.hp += hpRestored;
            this.sink.spawnHeal(actor.entity.gridX, actor.entity.gridY, hpRestored);
            this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        }
        if (mpRestored > 0) {
            actor.character.stats.mp += mpRestored;
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, `MP+${mpRestored}`);
            this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        }
    }

    private applyAllyAreaBuff(actor: FieldActor, skill: Skill, statuses: SkillEffectResult['casterStatusEffects']): void {
        if (!statuses || statuses.length === 0) return;

        const targets = this.getAlliedActors(actor, skill);
        for (const target of targets) {
            applyStatusesToCarrier(target.character, statuses);
            this.sink.spawnStatus(target.entity.gridX, target.entity.gridY, 'BUFF');
            this.sink.spawnBuffEffect(target.entity.gridX, target.entity.gridY);
            if (target !== actor) {
                this.sink.spawnSkillEffect(skill, target.entity.gridX, target.entity.gridY, 'impact');
            }
        }
        this.sink.log(formatT('field.magic.allyBuff', { icon: skill.icon, skill: skill.nameKr, count: targets.length }));
    }

    private getAlliedActors(actor: FieldActor, skill: Skill): FieldActor[] {
        return getAlliedActorsInManhattanRange(actor, this.context.getPartyActors(), skill.allyRadius ?? 0);
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

    /** Equipped skills only — the in-combat menu can cast nothing else. */
    private getLearnedFieldSkills(character: Character): Skill[] {
        return normalizeLoadout(character.magicLoadout, character)
            .map((id) => getSkill(id))
            .filter((skill): skill is Skill => Boolean(skill));
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

function getSkillCastSfx(skill: Skill): string {
    if (skill.type === 'heal') return 'sfx.magic.heal';

    if (skill.type === 'buff') {
        if (skill.buffStat === 'def' || skill.id.includes('protection')) return 'sfx.magic.protection';
        if (skill.buffStat === 'mdef') return 'sfx.magic.resist';
        return 'sfx.magic.buff';
    }

    if (skill.type === 'debuff') {
        if (skill.id.includes('mute') || skill.id.includes('silence')) return 'sfx.magic.mute';
        if (skill.id.includes('resist')) return 'sfx.magic.resist';
        return 'sfx.magic.status';
    }

    switch (skill.element) {
        case 'fire':
            return 'sfx.magic.fire';
        case 'ice':
            return 'sfx.magic.ice';
        case 'lightning':
            return 'sfx.magic.thunder';
        case 'earth':
            return 'sfx.magic.quake';
        case 'wind':
            return skill.type === 'aoe' ? 'sfx.magic.tornado' : 'sfx.magic.wind_cutter';
        case 'holy':
            return 'sfx.magic.heal';
        case 'dark':
            return 'sfx.magic.drain';
        case 'physical':
            return 'sfx.magic.slash';
        case 'none':
            return 'sfx.magic.buff';
    }
}

function getActorTile(actor: FieldActor): TilePoint {
    return { x: actor.entity.gridX, y: actor.entity.gridY };
}

export function getAlliedActorsInManhattanRange(caster: FieldActor, actors: FieldActor[], radius: number): FieldActor[] {
    const casterTile = getActorTile(caster);
    return actors.filter((actor) =>
        !actor.character.isDead &&
        actor.character.stats.hp > 0 &&
        manhattan(casterTile, getActorTile(actor)) <= radius
    );
}
