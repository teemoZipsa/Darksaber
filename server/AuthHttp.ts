import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
    createAccessToken,
    createRefreshToken,
    hashPassword,
    hashRefreshToken,
    verifyAccessToken,
    verifyPassword,
    type JwtOptions,
} from './AuthCrypto';
import {
    AuthStoreConflict,
    CURRENT_SAVE_VERSION,
    isStartingClassKey,
    normalizeLoginName,
    type AuthAccount,
    type AuthCharacter,
    type AuthSession,
    type AuthStore,
    type CharacterSave,
    type SaveUpdateInput,
} from './AuthStore';
import { errorToLogValue, logServerEvent } from './WorldServerObservability';
import { normalizeLoadout } from '../src/magic/MagicLoadout';
import {
    MemoryRateLimiter,
    RateLimitExceededError,
    resolveClientIp,
    resolveTrustProxy,
} from './AuthRateLimit';

export interface AuthHttpOptions {
    store: AuthStore;
    jwt: JwtOptions;
    allowedOrigins: string[];
    refreshTtlMs?: number;
    refreshCookieSecure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    trustProxy?: boolean;
    registerRateLimiter?: MemoryRateLimiter;
    loginIpRateLimiter?: MemoryRateLimiter;
    loginFailureRateLimiter?: MemoryRateLimiter;
    refreshRateLimiter?: MemoryRateLimiter;
}

export interface AuthenticatedSession {
    account: AuthAccount;
    session: AuthSession;
    claims: {
        accountId: string;
        sessionId: string;
        expiresAt: number;
    };
}

interface HandlerContext {
    request: IncomingMessage;
    response: ServerResponse;
    origin: string | null;
    url: URL;
}

interface AuthHttpRuntime {
    trustProxy: boolean;
    registerLimiter: MemoryRateLimiter;
    loginIpLimiter: MemoryRateLimiter;
    loginFailureLimiter: MemoryRateLimiter;
    refreshLimiter: MemoryRateLimiter;
}

const REFRESH_COOKIE = 'ds_refresh';
const DEFAULT_REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const JSON_LIMIT_BYTES = 1024 * 256;
const AUTH_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10;
const REGISTER_IP_LIMIT = 8;
const LOGIN_IP_LIMIT = 30;
const LOGIN_FAILURE_WINDOW_MS = 1000 * 60 * 10;
const LOGIN_FAILURE_LIMIT = 5;
const REFRESH_IP_LIMIT = 60;
const CLIENT_SAVE_PATCH_FIELDS = new Set(['rosterSnapshot']);

export function createAuthHttpHandler(options: AuthHttpOptions): (request: IncomingMessage, response: ServerResponse) => Promise<boolean> {
    const runtime = createAuthHttpRuntime(options);
    return async (request, response) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        if (!isAuthPath(url.pathname)) return false;

        const origin = typeof request.headers.origin === 'string' ? request.headers.origin : null;
        if (!isAllowedOrigin(origin, options.allowedOrigins)) {
            writeJson(response, 403, { error: 'origin_forbidden' }, origin, options);
            return true;
        }
        if (request.method === 'OPTIONS') {
            writeCorsPreflight(response, origin, options);
            return true;
        }

        const context: HandlerContext = { request, response, origin, url };
        try {
            await routeAuthRequest(context, options, runtime);
        } catch (error) {
            if (error instanceof HttpError) {
                writeJson(response, error.status, { error: error.code, message: error.message }, origin, options);
            } else {
                logServerEvent('error', 'auth_http_error', { path: url.pathname, method: request.method, error: errorToLogValue(error) });
                writeJson(response, 500, { error: 'server_error' }, origin, options);
            }
        }
        return true;
    };
}

export async function authenticateAccessToken(
    store: AuthStore,
    token: string,
    jwt: JwtOptions,
    nowMs: number = Date.now()
): Promise<AuthenticatedSession | null> {
    const claims = verifyAccessToken(token, jwt, nowMs);
    if (!claims) return null;
    const [session, account] = await Promise.all([
        store.getSession(claims.sessionId),
        store.getAccount(claims.accountId),
    ]);
    if (!session || !account) return null;
    if (session.accountId !== account.id) return null;
    if (session.revokedAt || Date.parse(session.expiresAt) <= nowMs) return null;
    if (account.disabledAt) return null;
    return { account, session, claims };
}

function isAuthPath(pathname: string): boolean {
    return pathname === '/auth/register'
        || pathname === '/auth/login'
        || pathname === '/auth/refresh'
        || pathname === '/auth/logout'
        || pathname === '/auth/logout-all'
        || pathname === '/account/me'
        || pathname === '/characters'
        || /^\/characters\/[^/]+(?:\/select|\/save)?$/.test(pathname);
}

async function routeAuthRequest(context: HandlerContext, options: AuthHttpOptions, runtime: AuthHttpRuntime): Promise<void> {
    const { request, response, origin, url } = context;
    if (request.method === 'POST' && url.pathname === '/auth/register') {
        consumeAuthRateLimit(runtime.registerLimiter, `register:${ipHash(context, runtime.trustProxy)}`, 'register_rate_limited', 'Too many registration attempts.');
        const body = await readJsonObject(request);
        const loginName = readString(body.loginName, 'loginName').trim();
        const password = readString(body.password, 'password');
        validateLoginName(loginName);
        validatePassword(password);
        const loginNameNormalized = normalizeLoginName(loginName);
        const passwordHash = await hashPassword(password);
        let account: AuthAccount;
        try {
            account = await options.store.createAccount({ loginName, loginNameNormalized, passwordHash });
        } catch (error) {
            if (error instanceof AuthStoreConflict && error.code === 'login_name') throw new HttpError(409, 'login_name_taken', 'Login name is already registered.');
            throw error;
        }
        const payload = await createLoginPayload(account, context, options, runtime.trustProxy);
        writeJson(response, 201, payload, origin, options);
        return;
    }

    if (request.method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJsonObject(request);
        const loginName = readString(body.loginName, 'loginName').trim();
        const password = readString(body.password, 'password');
        const normalized = normalizeLoginName(loginName);
        const ip = ipHash(context, runtime.trustProxy);
        consumeAuthRateLimit(runtime.loginIpLimiter, `login:ip:${ip}`, 'login_rate_limited', 'Too many login attempts.');
        const failureKey = `login-fail:${ip}:${normalized}`;
        assertAuthRateLimit(runtime.loginFailureLimiter, failureKey, 'login_rate_limited', 'Too many login attempts.');
        const account = await options.store.findAccountByLoginNameNormalized(normalized);
        if (!account || account.disabledAt || !(await verifyPassword(account.passwordHash, password))) {
            runtime.loginFailureLimiter.record(failureKey);
            throw new HttpError(401, 'invalid_credentials', 'Invalid login name or password.');
        }
        runtime.loginFailureLimiter.clear(failureKey);
        const payload = await createLoginPayload(account, context, options, runtime.trustProxy);
        writeJson(response, 200, payload, origin, options);
        return;
    }

    if (request.method === 'POST' && url.pathname === '/auth/refresh') {
        consumeAuthRateLimit(runtime.refreshLimiter, `refresh:${ipHash(context, runtime.trustProxy)}`, 'refresh_rate_limited', 'Too many refresh attempts.');
        const refreshToken = getCookie(request, REFRESH_COOKIE);
        if (!refreshToken) throw new HttpError(401, 'refresh_missing', 'Refresh token cookie is missing.');
        const session = await options.store.findSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
        if (!session) {
            clearRefreshCookie(response, options);
            throw new HttpError(401, 'refresh_invalid', 'Refresh token is invalid.');
        }
        if (session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
            await options.store.revokeTokenFamily(session.tokenFamilyId, new Date().toISOString());
            clearRefreshCookie(response, options);
            throw new HttpError(401, 'refresh_reused', 'Refresh token is expired or has already been used.');
        }
        const account = await options.store.getAccount(session.accountId);
        if (!account || account.disabledAt) {
            await options.store.revokeTokenFamily(session.tokenFamilyId, new Date().toISOString());
            clearRefreshCookie(response, options);
            throw new HttpError(401, 'account_unavailable', 'Account is unavailable.');
        }
        const nextRefreshToken = createRefreshToken();
        const nextSession = await options.store.rotateSession(session.id, {
            accountId: account.id,
            refreshTokenHash: hashRefreshToken(nextRefreshToken),
            tokenFamilyId: session.tokenFamilyId,
            expiresAt: new Date(Date.now() + getRefreshTtlMs(options)).toISOString(),
            userAgent: userAgent(context),
            ipHash: ipHash(context, runtime.trustProxy),
        });
        if (!nextSession) throw new HttpError(401, 'session_missing', 'Session is unavailable.');
        setRefreshCookie(response, nextRefreshToken, options);
        writeJson(response, 200, await buildSessionResponse(account, nextSession, options), origin, options);
        return;
    }

    if (request.method === 'POST' && url.pathname === '/auth/logout') {
        const refreshToken = getCookie(request, REFRESH_COOKIE);
        if (refreshToken) {
            const session = await options.store.findSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
            if (session) await options.store.revokeSession(session.id, new Date().toISOString());
        }
        clearRefreshCookie(response, options);
        writeJson(response, 200, { ok: true }, origin, options);
        return;
    }

    if (request.method === 'POST' && url.pathname === '/auth/logout-all') {
        const auth = await requireAuth(context, options);
        await options.store.revokeAllSessions(auth.account.id, new Date().toISOString());
        clearRefreshCookie(response, options);
        writeJson(response, 200, { ok: true }, origin, options);
        return;
    }

    if (request.method === 'GET' && url.pathname === '/account/me') {
        const auth = await requireAuth(context, options);
        const [characters, progress] = await Promise.all([
            options.store.listCharacters(auth.account.id),
            options.store.getAccountProgress(auth.account.id),
        ]);
        writeJson(response, 200, {
            account: accountDto(auth.account),
            characters: characters.map(characterDto),
            lastSelectedCharacterId: auth.account.lastSelectedCharacterId,
            accountProgress: progress,
        }, origin, options);
        return;
    }

    if (request.method === 'GET' && url.pathname === '/characters') {
        const auth = await requireAuth(context, options);
        const characters = await options.store.listCharacters(auth.account.id);
        writeJson(response, 200, { characters: characters.map(characterDto) }, origin, options);
        return;
    }

    if (request.method === 'POST' && url.pathname === '/characters') {
        const auth = await requireAuth(context, options);
        const body = await readJsonObject(request);
        const name = readString(body.name, 'name').trim();
        const classKey = body.classKey;
        if (!isStartingClassKey(classKey)) throw new HttpError(400, 'invalid_class', 'Invalid character class.');
        if (name.length < 1 || name.length > 24) throw new HttpError(400, 'invalid_character_name', 'Character name must be 1-24 characters.');
        const gender = typeof body.gender === 'string' && body.gender === 'F' ? 'F' : 'M';
        try {
            const created = await options.store.createCharacter(auth.account.id, { name, classKey, gender });
            writeJson(response, 201, {
                character: characterDto(created.character),
                save: created.save,
            }, origin, options);
        } catch (error) {
            if (error instanceof AuthStoreConflict) {
                const status = error.code === 'character_slot' ? 409 : 409;
                throw new HttpError(status, error.code, error.message);
            }
            throw error;
        }
        return;
    }

    const characterMatch = /^\/characters\/([^/]+)(?:\/(select|save))?$/.exec(url.pathname);
    if (characterMatch) {
        const auth = await requireAuth(context, options);
        const characterId = decodeURIComponent(characterMatch[1]);
        const action = characterMatch[2] ?? '';
        if (request.method === 'DELETE' && action === '') {
            const deleted = await options.store.deleteCharacter(auth.account.id, characterId);
            if (!deleted) throw new HttpError(404, 'character_not_found', 'Character was not found.');
            writeJson(response, 200, { ok: true }, origin, options);
            return;
        }
        if (request.method === 'POST' && action === 'select') {
            const selected = await options.store.selectCharacter(auth.account.id, characterId);
            if (!selected) throw new HttpError(404, 'character_not_found', 'Character was not found.');
            const progress = await options.store.getAccountProgress(auth.account.id);
            writeJson(response, 200, {
                account: accountDto(selected.account),
                character: characterDto(selected.character),
                save: selected.save,
                accountProgress: progress,
            }, origin, options);
            return;
        }
        if (request.method === 'GET' && action === 'save') {
            const save = await options.store.getCharacterSave(auth.account.id, characterId);
            if (!save) throw new HttpError(404, 'character_not_found', 'Character save was not found.');
            writeJson(response, 200, { save }, origin, options);
            return;
        }
        if (request.method === 'PATCH' && action === 'save') {
            const body = await readJsonObject(request);
            const expectedRevision = readNumber(body.expectedRevision, 'expectedRevision');
            const patch = isRecord(body.save) ? body.save : isRecord(body.patch) ? body.patch : {};
            const save = await options.store.getCharacterSave(auth.account.id, characterId);
            if (!save) throw new HttpError(404, 'character_not_found', 'Character save was not found.');
            const clientPatch = buildClientSavePatch(patch, save);
            const result = await options.store.updateCharacterSave(auth.account.id, characterId, {
                expectedRevision,
                patch: clientPatch,
            });
            if (result.status === 'not_found') throw new HttpError(404, 'character_not_found', 'Character save was not found.');
            if (result.status === 'conflict') {
                writeJson(response, 409, { error: 'revision_conflict', currentRevision: result.currentRevision }, origin, options);
                return;
            }
            writeJson(response, 200, { save: result.save }, origin, options);
            return;
        }
    }

    throw new HttpError(404, 'not_found', 'Route not found.');
}

async function createLoginPayload(
    account: AuthAccount,
    context: HandlerContext,
    options: AuthHttpOptions,
    trustProxy: boolean,
): Promise<Record<string, unknown>> {
    const refreshToken = createRefreshToken();
    const session = await options.store.createSession({
        accountId: account.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        tokenFamilyId: randomUUID(),
        expiresAt: new Date(Date.now() + getRefreshTtlMs(options)).toISOString(),
        userAgent: userAgent(context),
        ipHash: ipHash(context, trustProxy),
    });
    setRefreshCookie(context.response, refreshToken, options);
    return buildSessionResponse(account, session, options);
}

async function buildSessionResponse(account: AuthAccount, session: AuthSession, options: AuthHttpOptions): Promise<Record<string, unknown>> {
    const accessToken = createAccessToken(account.id, session.id, options.jwt);
    const characters = await options.store.listCharacters(account.id);
    const progress = await options.store.getAccountProgress(account.id);
    return {
        accessToken,
        accessTokenExpiresAt: Date.now() + options.jwt.ttlSeconds * 1000,
        account: accountDto(account),
        characters: characters.map(characterDto),
        lastSelectedCharacterId: account.lastSelectedCharacterId,
        accountProgress: progress,
        saveVersion: CURRENT_SAVE_VERSION,
    };
}

async function requireAuth(context: HandlerContext, options: AuthHttpOptions): Promise<AuthenticatedSession> {
    const token = bearerToken(context.request);
    if (!token) throw new HttpError(401, 'access_missing', 'Access token is missing.');
    const auth = await authenticateAccessToken(options.store, token, options.jwt);
    if (!auth) throw new HttpError(401, 'access_invalid', 'Access token is invalid or expired.');
    return auth;
}

function accountDto(account: AuthAccount): Record<string, unknown> {
    return {
        id: account.id,
        loginName: account.loginName,
        lastSelectedCharacterId: account.lastSelectedCharacterId,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        disabledAt: account.disabledAt,
    };
}

function characterDto(character: AuthCharacter): Record<string, unknown> {
    return {
        id: character.id,
        slotNo: character.slotNo,
        name: character.name,
        classKey: character.classKey,
        tier: character.tier,
        level: character.level,
        exp: character.exp,
        baseStats: character.baseStats,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
    };
}

function validateLoginName(loginName: string): void {
    if (loginName.length < 3 || loginName.length > 32) throw new HttpError(400, 'invalid_login_name', 'Login name must be 3-32 characters.');
    if (!/^[A-Za-z0-9_.-]+$/.test(loginName)) throw new HttpError(400, 'invalid_login_name', 'Login name contains unsupported characters.');
}

function validatePassword(password: string): void {
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'invalid_password', 'Password must be 8-128 characters.');
}

function createAuthHttpRuntime(options: AuthHttpOptions): AuthHttpRuntime {
    return {
        trustProxy: resolveTrustProxy(options.trustProxy),
        registerLimiter: options.registerRateLimiter ?? new MemoryRateLimiter(REGISTER_IP_LIMIT, AUTH_RATE_LIMIT_WINDOW_MS),
        loginIpLimiter: options.loginIpRateLimiter ?? new MemoryRateLimiter(LOGIN_IP_LIMIT, AUTH_RATE_LIMIT_WINDOW_MS),
        loginFailureLimiter: options.loginFailureRateLimiter ?? new MemoryRateLimiter(LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS),
        refreshLimiter: options.refreshRateLimiter ?? new MemoryRateLimiter(REFRESH_IP_LIMIT, AUTH_RATE_LIMIT_WINDOW_MS),
    };
}

function consumeAuthRateLimit(limiter: MemoryRateLimiter, key: string, code: string, message: string): void {
    try {
        limiter.consume(key);
    } catch (error) {
        if (error instanceof RateLimitExceededError) throw new HttpError(429, code, message);
        throw error;
    }
}

function assertAuthRateLimit(limiter: MemoryRateLimiter, key: string, code: string, message: string): void {
    try {
        limiter.assertAllowed(key);
    } catch (error) {
        if (error instanceof RateLimitExceededError) throw new HttpError(429, code, message);
        throw error;
    }
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > JSON_LIMIT_BYTES) throw new HttpError(413, 'body_too_large', 'Request body is too large.');
        chunks.push(buffer);
    }
    if (chunks.length === 0) return {};
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        if (!isRecord(parsed)) throw new Error('not object');
        return parsed;
    } catch {
        throw new HttpError(400, 'bad_json', 'Request body must be a JSON object.');
    }
}

function readString(value: unknown, field: string): string {
    if (typeof value !== 'string') throw new HttpError(400, 'missing_field', `${field} is required.`);
    return value;
}

function readNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, 'missing_field', `${field} is required.`);
    return Math.floor(value);
}

function buildClientSavePatch(patch: Record<string, unknown>, currentSave: CharacterSave): SaveUpdateInput['patch'] {
    for (const field of Object.keys(patch)) {
        if (!CLIENT_SAVE_PATCH_FIELDS.has(field)) {
            throw new HttpError(400, 'forbidden_save_field', `${field} cannot be patched by the client.`);
        }
    }

    const next: SaveUpdateInput['patch'] = {};
    if (isRecord(patch.rosterSnapshot)) {
        next.rosterSnapshot = mergeClientRosterSnapshot(currentSave.rosterSnapshot, patch.rosterSnapshot);
    }
    return next;
}

function mergeClientRosterSnapshot(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
    const currentCharacters = Array.isArray(current.characters) ? current.characters : [];
    const incomingById = new Map<string, Record<string, unknown>>();
    if (Array.isArray(incoming.characters)) {
        for (const raw of incoming.characters) {
            if (!isRecord(raw) || typeof raw.id !== 'string') continue;
            incomingById.set(raw.id, raw);
        }
    }

    return {
        ...current,
        characters: currentCharacters.map((raw) => {
            if (!isRecord(raw) || typeof raw.id !== 'string') return raw;
            const incomingCharacter = incomingById.get(raw.id);
            if (!incomingCharacter) return raw;
            return mergeClientRosterCharacter(raw, incomingCharacter);
        }),
    };
}

function mergeClientRosterCharacter(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
    const owner = readLoadoutOwner(current);
    if (!owner || !Array.isArray(incoming.magicLoadout)) return current;
    return {
        ...current,
        magicLoadout: normalizeLoadout(readStringArray(incoming.magicLoadout), owner),
    };
}

function readLoadoutOwner(character: Record<string, unknown>): { classLineId: string; currentTier: number } | null {
    const classLineId = typeof character.classKey === 'string'
        ? character.classKey
        : typeof character.classLineId === 'string'
            ? character.classLineId
            : null;
    const tier = typeof character.tier === 'number' && Number.isFinite(character.tier)
        ? character.tier
        : typeof character.currentTier === 'number' && Number.isFinite(character.currentTier)
            ? character.currentTier
            : null;
    if (!classLineId || tier === null) return null;
    return { classLineId, currentTier: Math.max(1, Math.floor(tier)) };
}

function readStringArray(value: unknown[]): string[] {
    return value.filter((entry): entry is string => typeof entry === 'string');
}

function bearerToken(request: IncomingMessage): string | null {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1] : null;
}

function getCookie(request: IncomingMessage, name: string): string | null {
    const header = request.headers.cookie;
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
        const [rawKey, ...rawValue] = part.trim().split('=');
        if (rawKey === name) return decodeURIComponent(rawValue.join('='));
    }
    return null;
}

function setRefreshCookie(response: ServerResponse, refreshToken: string, options: AuthHttpOptions): void {
    const flags = [
        `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}`,
        'Path=/',
        'HttpOnly',
        `SameSite=${options.sameSite ?? 'Lax'}`,
        `Max-Age=${Math.floor(getRefreshTtlMs(options) / 1000)}`,
    ];
    if (options.refreshCookieSecure ?? true) flags.push('Secure');
    appendSetCookie(response, flags.join('; '));
}

function clearRefreshCookie(response: ServerResponse, options: AuthHttpOptions): void {
    const flags = [
        `${REFRESH_COOKIE}=`,
        'Path=/',
        'HttpOnly',
        `SameSite=${options.sameSite ?? 'Lax'}`,
        'Max-Age=0',
    ];
    if (options.refreshCookieSecure ?? true) flags.push('Secure');
    appendSetCookie(response, flags.join('; '));
}

function appendSetCookie(response: ServerResponse, cookie: string): void {
    const existing = response.getHeader('Set-Cookie');
    if (Array.isArray(existing)) {
        response.setHeader('Set-Cookie', [...existing, cookie]);
    } else if (typeof existing === 'string') {
        response.setHeader('Set-Cookie', [existing, cookie]);
    } else {
        response.setHeader('Set-Cookie', cookie);
    }
}

function writeJson(response: ServerResponse, status: number, body: unknown, origin: string | null, options: AuthHttpOptions): void {
    const payload = JSON.stringify(body);
    writeCorsHeaders(response, origin, options);
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    response.end(payload);
}

function writeCorsPreflight(response: ServerResponse, origin: string | null, options: AuthHttpOptions): void {
    writeCorsHeaders(response, origin, options);
    response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
        'Access-Control-Max-Age': '600',
    });
    response.end();
}

function writeCorsHeaders(response: ServerResponse, origin: string | null, options: AuthHttpOptions): void {
    if (origin && isAllowedOrigin(origin, options.allowedOrigins)) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
}

function isAllowedOrigin(origin: string | null, allowedOrigins: readonly string[]): boolean {
    if (!origin) return true;
    return allowedOrigins.includes(origin);
}

function userAgent(context: HandlerContext): string | null {
    const value = context.request.headers['user-agent'];
    return typeof value === 'string' ? value.slice(0, 500) : null;
}

function ipHash(context: HandlerContext, trustProxy: boolean): string {
    const ip = resolveClientIp(context.request, trustProxy);
    return createHash('sha256').update(ip).digest('base64url');
}

function getRefreshTtlMs(options: AuthHttpOptions): number {
    return options.refreshTtlMs ?? DEFAULT_REFRESH_TTL_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

class HttpError extends Error {
    public constructor(public readonly status: number, public readonly code: string, message: string) {
        super(message);
    }
}
