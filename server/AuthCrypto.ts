import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export interface JwtOptions {
    secret: string;
    issuer: string;
    audience: string;
    ttlSeconds: number;
}

export interface AccessTokenClaims {
    accountId: string;
    sessionId: string;
    expiresAt: number;
}

interface JwtPayload {
    iss: string;
    aud: string;
    sub: string;
    session_id: string;
    iat: number;
    nbf: number;
    exp: number;
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const EPHEMERAL_DEV_REFRESH_TOKEN_HASH_SECRET = randomBytes(32).toString('base64url');

export async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
    });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
        return await argon2.verify(passwordHash, password);
    } catch {
        return false;
    }
}

export function createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(refreshToken: string): string {
    return createHmac('sha256', getRefreshTokenHashSecret())
        .update(refreshToken)
        .digest('base64url');
}

export function createAccessToken(accountId: string, sessionId: string, options: JwtOptions, nowMs: number = Date.now()): string {
    const now = Math.floor(nowMs / 1000);
    const payload: JwtPayload = {
        iss: options.issuer,
        aud: options.audience,
        sub: accountId,
        session_id: sessionId,
        iat: now,
        nbf: now,
        exp: now + options.ttlSeconds,
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = encodeBase64UrlJson(header);
    const encodedPayload = encodeBase64UrlJson(payload);
    const signature = signJwt(`${encodedHeader}.${encodedPayload}`, options.secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string, options: JwtOptions, nowMs: number = Date.now()): AccessTokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    if (!parts.every((part) => BASE64URL_RE.test(part))) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = signJwt(`${encodedHeader}.${encodedPayload}`, options.secret);
    if (!safeEqual(signature, expectedSignature)) return null;

    const header = decodeBase64UrlJson(encodedHeader);
    if (!isRecord(header) || header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const payload = decodeBase64UrlJson(encodedPayload);
    if (!isJwtPayload(payload)) return null;
    if (payload.iss !== options.issuer || payload.aud !== options.audience) return null;

    const now = Math.floor(nowMs / 1000);
    if (payload.nbf > now || payload.exp <= now) return null;
    return {
        accountId: payload.sub,
        sessionId: payload.session_id,
        expiresAt: payload.exp,
    };
}

function encodeBase64UrlJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeBase64UrlJson(value: string): unknown {
    try {
        return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    } catch {
        return null;
    }
}

function signJwt(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function getRefreshTokenHashSecret(): string {
    const secret = process.env.AUTH_REFRESH_TOKEN_HASH_SECRET;
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('AUTH_REFRESH_TOKEN_HASH_SECRET is required when NODE_ENV=production.');
    }
    return EPHEMERAL_DEV_REFRESH_TOKEN_HASH_SECRET;
}

function safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) return false;
    return timingSafeEqual(aBuffer, bBuffer);
}

function isJwtPayload(value: unknown): value is JwtPayload {
    if (!isRecord(value)) return false;
    return typeof value.iss === 'string'
        && typeof value.aud === 'string'
        && typeof value.sub === 'string'
        && typeof value.session_id === 'string'
        && typeof value.iat === 'number'
        && typeof value.nbf === 'number'
        && typeof value.exp === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
