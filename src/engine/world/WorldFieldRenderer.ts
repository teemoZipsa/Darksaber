import { TILE_SIZE } from '../../map/Chunk';
import { getEffectiveStatsForCharacter } from '../../combat/StatusEffects';
import { UI, Parchment, drawParchmentPanel, renderGameTitle } from '../../ui/UITheme';
import { CombatLogUI } from '../../ui/CombatLogUI';
import { ENEMY_ROLE_GLYPHS } from '../../field/FieldConfig';
import { formatRaidTime, getTacticalMarkerColor } from '../../field/FieldDisplay';
import type { Entity } from '../../entity/Entity';
import type { TacticalMarker } from '../../field/TacticalMarkers';
import type { WorldRenderModel } from './WorldRenderModel';

export class WorldFieldRenderer {
    public static renderPathPreview(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        const actor = model.controlledActor;
        if (!actor || actor.path.length === 0) return;

        ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        actor.path.forEach((tile, index) => {
            ctx.fillRect(tile.x * TILE_SIZE - camX + 8, tile.y * TILE_SIZE - camY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
            const pulse = 0.55 + 0.45 * Math.sin(model.worldTime * 8 - index * 0.8);
            ctx.fillStyle = `rgba(180, 245, 255, ${0.35 + pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(tile.x * TILE_SIZE - camX + TILE_SIZE / 2, tile.y * TILE_SIZE - camY + TILE_SIZE / 2, 3 + pulse * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
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
            if (actor.character.isDead) continue;
            const entity = actor.entity;
            const px = entity.pixelX * TILE_SIZE - camX;
            const py = entity.pixelY * TILE_SIZE - camY;

            const walkSpriteRendered = renderWalkSprite(ctx, entity, model.worldTime, px, py);
            if (!walkSpriteRendered && entity.image && entity.imageLoaded) {
                ctx.drawImage(entity.image, px, py, TILE_SIZE, TILE_SIZE);
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

            renderGauge(ctx, px + 4, py - 7, TILE_SIZE - 8, actor.entity.actionGauge / 100, '#39ff88');
            const effective = getEffectiveStatsForCharacter(actor.character);
            renderHpBar(ctx, px + 4, py + TILE_SIZE + 3, TILE_SIZE - 8, actor.character.stats.hp, effective.maxHp);
            if (actor.entity.actionGauge >= 100 || actor.id === model.activeTurnActorId) {
                renderReadyRing(ctx, model.worldTime, px, py, '#5fffd0');
            }
        }
    }

    public static renderEnemies(ctx: CanvasRenderingContext2D, model: WorldRenderModel, camX: number, camY: number): void {
        for (const entry of model.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            const px = enemy.pixelX * TILE_SIZE - camX;
            const py = enemy.pixelY * TILE_SIZE - camY;

            if (enemy.image && enemy.imageLoaded) {
                ctx.drawImage(enemy.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = enemy.isAggro ? '#ff4d5e' : enemy.color;
                ctx.fillRect(px + 7, py + 7, TILE_SIZE - 14, TILE_SIZE - 14);
            }

            if (model.selectedEnemyId === enemy.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            renderEnemyRoleBadge(ctx, enemy.role, enemy.isBoss, px, py);
            renderGauge(ctx, px + 5, py - 7, TILE_SIZE - 10, enemy.actionGauge / 100, '#ffb84d');
            renderHpBar(ctx, px + 5, py + TILE_SIZE + 3, TILE_SIZE - 10, enemy.stats.hp, enemy.stats.maxHp);
            if (enemy.actionGauge >= 100 || enemy.id === model.activeTurnActorId) {
                renderReadyRing(ctx, model.worldTime, px, py, enemy.isBoss ? '#ff4ea3' : '#ffb84d');
            }
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
        ctx.strokeStyle = model.hoverTileWalkable ? 'rgba(255,255,255,0.32)' : 'rgba(255,70,70,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(model.hoverTile.x * TILE_SIZE - camX + 1, model.hoverTile.y * TILE_SIZE - camY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    public static renderHudPanels(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number, vh: number): number {
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

        renderGameTitle(ctx, HUD_X, 12, { scale: 0.7, subtitle: '' });

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // ── Character status (left column, single panel) ──────────
        const charY = 56;
        const charH = 100;
        if (model.activeCharacter) {
            const active = model.activeCharacter;
            const effective = getEffectiveStatsForCharacter(active);
            drawParchmentPanel(ctx, HUD_X, charY, HUD_W, charH, { headerH: 28 });

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
            ctx.fillText(`ATB ${Math.floor(model.player.actionGauge)}%`, TEXT_X, charY + 76);
            const apText = model.controlledActor?.id === model.activeTurnActorId
                ? `${model.remainingActionPoints}/${active.stats.actionLimit}`
                : `-/${active.stats.actionLimit}`;
            ctx.fillStyle = '#5c3a08';
            ctx.fillText(`AP ${apText}`, RIGHT_X, charY + 76);
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

function renderWalkSprite(ctx: CanvasRenderingContext2D, entity: Entity, worldTime: number, px: number, py: number): boolean {
    const sprite = entity.walkSprite;
    if (!sprite || !entity.walkSpriteLoaded || !isEntityMoving(entity)) return false;

    const frame = Math.floor(worldTime * sprite.framesPerSecond) % sprite.frameCount;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        sprite.image,
        frame * sprite.frameWidth,
        sprite.rowByFacing[entity.facing] * sprite.frameHeight,
        sprite.frameWidth,
        sprite.frameHeight,
        px,
        py,
        TILE_SIZE,
        TILE_SIZE
    );
    ctx.restore();
    return true;
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

function renderEnemyRoleBadge(ctx: CanvasRenderingContext2D, role: keyof typeof ENEMY_ROLE_GLYPHS, isBoss: boolean, px: number, py: number): void {
    const glyph = ENEMY_ROLE_GLYPHS[role] ?? 'M';
    ctx.fillStyle = isBoss ? 'rgba(80, 0, 45, 0.88)' : 'rgba(10, 14, 24, 0.78)';
    ctx.strokeStyle = isBoss ? '#ff4ea3' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE - 8, py + 8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 9px ${UI.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, px + TILE_SIZE - 8, py + 8);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
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
function renderRaidBanner(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number): void {
    if (!model.raid.active) return;

    const bannerW = 340;
    const bannerH = 58;
    const x = Math.floor((vw - bannerW) / 2);
    const y = 16;
    const urgent = model.raid.timerAdvancing;

    ctx.save();
    drawParchmentPanel(ctx, x, y, bannerW, bannerH, { radius: 8, headerH: 0 });

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
    ctx.fillText(`${model.raid.departureTownId}  →  다른 마을 생환`, x + bannerW / 2, y + bannerH - 14);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

/**
 * Compact bottom-right key-hint strip. Single thin line of inline `Key 설명`
 * pairs — no parchment chrome, just text with a subtle shadow for readability.
 */
function renderKeyHintStrip(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
    const segments: { key: string; label: string }[] = [
        { key: 'Tab', label: '교체' },
        { key: 'M',   label: '미니맵' },
        { key: 'I',   label: '인벤' },
        { key: 'ESC', label: '메뉴' },
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
        renderCenterHint(ctx, vw, vh, '마법 대상을 클릭 (ESC 취소)', 'rgba(116, 52, 160, 0.88)', '#f2d6ff');
        return;
    }

    if (!model.actionMode) return;

    const text = model.actionMode === 'move'
        ? '이동할 타일을 클릭 (ESC 취소)'
        : model.actionMode === 'attack'
            ? '공격할 적을 클릭 (ESC 취소)'
            : '조사할 대상을 클릭 (ESC 취소)';
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
