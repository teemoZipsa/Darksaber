import { URL } from 'node:url';
import { Pool, type PoolConfig } from 'pg';

const SSL_MODES_TO_PIN_AS_VERIFY_FULL = new Set(['prefer', 'require', 'verify-ca']);

export function normalizePostgresConnectionString(connectionString: string): string {
    let url: URL;
    try {
        url = new URL(connectionString);
    } catch {
        return connectionString;
    }

    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        return connectionString;
    }

    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    if (!sslMode || !SSL_MODES_TO_PIN_AS_VERIFY_FULL.has(sslMode)) {
        return connectionString;
    }

    url.searchParams.set('sslmode', 'verify-full');
    return url.toString();
}

export function createPostgresPool(connectionString: string, options: Omit<PoolConfig, 'connectionString'> = {}): Pool {
    return new Pool({
        ...options,
        connectionString: normalizePostgresConnectionString(connectionString),
    });
}
