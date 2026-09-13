const FIELD_IDLE_OFFSETS = [0, 0, -1, -1, 0, 0, 0, 1, 1, 0, 0, 0] as const;
const FIELD_IDLE_STEPS_PER_SECOND = 5;

/**
 * Slow, pixel-snapped breathing for a stationary party sprite.
 *
 * The field sheets currently contain walking and action poses, but no dedicated
 * idle cells. Keeping the neutral cell and moving it by one whole pixel avoids
 * both walking-in-place and sub-pixel shimmer. The stable id phase keeps a
 * party from breathing in lockstep.
 */
export function getFieldIdleYOffset(
    worldTime: number,
    entityId: string,
    motionReduced: boolean = false
): number {
    if (motionReduced || !Number.isFinite(worldTime)) return 0;

    const timeStep = Math.floor(Math.max(0, worldTime) * FIELD_IDLE_STEPS_PER_SECOND);
    const phase = getStablePhase(entityId, FIELD_IDLE_OFFSETS.length);
    return FIELD_IDLE_OFFSETS[(timeStep + phase) % FIELD_IDLE_OFFSETS.length];
}

function getStablePhase(value: string, modulo: number): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % modulo;
}
