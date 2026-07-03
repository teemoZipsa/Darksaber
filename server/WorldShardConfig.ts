export const MAX_SUPPORTED_WORLD_SHARD_COUNT = 1;

export interface WorldShardConfig {
    count: number;
    maxSupported: number;
}

export function parseWorldShardCount(value: string | undefined): number {
    return Math.max(1, Math.floor(Number(value ?? 1)));
}

export function createWorldShardConfig(value: string | undefined): WorldShardConfig {
    const count = parseWorldShardCount(value);
    assertSupportedWorldShardCount(count);
    return {
        count,
        maxSupported: MAX_SUPPORTED_WORLD_SHARD_COUNT,
    };
}

export function assertSupportedWorldShardCount(count: number): void {
    if (count > MAX_SUPPORTED_WORLD_SHARD_COUNT) {
        throw new Error(
            'WORLD_SHARD_COUNT > 1 is intentionally unsupported until party/raid-instance session keys are sharded.'
        );
    }
}
