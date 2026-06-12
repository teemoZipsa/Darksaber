import type { Character } from '../../character/Character';
import type { PartyManager } from '../../character/PartyManager';
import { Enemy } from '../../entity/Enemy';
import { Player } from '../../entity/Player';
import { FIELD_MAX_ACTION_GAUGE, type FieldApAction } from '../../field/FieldActionEconomy';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { t } from '../../i18n/LanguageManager';
import { MONSTER_ROW_BY_FACING, MONSTER_SPRITE_PATH } from '../../data/MonsterCatalog';
import type { AttackTargetFailure } from '../../field/FieldTargeting';
import { TutorialTrainingMap } from '../../map/TutorialTrainingMap';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import { AudioManager } from '../AudioManager';
import { SettingsManager } from '../SettingsManager';
import type { InputManager } from '../InputManager';
import type { Camera } from '../Camera';
import type { ActionMenuSlotState, ActionType } from '../../ui/ActionMenuUI';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';

export type IntroTutorialStep = 'move' | 'attack' | 'rest' | 'magic' | 'defeat';

const INTRO_TUTORIAL_ACTOR_RENDER_SCALE = 1.16;

const INTRO_TUTORIAL_INSTRUCTOR_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    left: 3,
    right: 2,
};

const INTRO_TUTORIAL_STEP_ACTION: Partial<Record<IntroTutorialStep, FieldApAction>> = {
    move: 'move',
    attack: 'attack',
    rest: 'rest',
    magic: 'magic',
};

const INTRO_TUTORIAL_NEXT_STEP: Record<IntroTutorialStep, IntroTutorialStep | null> = {
    move: 'attack',
    attack: 'rest',
    rest: 'magic',
    magic: 'defeat',
    defeat: null,
};

const INTRO_TUTORIAL_STEP_NUMBER: Record<IntroTutorialStep, number> = {
    move: 1,
    attack: 2,
    rest: 3,
    magic: 4,
    defeat: 5,
};

const INTRO_TUTORIAL_EXPECTED_ACTION: Record<IntroTutorialStep, ActionType> = {
    move: 'move',
    attack: 'attack',
    rest: 'rest',
    magic: 'magic',
    defeat: 'attack',
};

export interface WorldTutorialContext {
    party: PartyManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    getWorldMap(): WorldMap;
    setWorldMap(worldMap: WorldMap): void;
    getCurrentHubTown(): TownInfo;
    openTown(town: TownInfo): void;
    closeFieldOverlays(): void;
    resetStoryVisitState(): void;
    resetPartyForRaid(): void;
    applyPendingRestForRaidStart(): void;
    clearRemotePartyActors(): void;
    setFieldEnemies(enemies: FieldEnemy[]): void;
    placePartyNear(tile: TilePoint, overrideMembers?: Character[]): void;
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    setPlayer(player: Player): void;
    getPlayer(): Player;
    selectActor(actorId: string | null): void;
    clearFieldTurnState(): void;
    setCurrentPhaseToRaid(): void;
    setActiveTurn(actorId: string | null, remainingActionPoints: number, majorActionUsed: boolean): void;
    getTurnActionStates(actor: FieldActor): ActionMenuSlotState[];
    openActionMenu(states: ActionMenuSlotState[]): void;
    getEnemyById(enemyId: string): Enemy | null;
    actorTile(actor: FieldActor): TilePoint;
    getActorAttackTargetFailureFromTile(actor: FieldActor, casterTile: TilePoint, enemy: Enemy): AttackTargetFailure | null;
    updateEffects(dt: number): void;
    updateFloatingText(dt: number): void;
    updateAttackCues(dt: number): void;
    followCameraToPlayer(camera: Camera, dt?: number): void;
    snapCameraToActor(actor: FieldActor): void;
    getLastCombatLog(): string | undefined;
    log(message: string): void;
}

export class WorldTutorialController {
    private readonly context: WorldTutorialContext;
    private active = false;
    private enemyId: string | null = null;
    private step: IntroTutorialStep = 'move';
    private previousWorldMap: WorldMap | null = null;
    private instructor: Player | null = null;
    private completePending = false;

    constructor(context: WorldTutorialContext) {
        this.context = context;
    }

    public isActive(): boolean {
        return this.active;
    }

    public isCompletePending(): boolean {
        return this.completePending;
    }

    public getInstructor(): Player | null {
        return this.instructor;
    }

    public start(): void {
        if (this.active) return;
        const town = this.context.getCurrentHubTown();
        const trainingMap = new TutorialTrainingMap();
        this.previousWorldMap = this.context.getWorldMap();
        this.context.setWorldMap(trainingMap);
        this.context.townSession.hide();
        this.context.closeFieldOverlays();
        this.context.setCurrentPhaseToRaid();
        this.context.raidSession.beginRaidFromTown(town.id);
        this.context.resetStoryVisitState();
        this.context.resetPartyForRaid();
        this.context.applyPendingRestForRaidStart();
        this.context.clearRemotePartyActors();
        this.context.setFieldEnemies([]);
        this.context.getWorldMap().loot = [];
        this.context.placePartyNear(trainingMap.getPlayerStartTile(), this.getIntroTutorialCharacters());
        this.context.setPlayer(this.context.getControlledActor()?.entity ?? this.context.getPlayer());
        this.context.selectActor(this.context.getControlledActor()?.id ?? null);
        this.context.clearFieldTurnState();
        this.instructor = this.createInstructor(trainingMap.getInstructorTile());

        const actor = this.context.getControlledActor();
        if (!actor) {
            this.restoreWorldMap();
            this.context.openTown(town);
            return;
        }

        const enemyTile = trainingMap.getPracticeEnemyTile();
        const enemy = new Enemy('intro_tutorial_enemy', enemyTile.x, enemyTile.y, t('tutorial.world.enemy'), 1, '#b64048', 'bruiser');
        enemy.aggroRange = 0;
        enemy.expReward = 0;
        enemy.stats.maxHp = 42;
        enemy.stats.hp = 42;
        enemy.stats.atk = 1;
        enemy.stats.def = 0;
        enemy.stats.spd = 0;
        enemy.actionGauge = 0;
        enemy.facing = 'left';
        enemy.setWalkSprite(
            `${MONSTER_SPRITE_PATH}/206R.png`,
            32,
            32,
            3,
            8,
            MONSTER_ROW_BY_FACING,
            INTRO_TUTORIAL_ACTOR_RENDER_SCALE
        );
        this.context.setFieldEnemies([{ enemy, home: enemyTile, path: [] }]);
        this.active = true;
        this.enemyId = enemy.id;
        this.step = 'move';
        this.completePending = false;

        this.prepareActorTurn(actor);
        this.context.selectActor(actor.id);
        this.context.openActionMenu(this.getActionMenuStates(actor));
        this.context.snapCameraToActor(actor);
        AudioManager.playBgm('bgm.tutorial.training', { fadeMs: 400 });
        this.context.log(t('tutorial.world.startLog'));
        this.context.log(t('tutorial.world.step.move.log'));
    }

    public finish(skipped: boolean): void {
        this.restoreWorldMap();
        const town = this.context.getCurrentHubTown();
        this.active = false;
        this.enemyId = null;
        this.step = 'move';
        this.instructor = null;
        this.completePending = false;
        this.context.setFieldEnemies([]);
        this.context.getWorldMap().loot = [];
        this.context.clearRemotePartyActors();
        this.context.placePartyNear(this.context.getWorldMap().getTownSpawnTile(town));
        this.context.setPlayer(this.context.getControlledActor()?.entity ?? this.context.getPlayer());
        this.context.selectActor(this.context.getControlledActor()?.id ?? null);
        this.context.clearFieldTurnState();
        this.context.openTown(town);
        this.context.log(t(skipped ? 'tutorial.world.skipLog' : 'tutorial.world.townLog'));
    }

    public complete(): void {
        if (!this.active || this.completePending) return;
        this.context.log(t('tutorial.world.completeLog'));
        this.completePending = true;
        this.context.clearFieldTurnState();
    }

    public updateCompletion(input: InputManager, dt: number, camera: Camera): void {
        this.context.updateEffects(dt);
        this.context.updateFloatingText(dt);
        this.context.updateAttackCues(dt);

        if (input.mouseJustDown || input.justPressed('Enter') || input.justPressed('Space')) {
            this.finish(false);
            this.context.followCameraToPlayer(camera, dt);
            return;
        }

        this.context.followCameraToPlayer(camera, dt);
    }

    public clearForNetworkRaid(): void {
        if (!this.active && !this.previousWorldMap) return;
        this.restoreWorldMap();
        this.active = false;
        this.enemyId = null;
        this.step = 'move';
        this.instructor = null;
        this.completePending = false;
        this.context.setFieldEnemies([]);
        this.context.getWorldMap().loot = [];
        this.context.clearRemotePartyActors();
        this.context.clearFieldTurnState();
    }

    public advanceStep(action: FieldApAction): void {
        if (!this.active) return;
        const expected = INTRO_TUTORIAL_STEP_ACTION[this.step];
        if (action !== expected) return;

        if (action === 'move') {
            const actor = this.context.getActivePartyTurnActor() ?? this.context.getControlledActor();
            if (actor && !this.canActorAttackEnemyFrom(actor, this.context.actorTile(actor))) {
                this.prepareActorTurn(actor);
                this.context.log(t('tutorial.world.step.move.closeLog'));
                return;
            }
        }

        const next = INTRO_TUTORIAL_NEXT_STEP[this.step];
        if (!next) return;
        this.step = next;

        const actor = this.context.getActivePartyTurnActor() ?? this.context.getControlledActor();
        if (actor) this.prepareActorTurn(actor);
        this.context.log(t(`tutorial.world.step.${next}.log`));
    }

    public canActorAttackEnemyFrom(actor: FieldActor, casterTile: TilePoint): boolean {
        const enemy = this.enemyId ? this.context.getEnemyById(this.enemyId) : null;
        if (!enemy || enemy.stats.hp <= 0) return false;
        return this.context.getActorAttackTargetFailureFromTile(actor, casterTile, enemy) === null;
    }

    public isTutorialEnemy(enemy: Enemy): boolean {
        return this.active && enemy.id === this.enemyId;
    }

    public getActionMenuStates(actor: FieldActor): ActionMenuSlotState[] {
        const states = this.context.getTurnActionStates(actor);
        if (!this.active || this.completePending) return states;

        const expected = INTRO_TUTORIAL_EXPECTED_ACTION[this.step];
        return states.map((state) => {
            if (state.type === expected) {
                return {
                    ...state,
                    highlighted: state.enabled,
                    emphasisLabel: t(`tutorial.world.action.${expected}`),
                };
            }

            return {
                ...state,
                enabled: false,
                highlighted: false,
                disabledReason: t('tutorial.world.blockedAction'),
            };
        });
    }

    public filterActionTiles(action: 'move' | 'attack' | 'interact', actor: FieldActor, tiles: Set<string>): Set<string> {
        if (!this.active || this.completePending) return tiles;
        if (this.step !== 'move' || action !== 'move') return tiles;

        const focusedTiles = new Set<string>();
        for (const key of tiles) {
            const [xText, yText] = key.split(',');
            const tile = { x: Number(xText), y: Number(yText) };
            if (Number.isFinite(tile.x) && Number.isFinite(tile.y) && this.canActorAttackEnemyFrom(actor, tile)) {
                focusedTiles.add(key);
            }
        }
        return focusedTiles.size > 0 ? focusedTiles : tiles;
    }

    public addBlockedLog(): void {
        const message = t('tutorial.world.blockedInput');
        if (this.context.getLastCombatLog() === message) return;
        this.context.log(message);
    }

    public prepareActorTurn(actor: FieldActor): void {
        this.context.setActiveTurn(actor.id, FIELD_MAX_ACTION_GAUGE, false);
        actor.entity.actionGauge = FIELD_MAX_ACTION_GAUGE;
    }

    public renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        if (this.completePending) {
            this.renderCompleteModal(ctx, width, height);
            return;
        }

        const scale = SettingsManager.getUIScale();
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const combatLogReserveW = 496;
        const panelGap = 24;
        const canFitBesideCombatLog = uiW >= combatLogReserveW + panelGap + 560 + 16;
        const panelW = canFitBesideCombatLog
            ? Math.min(720, uiW - combatLogReserveW - panelGap - 16)
            : Math.min(720, uiW - 32);
        const panelH = 196;
        const x = canFitBesideCombatLog
            ? combatLogReserveW + panelGap
            : Math.max(16, Math.floor((uiW - panelW) / 2));
        const y = canFitBesideCombatLog
            ? Math.max(16, uiH - panelH - 18)
            : Math.max(92, Math.floor(uiH * 0.16));
        const expected = INTRO_TUTORIAL_EXPECTED_ACTION[this.step];

        ctx.save();
        ctx.scale(scale, scale);
        ctx.fillStyle = 'rgba(12, 9, 8, 0.96)';
        ctx.strokeStyle = '#d6b16d';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.28)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.roundRect(x, y, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
        ctx.fillRect(x + 14, y + 42, panelW - 28, 52);
        ctx.strokeStyle = 'rgba(240, 192, 80, 0.38)';
        ctx.strokeRect(x + 14, y + 42, panelW - 28, 52);

        ctx.fillStyle = '#f0c050';
        ctx.font = '18px "DOSMyungjo", serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${t('tutorial.world.title')} ${INTRO_TUTORIAL_STEP_NUMBER[this.step]}/5`, x + 18, y + 28);

        ctx.fillStyle = '#120d0a';
        ctx.fillRect(x + 18, y + 50, 92, 26);
        ctx.strokeStyle = '#f0c050';
        ctx.strokeRect(x + 18, y + 50, 92, 26);
        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 14px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.instructor'), x + 28, y + 68);

        ctx.fillStyle = '#e8e0d0';
        ctx.font = 'bold 17px sans-serif';
        this.drawWrappedText(ctx, t(`tutorial.world.dialogue.${this.step}`), x + 126, y + 59, panelW - 158, 21, 2);

        ctx.fillStyle = '#ffd86b';
        ctx.font = 'bold 26px "DOSMyungjo", serif';
        this.drawWrappedText(ctx, t(`tutorial.world.press.${this.step}`), x + 18, y + 122, panelW - 36, 30, 2);

        ctx.fillStyle = '#f6e0aa';
        ctx.font = 'bold 14px sans-serif';
        this.drawWrappedText(ctx, t(`tutorial.world.target.${this.step}`), x + 18, y + 156, panelW - 36, 18, 2);

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${t('tutorial.world.onlyAction')}  ${t('tutorial.world.lineEsc')}`, x + 18, y + panelH - 16);

        ctx.fillStyle = 'rgba(240, 192, 80, 0.2)';
        ctx.fillRect(x + panelW - 128, y + 18, 110, 24);
        ctx.strokeStyle = '#f0c050';
        ctx.strokeRect(x + panelW - 128, y + 18, 110, 24);
        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t(`tutorial.world.action.${expected}`), x + panelW - 73, y + 35);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    public getIntroTutorialCharacters(): Character[] {
        const active = this.context.party.getActive() ?? this.context.party.getCharacters()[0];
        return active ? [active] : [];
    }

    private restoreWorldMap(): void {
        if (!this.previousWorldMap) return;
        this.context.setWorldMap(this.previousWorldMap);
        this.previousWorldMap = null;
    }

    private createInstructor(tile: TilePoint): Player {
        const instructor = new Player(tile.x, tile.y);
        instructor.id = 'intro_tutorial_instructor';
        instructor.label = t('tutorial.world.instructor');
        instructor.color = '#f0c050';
        instructor.facing = 'down';
        instructor.setWalkSprite(
            '/assets/images/characters/animations/infantry_t4_walk.png',
            32,
            32,
            3,
            6,
            INTRO_TUTORIAL_INSTRUCTOR_ROW_BY_FACING,
            INTRO_TUTORIAL_ACTOR_RENDER_SCALE
        );
        return instructor;
    }

    private drawWrappedText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
        maxLines: number
    ): void {
        const words = text.split(/\s+/);
        let line = '';
        let lineCount = 0;

        for (const word of words) {
            const nextLine = line ? `${line} ${word}` : word;
            if (ctx.measureText(nextLine).width > maxWidth && line) {
                ctx.fillText(line, x, y + lineCount * lineHeight);
                line = word;
                lineCount++;
                if (lineCount >= maxLines) return;
            } else {
                line = nextLine;
            }
        }

        if (line && lineCount < maxLines) {
            ctx.fillText(line, x, y + lineCount * lineHeight);
        }
    }

    private renderCompleteModal(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const scale = SettingsManager.getUIScale();
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const panelW = Math.min(620, uiW - 40);
        const panelH = Math.min(320, Math.max(286, uiH - 24));
        const x = Math.floor((uiW - panelW) / 2);
        const y = Math.floor((uiH - panelH) / 2);
        const buttonW = Math.min(340, panelW - 72);
        const buttonH = 48;
        const buttonX = x + Math.floor((panelW - buttonW) / 2);
        const buttonY = y + panelH - 88;
        const nextBoxW = panelW - 92;
        const nextBoxH = 44;
        const nextBoxX = x + 46;
        const nextBoxY = buttonY - nextBoxH - 18;
        const crestX = x + panelW / 2;
        const crestY = y + 54;

        ctx.save();
        ctx.scale(scale, scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(0, 0, uiW, uiH);

        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#15100d';
        ctx.strokeStyle = '#d6b16d';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.32)';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.roundRect(x, y, panelW, panelH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.strokeStyle = 'rgba(240, 192, 80, 0.36)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 34, crestY);
        ctx.lineTo(crestX - 44, crestY);
        ctx.moveTo(crestX + 44, crestY);
        ctx.lineTo(x + panelW - 34, crestY);
        ctx.stroke();

        ctx.fillStyle = '#20150f';
        ctx.strokeStyle = '#f0c050';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(crestX, crestY, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f0c050';
        ctx.font = 'bold 26px "DOSMyungjo", serif';
        ctx.fillText('✓', crestX, crestY + 1);

        ctx.fillStyle = '#f0c050';
        ctx.font = '30px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.completeTitle'), x + panelW / 2, y + 114);

        ctx.fillStyle = '#e8e0d0';
        ctx.font = 'bold 16px sans-serif';
        this.drawWrappedText(ctx, t('tutorial.world.completeLine'), x + panelW / 2, y + 150, panelW - 96, 22, 2);

        ctx.fillStyle = 'rgba(240, 192, 80, 0.1)';
        ctx.strokeStyle = 'rgba(240, 192, 80, 0.44)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(nextBoxX, nextBoxY, nextBoxW, nextBoxH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('tutorial.world.completeNextLabel'), nextBoxX + 18, nextBoxY + 15);

        ctx.fillStyle = '#ffe8a8';
        ctx.font = 'bold 16px "DOSMyungjo", serif';
        ctx.fillText(t('tutorial.world.completeReward'), nextBoxX + 18, nextBoxY + 31);

        ctx.fillStyle = '#f0c050';
        ctx.strokeStyle = '#ffe8a8';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(240, 192, 80, 0.45)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(buttonX, buttonY, buttonW, buttonH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#1b1008';
        ctx.font = 'bold 18px "DOSMyungjo", serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('tutorial.world.completeNext'), x + panelW / 2, buttonY + buttonH / 2 + 1);

        ctx.fillStyle = '#a99773';
        ctx.font = '12px sans-serif';
        ctx.fillText(t('tutorial.world.completeInputHint'), x + panelW / 2, buttonY + buttonH + 22);
        ctx.restore();
    }
}
