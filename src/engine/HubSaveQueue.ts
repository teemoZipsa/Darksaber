export interface HubSaveQueueResult {
    ok: boolean;
    code?: string;
    message?: string;
    retryable?: boolean;
}

export interface HubSaveQueueAttempt {
    epoch: number;
    generation: number;
    keepalive: boolean;
}

interface HubSaveQueueOptions {
    send: (attempt: HubSaveQueueAttempt) => Promise<HubSaveQueueResult>;
    onResult?: (result: HubSaveQueueResult | null) => void;
    retryDelaysMs?: readonly number[];
    setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000] as const;

/**
 * Serializes hub-save writes without dropping mutations made during an active
 * request. A reset advances the epoch so an old character's completion cannot
 * acknowledge work queued for the newly selected character.
 */
export class HubSaveQueue {
    private readonly send: HubSaveQueueOptions['send'];
    private readonly onResult: NonNullable<HubSaveQueueOptions['onResult']>;
    private readonly retryDelaysMs: readonly number[];
    private readonly setTimer: NonNullable<HubSaveQueueOptions['setTimer']>;
    private readonly clearTimer: NonNullable<HubSaveQueueOptions['clearTimer']>;

    private epoch = 0;
    private requestedGeneration = 0;
    private persistedGeneration = 0;
    private activeDrain: { epoch: number; promise: Promise<HubSaveQueueResult> } | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryAttempt = 0;
    private keepaliveRequested = false;
    private paused = false;

    constructor(options: HubSaveQueueOptions) {
        this.send = options.send;
        this.onResult = options.onResult ?? (() => undefined);
        this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
        this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
        this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    }

    public getEpoch(): number {
        return this.epoch;
    }

    public hasPending(): boolean {
        return this.requestedGeneration > this.persistedGeneration;
    }

    public markDirty(): number {
        this.requestedGeneration += 1;
        return this.requestedGeneration;
    }

    /** Mark one snapshot dirty only when no save is already pending. */
    public ensurePending(): number {
        if (!this.hasPending()) this.markDirty();
        return this.requestedGeneration;
    }

    public setPaused(paused: boolean): void {
        this.paused = paused;
        if (paused) this.cancelRetry();
    }

    public reset(): void {
        this.epoch += 1;
        this.requestedGeneration = 0;
        this.persistedGeneration = 0;
        this.keepaliveRequested = false;
        this.retryAttempt = 0;
        this.cancelRetry();
        this.activeDrain = null;
        this.onResult(null);
    }

    public retryNow(): void {
        if (this.paused || !this.hasPending()) return;
        this.cancelRetry();
        void this.flush();
    }

    /**
     * Drains through the newest generation, including changes marked while a
     * request is in flight. On failure the dirty generation remains queued.
     */
    public async flush(options: { keepalive?: boolean } = {}): Promise<HubSaveQueueResult> {
        if (options.keepalive) this.keepaliveRequested = true;
        if (this.paused) {
            return {
                ok: false,
                code: 'hub_flush_paused',
                message: 'Hub save queue is paused.',
            };
        }
        if (!this.hasPending()) return { ok: true };

        this.cancelRetry();
        const currentEpoch = this.epoch;
        if (this.activeDrain?.epoch === currentEpoch) return this.activeDrain.promise;

        const promise = this.drain(currentEpoch);
        this.activeDrain = { epoch: currentEpoch, promise };
        void promise.finally(() => {
            if (this.activeDrain?.promise === promise) this.activeDrain = null;
        });
        return promise;
    }

    private async drain(epoch: number): Promise<HubSaveQueueResult> {
        while (epoch === this.epoch && !this.paused && this.hasPending()) {
            const generation = this.requestedGeneration;
            const keepalive = this.keepaliveRequested;
            this.keepaliveRequested = false;
            let result: HubSaveQueueResult;
            try {
                result = await this.send({ epoch, generation, keepalive });
            } catch {
                result = {
                    ok: false,
                    code: 'hub_flush_failed',
                    message: 'Hub save queue failed unexpectedly.',
                };
            }

            if (epoch !== this.epoch) return { ok: true };
            if (!result.ok) {
                this.keepaliveRequested ||= keepalive;
                this.onResult(result);
                if (result.retryable) this.scheduleRetry();
                return result;
            }

            this.persistedGeneration = Math.max(this.persistedGeneration, generation);
            this.retryAttempt = 0;
            this.onResult(null);
        }

        if (this.paused && this.hasPending()) {
            return {
                ok: false,
                code: 'hub_flush_paused',
                message: 'Hub save queue is paused.',
            };
        }
        return { ok: true };
    }

    private scheduleRetry(): void {
        if (this.paused || this.retryTimer !== null || !this.hasPending()) return;
        const delayIndex = Math.min(this.retryAttempt, this.retryDelaysMs.length - 1);
        const delayMs = this.retryDelaysMs[Math.max(0, delayIndex)] ?? 1_000;
        this.retryAttempt += 1;
        this.retryTimer = this.setTimer(() => {
            this.retryTimer = null;
            if (!this.paused) void this.flush();
        }, delayMs);
    }

    private cancelRetry(): void {
        if (this.retryTimer === null) return;
        this.clearTimer(this.retryTimer);
        this.retryTimer = null;
    }
}
