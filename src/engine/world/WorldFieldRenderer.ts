import { TILE_SIZE } from '../../map/Chunk';
import { getEffectiveStatsForCharacter } from '../../combat/StatusEffects';
import { UI, Parchment, drawParchmentPanel, renderGameTitle } from '../../ui/UITheme';
import { CombatLogUI } from '../../ui/CombatLogUI';
import { formatRaidTime, getTacticalMarkerColor } from '../../field/FieldDisplay';
import type { Entity } from '../../entity/Entity';
import type { Skill } from '../../data/SkillDB';
import type { TacticalMarker } from '../../field/TacticalMarkers';
import type { EnemyAIDecision } from '../../field/EnemyAI';
import type { FieldIntent } from '../../field/FieldTypes';
import type { WorldRenderModel } from './WorldRenderModel';
import { formatRaidBannerSubtitle } from '../../raid/RaidModifierMessages';
import { tileKey } from '../../field/FieldPathing';
import { getSkillIconCell } from '../../ui/DarksaberIconRegistry';
import { DarksaberSpriteAtlas } from '../../ui/DarksaberSpriteAtlas';
import { formatT, t } from '../../i18n/LanguageManager';
import { SettingsManager } from '../SettingsManager';

const PARTY_ACTOR_IMAGE_RENDER_SCALE = 1.12;
const ZERO_MOTION_OFFSET = { x: 0, y: 0 };

export class WorldFieldRenderer {
    public static renderPathPreview(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        const targetPreview = model.moveTargetPreview;
        if (targetPreview && targetPreview.tiles.length > 0 && model.controlledActor) {
            const route = [
                { x: model.controlledActor.entity.gridX, y: model.controlledActor.entity.gridY },
                ...targetPreview.tiles,
            ];

            ctx.save();
            ctx.strokeStyle = 'rgba(240, 192, 80, 0.92)';
            ctx.fillStyle = 'rgba(240, 192, 80, 0.34)';
            ctx.lineWidth = 3;
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            route.forEach((tile, index) => {
                const x = tile.x * TILE_SIZE - camX + TILE_SIZE / 2;
                const y = tile.y * TILE_SIZE - camY + TILE_SIZE / 2;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.setLineDash([]);

            targetPreview.tiles.forEach((tile, index) => {
                const inset = index === targetPreview.tiles.length - 1 ? 6 : 11;
                ctx.fillRect(
                    tile.x * TILE_SIZE - camX + inset,
                    tile.y * TILE_SIZE - camY + inset,
                    TILE_SIZE - inset * 2,
                    TILE_SIZE - inset * 2
                );
            });

            const destination = targetPreview.tiles[targetPreview.tiles.length - 1];
            ctx.strokeStyle = '#f0c050';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                destination.x * TILE_SIZE - camX + 4,
                destination.y * TILE_SIZE - camY + 4,
                TILE_SIZE - 8,
                TILE_SIZE - 8
            );
            ctx.restore();
        }

        const path = model.pathPreviewTiles;
        if (path.length === 0) return;

        ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        path.forEach((tile) => {
            ctx.fillRect(tile.x * TILE_SIZE - camX + 8, tile.y * TILE_SIZE - camY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        });
    }

    public static renderTacticalMarkers(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        if (model.tacticalMarkers.length === 0) return;

        ctx.save();
        for (const marker of model.tacticalMarkers) {
            renderTacticalMarker(ctx, marker, model.worldTime, camX, camY);
        }
        ctx.restore();
    }

    public static renderActionTiles(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        if (!model.actionMode || model.actionTiles.size === 0) return;

        const colors = {
            move: ['rgba(255, 204, 66, 0.18)', 'rgba(255, 204, 66, 0.68)'],
            attack: ['rgba(255, 70, 70, 0.24)', 'rgba(255, 70, 70, 0.78)'],
            interact: ['rgba(88, 210, 255, 0.20)', 'rgba(88, 210, 255, 0.72)'],
        } as const;
        const [fill, stroke] = colors[model.actionMode];

        for (const key of model.actionTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = fill;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

            const edge = [[0, -1], [0, 1], [-1, 0], [1, 0]]
                .some(([dx, dy]) => !model.actionTiles.has(`${x + dx},${y + dy}`));
            if (edge) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }
        }
    }

    public static renderMagicTargetTiles(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        if (model.fieldMagicState.mode !== 'targeting') return;

        for (const key of model.fieldMagicState.validTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = 'rgba(170, 80, 255, 0.20)';
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(190, 110, 255, 0.65)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        for (const key of model.fieldMagicState.hoverAoeTiles) {
            const [x, y] = key.split(',').map(Number);
            const sx = x * TILE_SIZE - camX;
            const sy = y * TILE_SIZE - camY;
            ctx.fillStyle = 'rgba(255, 80, 220, 0.24)';
            ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = 'rgba(255, 150, 240, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        }
    }

    public static renderSelectedLoot(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        if (!model.selectedLootTile) return;
        ctx.strokeStyle = '#f3d66b';
        ctx.lineWidth = 3;
        ctx.strokeRect(model.selectedLootTile.x * TILE_SIZE - camX + 5, model.selectedLootTile.y * TILE_SIZE - camY + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }

    public static renderPartyActors(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        for (const actor of model.partyActors) {
            const entity = actor.entity;
            if (actor.character.isDead && !entity.isDefeatedPresentationHeld()) continue;
            const motion = SettingsManager.getMotionReduce() ? ZERO_MOTION_OFFSET : entity.getCombatMotionOffset();
            const px = (entity.pixelX + motion.x) * TILE_SIZE - camX;
            const py = (entity.pixelY + motion.y) * TILE_SIZE - camY;

            const walkSpriteRendered = renderWalkSprite(ctx, entity, model.worldTime, px, py, { drawIdle: true });
            if (!walkSpriteRendered && entity.image && entity.imageLoaded) {
                drawScaledTileImage(ctx, entity.image, px, py, PARTY_ACTOR_IMAGE_RENDER_SCALE);
            } else if (!walkSpriteRendered) {
                ctx.fillStyle = entity.color;
                ctx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
            }

            if (actor === model.controlledActor) {
                ctx.strokeStyle = '#52f6ff';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            if (model.selectedActorId === actor.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }

            if (hasIncomingEnemyIntent(model, actor.id)) renderIncomingIntentFrame(ctx, px, py, model.worldTime);
            renderIntentBadge(ctx, px, py, getFieldIntentBadge(actor.queuedIntent));

            renderGauge(ctx, px + 4, py - 7, TILE_SIZE - 8, actor.entity.actionGauge / 100, '#39ff88');
            const effective = getEffectiveStatsForCharacter(actor.character);
            renderHpBar(ctx, px + 4, py + TILE_SIZE + 3, TILE_SIZE - 8, actor.character.stats.hp, effective.maxHp);
            if (actor.entity.actionGauge >= 100 || actor.id === model.activeTurnActorId) {
                renderReadyRing(ctx, model.worldTime, px, py, '#5fffd0');
            }
        }
    }

    public static renderTutorialActors(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        for (const entity of model.tutorialActors) {
            const motion = SettingsManager.getMotionReduce() ? ZERO_MOTION_OFFSET : entity.getCombatMotionOffset();
            const px = (entity.pixelX + motion.x) * TILE_SIZE - camX;
            const py = (entity.pixelY + motion.y) * TILE_SIZE - camY;

            const walkSpriteRendered = renderWalkSprite(ctx, entity, model.worldTime, px, py, { drawIdle: true });
            if (!walkSpriteRendered && entity.image && entity.imageLoaded) {
                drawScaledTileImage(ctx, entity.image, px, py, PARTY_ACTOR_IMAGE_RENDER_SCALE);
            } else if (!walkSpriteRendered) {
                ctx.fillStyle = entity.color;
                ctx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
            ctx.fillRect(px - 12, py - 19, TILE_SIZE + 24, 15);
            ctx.strokeStyle = '#c8a36d';
            ctx.lineWidth = 1;
            ctx.strokeRect(px - 12.5, py - 19.5, TILE_SIZE + 25, 16);
            ctx.fillStyle = '#f0c050';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entity.label, px + TILE_SIZE / 2, py - 8);
            ctx.textAlign = 'start';
        }
    }

    public static renderEnemies(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        const sortedEnemies = [...model.fieldEnemies].sort((a, b) => a.enemy.pixelY - b.enemy.pixelY);
        for (const entry of sortedEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0 && !enemy.isDefeatedPresentationHeld()) continue;
            const motion = SettingsManager.getMotionReduce() ? ZERO_MOTION_OFFSET : enemy.getCombatMotionOffset();
            const px = (enemy.pixelX + motion.x) * TILE_SIZE - camX;
            const py = (enemy.pixelY + motion.y) * TILE_SIZE - camY;

            if (enemy.isElite) renderEliteMarker(ctx, enemy, model.worldTime, px, py);
            const spriteRendered = renderWalkSprite(ctx, enemy, model.worldTime, px, py, { drawIdle: true });
            if (!spriteRendered && enemy.image && enemy.imageLoaded) {
                ctx.drawImage(enemy.image, px, py, TILE_SIZE, TILE_SIZE);
            } else if (!spriteRendered) {
                ctx.fillStyle = enemy.isAggro ? '#ff4d5e' : enemy.color;
                ctx.fillRect(px + 7, py + 7, TILE_SIZE - 14, TILE_SIZE - 14);
            }

            if (model.selectedEnemyId === enemy.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            renderIntentBadge(ctx, px, py, getEnemyIntentBadge(entry.previewIntent));

            renderGauge(ctx, px + 5, py - 7, TILE_SIZE - 10, enemy.actionGauge / 100, '#ffb84d');
            renderHpBar(ctx, px + 5, py + TILE_SIZE + 3, TILE_SIZE - 10, enemy.stats.hp, enemy.stats.maxHp);
            if (enemy.actionGauge >= 100 || enemy.id === model.activeTurnActorId) {
                renderReadyRing(ctx, model.worldTime, px, py, enemy.isBoss ? '#ff4ea3' : '#ffb84d');
            }
        }
    }

    public static renderMagicTargetIcons(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        const magicState = model.fieldMagicState;
        if (magicState.mode !== 'targeting' || magicState.hoverAoeTiles.size === 0) return;

        for (const entry of model.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            if (!magicState.hoverAoeTiles.has(tileKey(enemy.gridX, enemy.gridY))) continue;

            const px = enemy.gridX * TILE_SIZE - camX;
            const py = enemy.gridY * TILE_SIZE - camY;
            renderMagicTargetIcon(ctx, magicState.skill, px, py, model.worldTime);
        }
    }

    public static renderAttackCues(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        for (const cue of model.attackCues) {
            const progress = cue.timer / cue.duration;
            const alpha = Math.max(0, 1 - progress);
            const fromX = cue.from.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const fromY = cue.from.y * TILE_SIZE - camY + TILE_SIZE / 2;
            const toX = cue.to.x * TILE_SIZE - camX + TILE_SIZE / 2;
            const toY = cue.to.y * TILE_SIZE - camY + TILE_SIZE / 2;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / len;
            const uy = dy / len;
            const headX = fromX + dx * Math.min(1, 0.35 + progress * 0.65);
            const headY = fromY + dy * Math.min(1, 0.35 + progress * 0.65);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = cue.color;
            ctx.fillStyle = cue.color;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fromX + ux * 10, fromY + uy * 10);
            ctx.lineTo(headX, headY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(headX, headY);
            ctx.lineTo(headX - ux * 12 - uy * 6, headY - uy * 12 + ux * 6);
            ctx.lineTo(headX - ux * 12 + uy * 6, headY - uy * 12 - ux * 6);
            ctx.closePath();
            ctx.fill();
            if (cue.label) {
                ctx.font = `bold 10px ${UI.fontMono}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cue.label, headX, headY - 16);
            }
            ctx.restore();
        }
    }

    public static renderHoverTile(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        if (model.hoverTile.x < 0 || model.hoverTile.y < 0) return;
        const moveTargetValid = model.actionMode === 'move'
            ? model.moveTargetPreview !== null
            : model.hoverTileWalkable;
        ctx.strokeStyle = moveTargetValid
            ? model.actionMode === 'move'
                ? 'rgba(240, 192, 80, 0.9)'
                : 'rgba(255,255,255,0.32)'
            : 'rgba(255,70,70,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(model.hoverTile.x * TILE_SIZE - camX + 1, model.hoverTile.y * TILE_SIZE - camY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    public static renderHudPanels(
        ctx: CanvasRenderingContext2D,
        model: WorldRenderModel,
        vw: number,
        vh: number,
        options: { combatLogOnly?: boolean } = {}
    ): number {
        // ── HUD layout ─────────────────────────────────────────────
        // LEFT column   : title logo + character status
        // TOP-CENTER    : raid timer banner (only when raid active)
        // TOP-RIGHT     : minimap + integrated info footer (rendered separately
        //                 by MinimapUI; gold/world/coords/terrain live there)
        // BOTTOM-RIGHT  : compact key-hint strip
        const HUD_X       = 16;
        const HUD_W       = 232;
        const TEXT_X      = HUD_X + 14;          // 30 — left text column
        const RIGHT_X     = HUD_X + HUD_W - 92;  // 156 — right text column

        if (options.combatLogOnly) {
            renderCombatLog(ctx, model, vw, vh);
            return 0;
        }

        renderGameTitle(ctx, HUD_X, 12, { scale: 0.7, subtitle: '' });

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // ── Character status (left column, single panel) ──────────
        const charY = 56;
        const charH = 116;
        if (model.activeCharacter) {
            const active = model.activeCharacter;
            const effective = getEffectiveStatsForCharacter(active);
            drawParchmentPanel(ctx, HUD_X, charY, HUD_W, charH, { headerH: 28, darksaberFrame: true });

            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 14px ${UI.fontPrimary}`;
            ctx.fillText(`${active.name}  T${active.currentTier} Lv.${active.level}`, TEXT_X, charY + 8);

            ctx.fillStyle = Parchment.textMid;
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillText(`[ ${active.getTierName()} ]`, TEXT_X, charY + 34);

            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.fillStyle = '#7a2030';
            ctx.fillText(`HP ${active.stats.hp}/${effective.maxHp}`, TEXT_X, charY + 56);
            ctx.fillStyle = '#1f4878';
            ctx.fillText(`MP ${active.stats.mp}/${effective.maxMp}`, RIGHT_X, charY + 56);
            ctx.fillStyle = '#7a4c10';
            ctx.fillText(formatT('ui.actionGaugeValue', { value: Math.floor(model.player.actionGauge) }), TEXT_X, charY + 76);
            const actionText = model.controlledActor?.id === model.activeTurnActorId && model.remainingActionPoints > 0
                ? t('field.action.ready')
                : model.player.actionGauge >= 100
                    ? t('field.action.waiting')
                    : t('field.action.charging');
            ctx.fillStyle = '#5c3a08';
            ctx.fillText(actionText, RIGHT_X, charY + 76);
            if (model.controlledActor?.id === model.activeTurnActorId) {
                ctx.fillStyle = model.remainingActionPoints > 0 ? '#3f6f38' : '#8f2f3d';
                ctx.fillText(
                    model.remainingActionPoints > 0
                        ? formatT('field.action.remaining', { value: Math.floor(model.remainingActionPoints) })
                        : t('field.action.done'),
                    TEXT_X,
                    charY + 94
                );
                ctx.fillStyle = Parchment.textMid;
                ctx.fillText(t('field.action.partial'), RIGHT_X, charY + 94);
            }
        }

        // infoY is where downstream UIs (selected entity info) anchor.
        // No more gold/raid panels below — entity info sits right under the character panel.
        const infoY = charY + charH + 6;

        renderRaidBanner(ctx, model, vw);
        renderActionModeHint(ctx, model, vw, vh);
        renderCombatLog(ctx, model, vw, vh);
        renderKeyHintStrip(ctx, vw, vh);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        return infoY;
    }
}

function renderEliteMarker(
    ctx: CanvasRenderingContext2D,
    enemy: WorldRenderModel['fieldEnemies'][number]['enemy'],
    worldTime: number,
    px: number,
    py: number,
): void {
    const enraged = enemy.eliteAffixes.includes('berserker') && enemy.stats.hp <= enemy.stats.maxHp * 0.5;
    const pulse = enraged ? 0.72 + Math.sin(worldTime * 8) * 0.22 : 0.86;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = enraged ? '#b83232' : '#f0c050';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = enraged ? 12 : 8;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(
        px + TILE_SIZE / 2,
        py + TILE_SIZE * 0.83,
        TILE_SIZE * 0.47,
        TILE_SIZE * 0.22,
        0,
        0,
        Math.PI * 2,
    );
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.font = `bold 9px ${UI.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    enemy.eliteAffixes.forEach((affix, index) => {
        const x = px + TILE_SIZE - 7 - index * 12;
        const y = py + 5;
        ctx.fillStyle = '#17120b';
        ctx.strokeStyle = '#f0c050';
        ctx.lineWidth = 1;
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
        ctx.fillStyle = '#f7d77a';
        ctx.fillText(eliteAffixGlyph(affix), x, y + 0.5);
    });
    ctx.restore();
}

function eliteAffixGlyph(affix: WorldRenderModel['fieldEnemies'][number]['enemy']['eliteAffixes'][number]): string {
    switch (affix) {
        case 'berserker': return '!';
        case 'vampiric': return 'V';
        case 'ironclad': return '◆';
        case 'executioner': return 'X';
        case 'swift': return '»';
    }
}

interface WalkSpriteRenderOptions {
    drawIdle?: boolean;
    idleFrame?: number;
}

function renderWalkSprite(
    ctx: CanvasRenderingContext2D,
    entity: Entity,
    worldTime: number,
    px: number,
    py: number,
    options: WalkSpriteRenderOptions = {}
): boolean {
    const sprite = entity.walkSprite;
    if (!sprite || !entity.walkSpriteLoaded) return false;

    const moving = isEntityMoving(entity);
    if (!moving && !options.drawIdle) return false;

    const frameCount = Math.max(1, sprite.frameCount);
    const actionFrame = moving ? null : entity.getActionSpriteFrame();
    let frame = Math.min(options.idleFrame ?? 1, frameCount - 1);
    let row = sprite.rowByFacing[entity.facing];
    if (moving) {
        frame = Math.floor(worldTime * sprite.framesPerSecond) % frameCount;
    } else if (actionFrame) {
        frame = actionFrame.frame;
        row = actionFrame.row;
    }
    const dw = TILE_SIZE * sprite.renderScale;
    const dh = TILE_SIZE * sprite.renderScale;
    const dx = px + (TILE_SIZE - dw) / 2;
    const dy = py + (TILE_SIZE - dh) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        sprite.image,
        frame * sprite.frameWidth,
        row * sprite.frameHeight,
        sprite.frameWidth,
        sprite.frameHeight,
        dx,
        dy,
        dw,
        dh
    );
    ctx.restore();
    return true;
}

function drawScaledTileImage(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    px: number,
    py: number,
    scale: number
): void {
    const dw = TILE_SIZE * scale;
    const dh = TILE_SIZE * scale;
    ctx.drawImage(image, px + (TILE_SIZE - dw) / 2, py + (TILE_SIZE - dh) / 2, dw, dh);
}

type IntentBadge = {
    label: string;
    fill: string;
    stroke: string;
    text: string;
    pulse?: boolean;
};

function getFieldIntentBadge(intent: FieldIntent | null): IntentBadge | null {
    if (!intent) return null;
    switch (intent.kind) {
        case 'move':
            return makeIntentBadge(t('action.label.move'), 'move');
        case 'attack':
            return makeIntentBadge(t('action.label.attack'), 'attack', true);
        case 'magic':
            return makeIntentBadge(t('action.label.magic'), 'magic', true);
        case 'defend':
            return makeIntentBadge(t('action.label.defend'), 'guard');
        case 'rest':
            return makeIntentBadge(t('action.label.rest'), 'rest');
        case 'interact':
            return makeIntentBadge(t('action.label.open'), 'inspect');
        case 'tool':
            return makeIntentBadge(t('action.label.tool'), 'inspect');
    }
}

function getEnemyIntentBadge(intent: EnemyAIDecision | null | undefined): IntentBadge | null {
    if (!intent) return null;
    switch (intent.kind) {
        case 'attack':
            return makeIntentBadge(t('action.label.attack'), 'attack', true);
        case 'moveToward':
        case 'moveAway':
            return makeIntentBadge(t('action.label.move'), 'move');
        case 'guard':
            return makeIntentBadge(t('action.label.defend'), 'guard');
        case 'healAlly':
            return makeIntentBadge(t('magic.type.heal'), 'rest');
        case 'buffAlly':
            return makeIntentBadge(t('enemy.intent.buff'), 'guard');
        case 'debuffTarget':
            return makeIntentBadge(t('enemy.intent.debuff'), 'magic', true);
        case 'bossPattern':
            return makeIntentBadge(t('enemy.intent.special'), 'attack', true);
        case 'wait':
            return null;
    }
}

function makeIntentBadge(label: string, tone: 'move' | 'attack' | 'magic' | 'guard' | 'rest' | 'inspect', pulse = false): IntentBadge {
    const colors = {
        move: ['rgba(38, 28, 8, 0.86)', '#f3d66b', '#ffe89d'],
        attack: ['rgba(62, 12, 12, 0.88)', '#ff6b6b', '#ffd0d0'],
        magic: ['rgba(38, 12, 58, 0.88)', '#c889ff', '#f0d8ff'],
        guard: ['rgba(16, 30, 50, 0.88)', '#8fc7ff', '#d8ecff'],
        rest: ['rgba(12, 46, 30, 0.88)', '#71e59a', '#d4ffd9'],
        inspect: ['rgba(12, 42, 54, 0.88)', '#72dfff', '#dcf7ff'],
    } as const;
    const [fill, stroke, text] = colors[tone];
    return { label, fill, stroke, text, pulse };
}

function renderIntentBadge(ctx: CanvasRenderingContext2D, px: number, py: number, badge: IntentBadge | null): void {
    if (!badge) return;

    ctx.save();
    ctx.font = `bold 10px ${UI.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.max(25, ctx.measureText(badge.label).width + 10);
    const h = 14;
    const x = Math.round(px + TILE_SIZE - w + 1);
    const y = Math.round(py + TILE_SIZE - h + 1);
    if (badge.pulse) {
        ctx.shadowColor = badge.stroke;
        ctx.shadowBlur = 4;
    }
    ctx.fillStyle = badge.fill;
    ctx.strokeStyle = badge.stroke;
    ctx.lineWidth = 1;
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = badge.text;
    ctx.fillText(badge.label, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
}

function hasIncomingEnemyIntent(model: WorldRenderModel, actorId: string): boolean {
    return model.fieldEnemies.some((entry) =>
        entry.enemy.stats.hp > 0 && isEnemyIntentTargetingActor(entry.previewIntent, actorId)
    );
}

function isEnemyIntentTargetingActor(intent: EnemyAIDecision | null | undefined, actorId: string): boolean {
    if (!intent) return false;
    switch (intent.kind) {
        case 'attack':
        case 'debuffTarget':
        case 'bossPattern':
            return intent.targetId === actorId;
        default:
            return false;
    }
}

function renderIncomingIntentFrame(ctx: CanvasRenderingContext2D, px: number, py: number, worldTime: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(worldTime * 8);
    const x = px + 2;
    const y = py + 2;
    const size = TILE_SIZE - 4;
    const corner = 9;

    ctx.save();
    ctx.globalAlpha = 0.68 + pulse * 0.22;
    ctx.strokeStyle = '#ff4d5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + corner);
    ctx.lineTo(x, y);
    ctx.lineTo(x + corner, y);
    ctx.moveTo(x + size - corner, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size, y + corner);
    ctx.moveTo(x + size, y + size - corner);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x + size - corner, y + size);
    ctx.moveTo(x + corner, y + size);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x, y + size - corner);
    ctx.stroke();
    ctx.restore();
}

function isEntityMoving(entity: Entity): boolean {
    return Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
}

function renderTacticalMarker(ctx: CanvasRenderingContext2D, marker: TacticalMarker, worldTime: number, camX: number, camY: number): void {
    const sx = marker.tile.x * TILE_SIZE - camX;
    const sy = marker.tile.y * TILE_SIZE - camY;
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(worldTime * 7);
    const color = getTacticalMarkerColor(marker);
    const alpha = marker.kind === 'ping'
        ? Math.max(0.2, Math.min(1, marker.ttl / 3))
        : Math.max(0.45, Math.min(1, marker.ttl / 30));

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;

    if (marker.kind === 'rally') {
        ctx.strokeStyle = color;
        ctx.fillStyle = 'rgba(40, 245, 150, 0.18)';
        ctx.beginPath();
        ctx.moveTo(cx, sy + 6);
        ctx.lineTo(sx + TILE_SIZE - 7, cy);
        ctx.lineTo(cx, sy + TILE_SIZE - 6);
        ctx.lineTo(sx + 7, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, sy + 10);
        ctx.lineTo(cx, sy + TILE_SIZE - 8);
        ctx.stroke();
    } else if (marker.kind === 'watch') {
        const r = 12 + pulse * 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy);
        ctx.lineTo(cx + 5, cy);
        ctx.moveTo(cx, cy - 5);
        ctx.lineTo(cx, cy + 5);
        ctx.stroke();
    } else {
        const r = 8 + pulse * 7;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r - 3, cy);
        ctx.lineTo(cx - r + 5, cy);
        ctx.moveTo(cx + r - 5, cy);
        ctx.lineTo(cx + r + 3, cy);
        ctx.moveTo(cx, cy - r - 3);
        ctx.lineTo(cx, cy - r + 5);
        ctx.moveTo(cx, cy + r - 5);
        ctx.lineTo(cx, cy + r + 3);
        ctx.stroke();
    }
}

function renderMagicTargetIcon(ctx: CanvasRenderingContext2D, skill: Skill, px: number, py: number, worldTime: number): void {
    const size = 26;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(worldTime * 8);
    const iconCell = getSkillIconCell(skill);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = '#ff8cf2';
    ctx.shadowBlur = 7 + pulse * 4;
    ctx.fillStyle = 'rgba(24, 4, 30, 0.72)';
    ctx.strokeStyle = 'rgba(255, 165, 245, 0.88)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - size / 2 - 3, cy - size / 2 - 3, size + 6, size + 6, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (iconCell && DarksaberSpriteAtlas.drawIconCell(ctx, iconCell.col, iconCell.row, cx - size / 2, cy - size / 2, size)) {
        ctx.restore();
        return;
    }

    ctx.font = `bold ${Math.round(size * 0.72)}px ${UI.fontPrimary}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe6ff';
    ctx.fillText(skill.icon, cx, cy + 1);
    ctx.restore();
}

function renderReadyRing(ctx: CanvasRenderingContext2D, worldTime: number, px: number, py: number, color: string): void {
    const pulse = 0.5 + 0.5 * Math.sin(worldTime * 7);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45 + pulse * 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * (0.48 + pulse * 0.07), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function renderGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, color: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), 4);
}

function renderHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = '#d95454';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hp / Math.max(1, maxHp))), 5);
}

/**
 * Top-center raid timer banner. Only renders when a raid is active.
 * Positioned high so it doesn't fight with the title logo or character panel.
 */
export interface RaidBannerLayout {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RaidBountyBannerLines {
    target: string;
    risk: string | null;
    status: string;
}

export function getRaidBannerLayout(
    viewWidth: number,
    options: { hasBounty: boolean; hasModifier: boolean },
): RaidBannerLayout {
    const safeViewWidth = Math.max(0, viewWidth);
    const preferredWidth = options.hasBounty ? 580 : options.hasModifier ? 430 : 340;
    const availableWidth = Math.max(0, safeViewWidth - 24);
    const width = Math.min(preferredWidth, availableWidth);
    const compactBounty = options.hasBounty && width < 420;
    return {
        x: Math.floor((safeViewWidth - width) / 2),
        y: 16,
        width,
        height: options.hasBounty ? (compactBounty ? 122 : 104) : 58,
    };
}

export function getRaidBountyBannerLines(
    bannerWidth: number,
    copy: {
        targetName: string;
        affixLabels: readonly string[];
        riskLabel: string;
        status: string;
    },
): RaidBountyBannerLines {
    const target = `⚔ ${copy.targetName} [${copy.affixLabels.join(' · ')}]`;
    if (bannerWidth < 420) {
        return {
            target,
            risk: copy.riskLabel,
            status: copy.status,
        };
    }
    return {
        target,
        risk: null,
        status: `${copy.riskLabel} — ${copy.status}`,
    };
}

function renderRaidBanner(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number): void {
    if (!model.raid.active) return;

    const layout = getRaidBannerLayout(vw, {
        hasBounty: Boolean(model.raid.bounty),
        hasModifier: Boolean(model.raid.modifier),
    });
    const bannerW = layout.width;
    const bannerH = layout.height;
    const x = layout.x;
    const y = layout.y;
    const urgent = model.raid.timerAdvancing;

    ctx.save();
    drawParchmentPanel(ctx, x, y, bannerW, bannerH, { radius: 8, headerH: 0, darksaberFrame: true });

    // Urgent state: red accent stripe along the top border.
    if (urgent) {
        ctx.fillStyle = '#a01818';
        ctx.fillRect(x + 6, y + 2, bannerW - 12, 2);
    }

    const remaining = Math.max(0, model.raid.limitSeconds - model.raid.elapsedSeconds);

    // Big timer
    ctx.fillStyle = urgent ? '#a01818' : Parchment.textDark;
    ctx.font = `bold 22px ${UI.fontPrimary}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatRaidTime(remaining), x + bannerW / 2, y + 22);

    // Route subtitle
    ctx.fillStyle = Parchment.textMid;
    ctx.font = `12px ${UI.fontPrimary}`;
    const subtitle = formatRaidBannerSubtitle(model.raid.departureTownId, model.raid.modifier);
    ctx.fillText(subtitle, x + bannerW / 2, y + 44);

    if (model.raid.bounty) {
        const bounty = model.raid.bounty;
        const status = bounty.phase === 'proof'
            ? t('bounty.proofSecured')
            : bounty.phase === 'target'
                ? t('bounty.hunt.lairRevealed')
                : bounty.phase === 'track'
                    ? formatT('bounty.hunt.clues', {
                        found: bounty.cluesFound,
                        total: bounty.cluesRequired,
                    })
                    : t('bounty.hunt.searching');
        const compact = bannerW < 420;
        const lines = getRaidBountyBannerLines(bannerW, {
            targetName: bounty.targetName,
            affixLabels: bounty.affixLabels,
            riskLabel: bounty.riskLabel,
            status,
        });
        const contentWidth = Math.max(1, bannerW - 28);
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 11px ${UI.fontPrimary}`;
        ctx.fillText(
            lines.target,
            x + bannerW / 2,
            y + (compact ? 64 : 66),
            contentWidth,
        );
        if (lines.risk) {
            ctx.fillStyle = '#6d5018';
            ctx.font = `bold 10px ${UI.fontPrimary}`;
            ctx.fillText(
                lines.risk,
                x + bannerW / 2,
                y + 84,
                contentWidth,
            );
        }
        ctx.fillStyle = bounty.phase === 'target' ? '#8c2626' : '#6d5018';
        ctx.font = `bold ${compact ? 10 : 11}px ${UI.fontPrimary}`;
        ctx.fillText(
            lines.status,
            x + bannerW / 2,
            y + (compact ? 104 : 86),
            contentWidth,
        );
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

/**
 * Compact bottom-right key-hint strip. Single thin line of inline `Key 설명`
 * pairs — no parchment chrome, just text with a subtle shadow for readability.
 */
function renderKeyHintStrip(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
    const essentialSegments: { key: string; label: string }[] = [
        { key: 'SPACE', label: t('field.keyHint.wait') },
        { key: 'ESC', label: t('field.keyHint.menu') },
    ];
    const segments: { key: string; label: string }[] = vw < 520 ? essentialSegments : [
        { key: SettingsManager.getKeyLabel(SettingsManager.getKeybinding('world.nextActor')), label: t('field.keyHint.swap') },
        { key: SettingsManager.getKeyLabel(SettingsManager.getKeybinding('world.minimap')), label: t('field.keyHint.map') },
        { key: SettingsManager.getKeyLabel(SettingsManager.getKeybinding('world.inventory')), label: t('field.keyHint.inventory') },
        ...essentialSegments,
    ];

    ctx.save();
    ctx.font = `11px ${UI.fontPrimary}`;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    // Measure total width to right-align cleanly.
    const SEP = '   ';
    let totalW = 0;
    const measured = segments.map((s) => {
        const keyW = ctx.measureText(s.key).width;
        const labelW = ctx.measureText(s.label).width;
        const segW = keyW + 4 + labelW;
        totalW += segW;
        return { ...s, keyW, labelW, segW };
    });
    totalW += (segments.length - 1) * ctx.measureText(SEP).width;

    const sepW = ctx.measureText(SEP).width;
    let cursor = vw - 16 - totalW;
    const baselineY = vh - 12;

    for (let i = 0; i < measured.length; i++) {
        const seg = measured[i];
        // Key (gold/dark)
        ctx.fillStyle = '#d4a050';
        ctx.fillText(seg.key, cursor, baselineY);
        cursor += seg.keyW + 4;
        // Label (mid)
        ctx.fillStyle = '#e8dcc0';
        ctx.fillText(seg.label, cursor, baselineY);
        cursor += seg.labelW;
        if (i < measured.length - 1) cursor += sepW;
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
}

function renderActionModeHint(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number, vh: number): void {
    if (model.fieldMagicState.mode === 'targeting') {
        renderCenterHint(
            ctx,
            vw,
            vh,
            formatT('field.hint.magicTarget', { cost: formatT('ui.actionGaugeCost', { cost: 30 }) }),
            'rgba(116, 52, 160, 0.88)',
            '#f2d6ff'
        );
        return;
    }

    if (!model.actionMode) return;

    const text = model.actionMode === 'move'
        ? model.moveTargetPreview
            ? formatT('field.hint.movePreview', {
                steps: model.moveTargetPreview.tiles.length,
                pathCost: formatMovementLoad(model.moveTargetPreview.pathCost),
                budget: formatMovementLoad(model.moveTargetPreview.movementBudget),
                remaining: Math.floor(model.moveTargetPreview.remainingActionPointsAfterMove),
            })
            : formatT('field.hint.moveTarget', { cost: formatT('ui.actionGaugeCost', { cost: 20 }) })
        : model.actionMode === 'attack'
            ? formatT('field.hint.attackTarget', { cost: formatT('ui.actionGaugeCost', { cost: 25 }) })
            : formatT('field.hint.interactTarget', { cost: formatT('ui.actionGaugeCost', { cost: 15 }) });
    const bg = model.actionMode === 'attack'
        ? 'rgba(116, 28, 28, 0.9)'
        : model.actionMode === 'interact'
            ? 'rgba(24, 88, 116, 0.9)'
            : 'rgba(104, 78, 20, 0.9)';
    const fg = model.actionMode === 'attack'
        ? '#ffd6d6'
        : model.actionMode === 'interact'
            ? '#d8f5ff'
            : '#ffe59a';
    renderCenterHint(ctx, vw, vh, text, bg, fg);
}

function formatMovementLoad(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderCombatLog(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number, vh: number): void {
    CombatLogUI.render(ctx, model.combatLog, vw, vh);
}

function renderCenterHint(
    ctx: CanvasRenderingContext2D,
    vw: number,
    vh: number,
    text: string,
    bg: string,
    fg: string
): void {
    ctx.save();
    ctx.font = `bold 13px ${UI.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 34;
    const x = vw / 2 - w / 2;
    const y = vh - 70;
    // Semantic banner: keep colored bg (red/blue/gold) — UX state cue, not generic panel
    ctx.fillStyle = bg;
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + 34, r);
    ctx.arcTo(x + w, y + 34, x, y + 34, r);
    ctx.arcTo(x, y + 34, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = Parchment.borderLight;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillText(text, vw / 2, y + 17);
    ctx.restore();
}
