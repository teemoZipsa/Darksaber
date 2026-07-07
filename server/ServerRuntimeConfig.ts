import { parseAllowedOrigins } from './OriginPolicy';

export type AuthStoreKind = 'postgres' | 'memory';

export interface ServerRuntimeConfig {
    databaseUrl: string | null;
    authStoreKind: AuthStoreKind;
    allowedOrigins: string[];
    allowMissingOrigin: boolean;
    refreshCookieSecure: boolean;
}

export function resolveServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServerRuntimeConfig {
    const databaseUrl = env.DATABASE_URL?.trim() || null;
    const allowedOriginsValue = env.AUTH_ALLOWED_ORIGINS?.trim() || '';
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction) {
        if (!databaseUrl) throw new Error('DATABASE_URL is required when NODE_ENV=production.');
        if (!allowedOriginsValue) throw new Error('AUTH_ALLOWED_ORIGINS is required when NODE_ENV=production.');
        if (env.AUTH_REFRESH_COOKIE_SECURE === '0') {
            throw new Error('AUTH_REFRESH_COOKIE_SECURE=0 is not allowed when NODE_ENV=production.');
        }
    }
    const allowedOrigins = parseAllowedOrigins(allowedOriginsValue || undefined);
    return {
        databaseUrl,
        authStoreKind: databaseUrl ? 'postgres' : 'memory',
        allowedOrigins,
        allowMissingOrigin: parseBooleanEnv(env.AUTH_ALLOW_MISSING_ORIGIN, !isProduction),
        refreshCookieSecure: env.AUTH_REFRESH_COOKIE_SECURE !== '0',
    };
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
    throw new Error(`Invalid boolean env value: ${value}`);
}
