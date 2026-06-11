export interface WorldSessionLootLock {
    lootId: string;
    playerId: string;
    lastTouchedAt: number;
}

interface AutoLootPending {
    playerId: string;
    createdAt: number;
}

export class WorldSessionLootState {
    private readonly locks = new Map<string, Omit<WorldSessionLootLock, 'lootId'>>();
    private readonly autoLootPending = new Map<string, AutoLootPending>();

    public constructor(
        private readonly autoLootResponseMs: number,
        private readonly lockTimeoutMs: number = 15_000
    ) {}

    public lockCount(): number {
        return this.locks.size;
    }

    public isAutoLootPending(lootId: string): boolean {
        return this.autoLootPending.has(lootId);
    }

    public getLockPlayerId(lootId: string): string | undefined {
        return this.locks.get(lootId)?.playerId;
    }

    public occupy(lootId: string, playerId: string, now: number): 'occupied' | 'occupied_by_other' {
        const lock = this.locks.get(lootId);
        if (lock && lock.playerId !== playerId) return 'occupied_by_other';
        this.locks.set(lootId, { playerId, lastTouchedAt: now });
        return 'occupied';
    }

    public isOccupiedBy(lootId: string, playerId: string): boolean {
        return this.locks.get(lootId)?.playerId === playerId;
    }

    public touch(lootId: string, now: number): void {
        const lock = this.locks.get(lootId);
        if (lock) lock.lastTouchedAt = now;
    }

    public releaseLoot(lootId: string): void {
        this.locks.delete(lootId);
        this.autoLootPending.delete(lootId);
    }

    public releaseLocksForPlayer(playerId: string): void {
        for (const [lootId, lock] of this.locks) {
            if (lock.playerId === playerId) this.locks.delete(lootId);
        }
    }

    public createAutoLootPending(lootId: string, playerId: string, now: number): void {
        this.autoLootPending.set(lootId, { playerId, createdAt: now });
    }

    public consumeAutoLootPending(lootId: string, playerId: string): boolean {
        const pending = this.autoLootPending.get(lootId);
        if (!pending || pending.playerId !== playerId) return false;
        this.autoLootPending.delete(lootId);
        return true;
    }

    public releaseExpiredAutoLoot(now: number, onRelease: (lootId: string) => void): void {
        for (const [lootId, pending] of this.autoLootPending) {
            if (now - pending.createdAt <= this.autoLootResponseMs) continue;
            this.autoLootPending.delete(lootId);
            onRelease(lootId);
        }
    }

    public releaseExpiredLocks(now: number, shouldRelease: (lock: WorldSessionLootLock) => boolean): void {
        for (const [lootId, lock] of this.locks) {
            const entry = { lootId, ...lock };
            if (now - lock.lastTouchedAt > this.lockTimeoutMs || shouldRelease(entry)) {
                this.locks.delete(lootId);
            }
        }
    }
}
