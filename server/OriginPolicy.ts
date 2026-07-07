export interface OriginPolicy {
    allowedOrigins: readonly string[];
    allowMissingOrigin: boolean;
}

export const DEFAULT_DEV_ALLOWED_ORIGINS = [
    'http://localhost:5731',
    'http://127.0.0.1:5731',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
] as const;

export function parseAllowedOrigins(value: string | undefined): string[] {
    const configured = value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    if (configured && configured.length > 0) return [...new Set(configured.map(parseAllowedOrigin))];
    return [...DEFAULT_DEV_ALLOWED_ORIGINS];
}

function parseAllowedOrigin(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`Invalid AUTH_ALLOWED_ORIGINS origin: ${value}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Invalid AUTH_ALLOWED_ORIGINS origin protocol: ${value}`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`AUTH_ALLOWED_ORIGINS entries must be origins without paths: ${value}`);
    }
    return url.origin;
}

export function createOriginPolicy(options: {
    allowedOrigins: readonly string[];
    allowMissingOrigin?: boolean;
}): OriginPolicy {
    return {
        allowedOrigins: options.allowedOrigins,
        // Missing Origin is allowed for non-browser clients such as native launchers,
        // CLI smoke checks, and server-to-server probes. Browser requests still carry
        // Origin and must match the allowlist.
        allowMissingOrigin: options.allowMissingOrigin ?? true,
    };
}

export function isAllowedOrigin(origin: string | null, policy: OriginPolicy): boolean {
    if (!origin) return policy.allowMissingOrigin;
    return policy.allowedOrigins.includes(origin);
}
