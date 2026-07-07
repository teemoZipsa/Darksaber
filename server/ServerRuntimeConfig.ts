export type AuthStoreKind = 'postgres' | 'memory';

export interface ServerRuntimeConfig {
    databaseUrl: string | null;
    authStoreKind: AuthStoreKind;
}

export function resolveServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServerRuntimeConfig {
    const databaseUrl = env.DATABASE_URL?.trim() || null;
    if (env.NODE_ENV === 'production' && !databaseUrl) {
        throw new Error('DATABASE_URL is required when NODE_ENV=production.');
    }
    return {
        databaseUrl,
        authStoreKind: databaseUrl ? 'postgres' : 'memory',
    };
}
