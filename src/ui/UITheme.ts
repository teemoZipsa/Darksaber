/**
 * UITheme — Centralized design tokens and shared drawing helpers
 * for the Darksaber Modern Vibe UI system.
 *
 * All UI components should import from here instead of hardcoding colors.
 */

// ─── COLOR TOKENS ────────────────────────────────────────────

export const UI = {
    // Glass morphism backgrounds
    bgGlass:        'rgba(12, 14, 24, 0.75)',
    bgGlassLight:   'rgba(255, 255, 255, 0.06)',
    bgGlassMedium:  'rgba(20, 24, 38, 0.85)',
    bgOverlay:      'rgba(0, 0, 0, 0.55)',

    // Borders
    borderSubtle:   'rgba(255, 255, 255, 0.08)',
    borderMedium:   'rgba(255, 255, 255, 0.12)',
    borderAccent:   'rgba(200, 170, 80, 0.4)',
    borderAccentBright: 'rgba(240, 192, 80, 0.7)',

    // Text
    textPrimary:    '#e8e4de',
    textSecondary:  'rgba(255, 255, 255, 0.5)',
    textAccent:     '#f0c050',
    textMuted:      'rgba(255, 255, 255, 0.3)',

    // Semantic
    hp:             '#4ade80',
    hpBg:           'rgba(74, 222, 128, 0.15)',
    mp:             '#60a5fa',
    mpBg:           'rgba(96, 165, 250, 0.15)',
    atb:            '#f97316',
    atbBg:          'rgba(249, 115, 22, 0.15)',
    atbReady:       '#39ff14',
    exp:            '#a78bfa',
    expBg:          'rgba(167, 139, 250, 0.15)',
    danger:         '#ef4444',
    success:        '#22c55e',
    gold:           '#ffd700',

    // Spacing (4-point grid)
    sp1: 4,
    sp2: 8,
    sp3: 12,
    sp4: 16,
    sp5: 20,
    sp6: 24,
    sp8: 32,
    sp10: 40,

    // Radii
    radiusSm: 6,
    radiusMd: 12,
    radiusLg: 20,
    radiusFull: 999,

    // Font
    fontPrimary: '\"DOSMyungjo\", serif',
    fontMono: '\"DOSMyungjo\", serif',

    // Transition (for manual lerp calculations)
    transitionMs: 150,
} as const;

// ─── DRAWING HELPERS ─────────────────────────────────────────

/** Snap a value to the nearest 4px grid point */
export function snap(val: number): number {
    return Math.round(val / 4) * 4;
}

/** Linear interpolation for smooth animations */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Draw a glass-morphism panel with subtle border and rounded corners.
 */
export function drawGlassPanel(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    options?: {
        bg?: string;
        border?: string;
        radius?: number;
        shadow?: boolean;
    }
): void {
    const bg = options?.bg ?? UI.bgGlass;
    const border = options?.border ?? UI.borderSubtle;
    const r = options?.radius ?? UI.radiusMd;

    ctx.save();

    // Shadow (subtle drop shadow for depth)
    if (options?.shadow !== false) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
    }

    // Background
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = bg;
    ctx.fill();

    // Reset shadow before border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner highlight (top edge only for glass effect)
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1);
    ctx.lineTo(x + w - r, y + 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw a modern button with hover/active states.
 */
export function drawButton(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    label: string,
    state: 'default' | 'hover' | 'active' | 'disabled' = 'default'
): void {
    const r = UI.radiusSm;
    ctx.save();

    let bg: string;
    let textColor: string;
    let borderColor: string;

    switch (state) {
        case 'hover':
            bg = 'rgba(255, 255, 255, 0.1)';
            textColor = UI.textPrimary;
            borderColor = UI.borderMedium;
            break;
        case 'active':
            bg = 'rgba(255, 255, 255, 0.15)';
            textColor = UI.textAccent;
            borderColor = UI.borderAccent;
            break;
        case 'disabled':
            bg = 'rgba(255, 255, 255, 0.03)';
            textColor = UI.textMuted;
            borderColor = 'rgba(255, 255, 255, 0.04)';
            break;
        default:
            bg = 'rgba(255, 255, 255, 0.05)';
            textColor = UI.textPrimary;
            borderColor = UI.borderSubtle;
    }

    // Background
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.fillStyle = textColor;
    ctx.font = `14px ${UI.fontPrimary}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    ctx.restore();
}

/**
 * Draw a slim, modern gauge bar.
 */
export function drawBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    pct: number,
    fillColor: string,
    bgColor: string = 'rgba(255, 255, 255, 0.06)',
    options?: {
        radius?: number;
        glow?: boolean;
        label?: string;
        valueText?: string;
    }
): void {
    const r = options?.radius ?? (h / 2);
    const clampedPct = Math.max(0, Math.min(1, pct));

    ctx.save();

    // Background track
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Fill
    if (clampedPct > 0) {
        const fillW = Math.max(r * 2, w * clampedPct); // ensure visible minimum
        if (options?.glow) {
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        roundRect(ctx, x, y, fillW, h, r);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Label (left)
    if (options?.label) {
        ctx.fillStyle = UI.textSecondary;
        ctx.font = `bold 11px ${UI.fontPrimary}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(options.label, x - ctx.measureText(options.label).width - 8, y + h / 2);
    }

    // Value text (right inside bar)
    if (options?.valueText) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `10px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(options.valueText, x + w - 6, y + h / 2);
        ctx.textAlign = 'start';
    }

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

/**
 * Draw a ghost-style close button (X).
 * Returns true if the given mouse coordinates are within the hitbox.
 */
export function drawCloseButton(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    hovered: boolean = false
): void {
    const size = 24;
    const half = size / 2;

    ctx.save();

    // Background only on hover
    if (hovered) {
        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
    }

    // X lines
    ctx.strokeStyle = hovered ? UI.textPrimary : UI.textSecondary;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const d = 6;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();

    ctx.restore();
}

/** Check if a point is within a close button hitbox */
export function isCloseButtonHit(
    mx: number, my: number,
    btnX: number, btnY: number
): boolean {
    return Math.hypot(mx - btnX, my - btnY) <= 14;
}

// ─── INTERNAL UTILITIES ──────────────────────────────────────

/**
 * Draw a rounded rectangle path (compatible with older Canvas APIs).
 */
function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
): void {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ─── DARK PARCHMENT PALETTE ─────────────────────────────────
// Unified dark-RPG / parchment theme for all Darksaber panels.

export const DarkParchment = {
    // Panel backgrounds
    panelBg:           'rgba(30, 22, 14, 0.92)',
    panelBgLight:      'rgba(42, 32, 20, 0.88)',
    panelHeader:       'rgba(200, 163, 109, 0.12)',

    // Borders
    border:            '#5a3e28',
    borderLight:       '#c8a36d',
    borderAccent:      'rgba(228, 63, 90, 0.6)',

    // Text
    textTitle:         '#e43f5a',
    textLabel:         '#c8a84e',
    textBody:          '#d4c8b0',
    textMuted:         '#8a7a66',
    textCyan:          '#00e5ff',

    // Corner radius (unified)
    radius:            8,
} as const;

/**
 * Draw a dark-parchment panel — the unified container style for Darksaber.
 * Double border (dark outer + light inner), rounded corners, subtle shadow.
 */
export function drawDarkPanel(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    options?: {
        bg?: string;
        borderColor?: string;
        radius?: number;
        shadow?: boolean;
        headerH?: number;     // If > 0, draw a highlight header band
    }
): void {
    const bg = options?.bg ?? DarkParchment.panelBg;
    const border = options?.borderColor ?? DarkParchment.border;
    const r = options?.radius ?? DarkParchment.radius;

    ctx.save();

    // Drop shadow
    if (options?.shadow !== false) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
    }

    // Outer fill
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = bg;
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Outer border (dark)
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner border (light, subtle)
    ctx.beginPath();
    roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 2));
    ctx.strokeStyle = DarkParchment.borderLight;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Header highlight band
    if (options?.headerH && options.headerH > 0) {
        ctx.beginPath();
        // clip to panel shape
        roundRect(ctx, x + 1, y + 1, w - 2, options.headerH, r - 1);
        ctx.fillStyle = DarkParchment.panelHeader;
        ctx.fill();
    }

    ctx.restore();
}

// ─── LIGHT PARCHMENT PALETTE ────────────────────────────────
// Original Darksaber warm beige style — classic SRPG feel.

export const Parchment = {
    // Panel backgrounds
    panelBg:           'rgba(190, 160, 100, 0.92)',
    panelBgLight:      'rgba(210, 185, 130, 0.95)',
    panelBgInner:      'rgba(195, 165, 110, 0.90)',

    // Borders
    borderDark:        '#3a2618',
    borderLight:       '#c8a36d',
    borderGold:        '#d4a846',

    // Text
    textDark:          '#2d1f12',
    textMid:           '#5a4a38',
    textLabel:         '#3a2a18',
    textMuted:         '#7a6a58',

    // Corner radius (unified)
    radius:            8,
} as const;

/**
 * Draw a light-parchment panel — the classic Darksaber container.
 * Warm beige fill, double retro border (dark outer + light inner).
 */
export function drawParchmentPanel(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    options?: {
        radius?: number;
        shadow?: boolean;
    }
): void {
    const r = options?.radius ?? Parchment.radius;

    ctx.save();

    // Drop shadow
    if (options?.shadow !== false) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
    }

    // Outer fill
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = Parchment.panelBg;
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Inner lighter fill for depth
    ctx.beginPath();
    roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 2));
    ctx.fillStyle = Parchment.panelBgLight;
    ctx.fill();

    // Another inner fill (classic retro 3-layer)
    ctx.beginPath();
    roundRect(ctx, x + 5, y + 5, w - 10, h - 10, Math.max(0, r - 3));
    ctx.fillStyle = Parchment.panelBgInner;
    ctx.fill();

    // Outer border (dark)
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = Parchment.borderDark;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner border (light gold)
    ctx.beginPath();
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(0, r - 3));
    ctx.strokeStyle = Parchment.borderLight;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

/**
 * Render the "DARKSABER" game title in an epic medieval dark-fantasy style.
 * Gold gradient text + dark outline + metallic glow + decorative details.
 *
 * @returns The total height consumed (for stacking below).
 */
export function renderGameTitle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    options?: {
        scale?: number;      // 1.0 = normal, 2.0 = double size
        subtitle?: string;
    }
): number {
    const s = options?.scale ?? 1.0;
    const fontSize = Math.round(36 * s);
    const subFontSize = Math.round(11 * s);

    ctx.save();

    // ─── Main title: "DARKSABER" ─────────────────────
    const titleText = 'DARKSABER';

    // Gold gradient fill
    const grad = ctx.createLinearGradient(x, y, x, y + fontSize);
    grad.addColorStop(0, '#ffd700');   // bright gold top
    grad.addColorStop(0.3, '#f0c050');
    grad.addColorStop(0.5, '#ffe88a'); // light highlight center
    grad.addColorStop(0.7, '#c8922a'); // darker gold
    grad.addColorStop(1, '#8b6914');   // deep dark gold bottom

    // Outer glow (red/crimson aura)
    ctx.shadowColor = 'rgba(228, 63, 90, 0.6)';
    ctx.shadowBlur = 20 * s;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Font setup
    ctx.font = `900 ${fontSize}px "Georgia", "Times New Roman", serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = `${Math.round(4 * s)}px`;

    // Dark outline (draw text multiple times offset for thick outline)
    ctx.fillStyle = '#1a0a00';
    const off = Math.max(2, Math.round(2.5 * s));
    for (let ox = -off; ox <= off; ox++) {
        for (let oy = -off; oy <= off; oy++) {
            if (ox === 0 && oy === 0) continue;
            ctx.fillText(titleText, x + ox, y + oy);
        }
    }

    // Reset glow for main fill pass
    ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
    ctx.shadowBlur = 8 * s;

    // Main gold gradient fill
    ctx.fillStyle = grad;
    ctx.fillText(titleText, x, y);

    // Inner highlight stroke (metallic edge)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 240, 180, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeText(titleText, x, y);

    // ─── Decorative separator ──────────────────
    const lineY = y + fontSize + 4 * s;
    const titleW = ctx.measureText(titleText).width;
    const lineGrad = ctx.createLinearGradient(x, lineY, x + titleW, lineY);
    lineGrad.addColorStop(0, 'rgba(200, 163, 109, 0)');
    lineGrad.addColorStop(0.2, 'rgba(200, 163, 109, 0.6)');
    lineGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.8)');
    lineGrad.addColorStop(0.8, 'rgba(200, 163, 109, 0.6)');
    lineGrad.addColorStop(1, 'rgba(200, 163, 109, 0)');

    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + titleW, lineY);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    // ─── Subtitle ──────────────────────────────
    let totalH = fontSize + 8 * s;
    if (options?.subtitle) {
        const subY = lineY + 6 * s;
        ctx.shadowBlur = 0;
        ctx.font = `${subFontSize}px ${UI.fontPrimary}`;
        ctx.fillStyle = DarkParchment.textMuted;
        ctx.letterSpacing = `${Math.round(2 * s)}px`;
        ctx.fillText(options.subtitle, x + 2, subY);
        totalH = (subY - y) + subFontSize + 4 * s;
    }

    ctx.letterSpacing = '0px';
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    return totalH;
}
