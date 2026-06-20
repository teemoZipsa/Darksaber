import type { ServerPlayer } from './WorldSessionTypes';
import { sanitizeCarriedWeight } from './WorldSessionInput';

export function addCarriedWeight(player: ServerPlayer | undefined, weight: number): void {
    if (!player || weight <= 0) return;
    player.carriedWeight = sanitizeCarriedWeight(player.carriedWeight + weight);
}

export function removeCarriedWeight(player: ServerPlayer | undefined, weight: number): void {
    if (!player || weight <= 0) return;
    player.carriedWeight = sanitizeCarriedWeight(player.carriedWeight - weight);
}

export function addCarriedItemQuantity(player: ServerPlayer | undefined, itemId: string, quantity: number): void {
    if (!player || !itemId || !Number.isFinite(quantity) || quantity === 0) return;
    const next = Math.max(0, (player.carriedItems.get(itemId) ?? 0) + Math.floor(quantity));
    if (next > 0) player.carriedItems.set(itemId, next);
    else player.carriedItems.delete(itemId);
}
