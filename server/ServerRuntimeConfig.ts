import { parseAllowedOrigins } from './OriginPolicy';

export type AuthStoreKind = 'postgres' | 'memory';

export interface ServerRuntimeConfig {
    databaseUrl: string | null;
    authStoreKind: AuthStoreKind;
    allowedOrigins: string[];
}

export function resolveServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServerRuntimeConfig {
    const databaseUrl = env.DATABASE_URL?.trim() || null;
    const allowedOriginsValue = env.AUTH_ALLOWED_ORIGINS?.trim() || '';
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction) {
        if (!databaseUrl) throw new Error('DATABASE_URL is required when NODE_ENV=production.');
        if (!allowedOriginsValue) throw new Error('AUTH_ALLOWED_ORIGINS is required when NODE_ENV=production.');
    }
    const allowedOrigins = parseAllowedOrigins(allowedOriginsValue || undefined);
    return {
        databaseUrl,
        authStoreKind: databaseUrl ? 'postgres' : 'memory',
        allowedOrigins,
    };
}
