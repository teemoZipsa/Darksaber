/**
 * BuffSystem — 4 core buffs from Dark Saver:
 * 어택 (Attack Up), 프로텍션 (Defense Up), 퀵 (AP Cost Down), 힐 (HP Restore)
 */

import { CharacterStats } from '../data/Stats';

export type BuffType = 'attack' | 'protection' | 'quick' | 'heal';

export interface ActiveBuff {
    type: BuffType;
    turnsRemaining: number;
    value: number;  // buff strength
}

export class BuffSystem {
    private buffs: Map<string, ActiveBuff[]> = new Map(); // entityId → active buffs

    /** Apply a buff to an entity */
    public applyBuff(entityId: string, type: BuffType, duration: number, value: number): void {
        if (!this.buffs.has(entityId)) {
            this.buffs.set(entityId, []);
        }

        const existing = this.buffs.get(entityId)!;
        // Replace existing buff of same type (don't stack, refresh)
        const idx = existing.findIndex(b => b.type === type);
        if (idx >= 0) {
            existing[idx] = { type, turnsRemaining: duration, value };
        } else {
            existing.push({ type, turnsRemaining: duration, value });
        }
    }

    /** Get modified stats after applying all active buffs */
    public getBuffedStats(entityId: string, baseStats: CharacterStats): CharacterStats {
        const buffed = { ...baseStats };
        const active = this.buffs.get(entityId) || [];

        for (const buff of active) {
            switch (buff.type) {
                case 'attack':
                    buffed.atk += buff.value;
                    break;
                case 'protection':
                    buffed.def += buff.value;
                    break;
                case 'quick':
                    // Quick reduces AP cost — handled in TurnManager
                    break;
                case 'heal':
                    // Heal is instant, not a persistent buff
                    break;
            }
        }
        return buffed;
    }

    /** Check if entity has Quick buff active */
    public hasQuickBuff(entityId: string): boolean {
        const active = this.buffs.get(entityId) || [];
        return active.some(b => b.type === 'quick' && b.turnsRemaining > 0);
    }

    /** Tick all buffs (call at end of each turn) */
    public tickBuffs(entityId: string): void {
        const active = this.buffs.get(entityId);
        if (!active) return;

        for (let i = active.length - 1; i >= 0; i--) {
            active[i].turnsRemaining--;
            if (active[i].turnsRemaining <= 0) {
                active.splice(i, 1);
            }
        }
    }

    /** Get active buffs for an entity (for UI display) */
    public getActiveBuffs(entityId: string): ActiveBuff[] {
        return this.buffs.get(entityId) || [];
    }

    /** Clear all buffs for an entity */
    public clearBuffs(entityId: string): void {
        this.buffs.delete(entityId);
    }
}
