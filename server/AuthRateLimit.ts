import type { IncomingMessage } from 'node:http';

export interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export class MemoryRateLimiter {
    private readonly buckets = new Map<string, RateLimitEntry>();

    public constructor(
        private readonly limit: number,
        private readonly windowMs: number,
    ) {}

    public isAllowed(key: string, now: number = Date.now()): boolean {
        const entry = this.buckets.get(key);
        if (!entry || entry.resetAt <= now) return true;
        return entry.count < this.limit;
    }

    public record(key: string, now: number = Date.now()): void {
        const entry = this.buckets.get(key);
        if (!entry || entry.resetAt <= now) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            return;
        }
        entry.count += 1;
    }

    public clear(key: string): void {
        this.buckets.delete(key);
    }

    public assertAllowed(key: string, now: number = Date.now()): void {
        if (!this.isAllowed(key, now)) throw new RateLimitExceededError();
    }

    public consume(key: string, now: number = Date.now()): void {
        this.assertAllowed(key, now);
        this.record(key, now);
    }
}

export class RateLimitExceededError extends Error {
    public constructor() {
        super('rate limit exceeded');
        this.name = 'RateLimitExceededError';
    }
}

export function resolveTrustProxy(explicit?: boolean): boolean {
    if (explicit !== undefined) return explicit;
    return process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true';
}

export function resolveClientIp(request: IncomingMessage, trustProxy: boolean): string {
    if (trustProxy) {
        const forwarded = request.headers['x-forwarded-for'];
        if (typeof forwarded === 'string') {
            const candidate = forwarded.split(',')[0]?.trim();
            if (candidate) return candidate;
        }
    }
    return request.socket.remoteAddress ?? 'unknown';
}
