import { TILE_SIZE } from '../../map/Chunk';
import { getEffectiveStatsForCharacter } from '../../combat/StatusEffects';
import { UI, Parchment, drawGlassPanel, drawParchmentPanel, renderGameTitle } from '../../ui/UITheme';
import { ENEMY_ROLE_GLYPHS } from '../../field/FieldConfig';
import { formatRaidTime, getCombatLogColor, getTacticalMarkerColor } from '../../field/FieldDisplay';
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

            if (entity.image && entity.imageLoaded) {
                ctx.drawImage(entity.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
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
        renderGameTitle(ctx, 16, 12, { scale: 0.7, subtitle: '' });

        if (model.activeCharacter) {
            const active = model.activeCharacter;
            const effective = getEffectiveStatsForCharacter(active);
            drawParchmentPanel(ctx, 16, 56, 210, 80);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${active.name} T${active.currentTier} Lv.${active.level}`, 28, 68);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `10px ${UI.fontMono}`;
            ctx.fillText(active.getTierName(), 28, 84);
            ctx.fillText(`HP ${active.stats.hp}/${effective.maxHp}  MP ${active.stats.mp}/${effective.maxMp}`, 28, 100);
            ctx.fillText(`ATB ${Math.floor(model.player.actionGauge)}%`, 28, 116);
            const apText = model.controlledActor?.id === model.activeTurnActorId
                ? `${model.remainingActionPoints}/${active.stats.actionLimit}`
                : `-/${active.stats.actionLimit}`;
            ctx.fillText(`AP ${apText}`, 128, 116);
        }

        drawParchmentPanel(ctx, 16, 146, 150, 42);
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold 11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${model.gold} G`, 28, 154);
        ctx.fillStyle = Parchment.textMid;
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillText(model.worldName, 28, 170);

        let infoY = 198;
        if (model.raid.active) {
            drawParchmentPanel(ctx, 16, 194, 210, 48);
            const remaining = Math.max(0, model.raid.limitSeconds - model.raid.elapsedSeconds);
            ctx.fillStyle = model.raid.timerAdvancing ? '#8a2d2d' : Parchment.textMid;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.fillText(`남은 시간 ${formatRaidTime(remaining)}`, 28, 204);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `9px ${UI.fontMono}`;
            ctx.fillText(`출발 ${model.raid.departureTownId}`, 28, 220);
            ctx.fillText('목표: 다른 마을 생환', 28, 232);
            infoY = 252;
        }

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillText(`(${model.player.gridX}, ${model.player.gridY})`, 16, infoY);

        renderTerrainHoverInfo(ctx, model, vw);
        renderActionModeHint(ctx, model, vw, vh);
        renderCombatLog(ctx, model, vw, vh);

        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText('캐릭터 클릭 행동 메뉴 | Tab 교체 | ESC 취소 | I 인벤토리', vw - 16, vh - 16);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        return infoY;
    }
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

function renderTerrainHoverInfo(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number): void {
    if (model.hoverTile.x < 0 || model.hoverTile.y < 0 || model.terrainHoverLines.length === 0) return;
    const w = 214;
    const h = 18 + model.terrainHoverLines.length * 14;
    const x = Math.max(16, vw - w - 16);
    const y = 56;
    drawGlassPanel(ctx, x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `9px ${UI.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    model.terrainHoverLines.forEach((line, index) => {
        ctx.fillText(line, x + 10, y + 9 + index * 14);
    });
}

function renderActionModeHint(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number, vh: number): void {
    if (model.fieldMagicState.mode === 'targeting') {
        ctx.fillStyle = 'rgba(200, 90, 255, 0.9)';
        ctx.font = `bold 12px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText('마법 대상을 클릭 (ESC 취소)', vw / 2, vh - 50);
        ctx.textAlign = 'start';
        return;
    }

    if (!model.actionMode) return;

    const text = model.actionMode === 'move'
        ? '이동할 타일을 클릭 (ESC 취소)'
        : model.actionMode === 'attack'
            ? '공격할 적을 클릭 (ESC 취소)'
            : '조사할 대상을 클릭 (ESC 취소)';
    ctx.fillStyle = model.actionMode === 'attack'
        ? 'rgba(255, 80, 80, 0.88)'
        : model.actionMode === 'interact'
            ? 'rgba(88, 210, 255, 0.88)'
            : 'rgba(255, 204, 66, 0.9)';
    ctx.font = `bold 12px ${UI.fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, vw / 2, vh - 50);
    ctx.textAlign = 'start';
}

function renderCombatLog(ctx: CanvasRenderingContext2D, model: WorldRenderModel, vw: number, vh: number): void {
    const x = model.hasSelection ? 240 : 16;
    const y = Math.max(188, vh - 150);
    const w = Math.max(260, Math.min(430, vw - x - 16));
    const h = 112;
    drawGlassPanel(ctx, x, y, w, h);
    ctx.font = `10px ${UI.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const visible = model.combatLog.slice(-5);
    visible.forEach((line, index) => {
        ctx.fillStyle = getCombatLogColor(line);
        ctx.fillText(line, x + 12, y + 12 + index * 18, w - 24);
    });
}
