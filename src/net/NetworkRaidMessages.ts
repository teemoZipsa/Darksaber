import { formatT, t } from '../i18n/LanguageManager';
import { WorldServerError, type NetworkRaidStatus } from './NetworkRaidClient';
import type { WorldErrorMessage } from './WorldProtocol';

export function getNetworkStatusLabel(status: NetworkRaidStatus): string {
    switch (status) {
        case 'idle':
            return t('mp.idle');
        case 'connecting':
            return t('mp.connecting');
        case 'connected':
            return t('mp.connected');
        case 'reconnecting':
            return t('mp.reconnecting');
        case 'disconnected':
            return t('mp.disconnected');
    }
}

export function formatNetworkStatusLog(status: NetworkRaidStatus): string {
    return formatT('mp.statusLog', { status: getNetworkStatusLabel(status) });
}

export function formatReconnectRestoredLog(): string {
    return t('mp.reconnectRestored');
}

export function getWorldServerErrorMessage(error: unknown): string {
    if (error instanceof WorldServerError) return getWorldServerErrorCodeMessage(error.code, error.message);
    if (isWorldErrorMessageLike(error)) return getWorldServerErrorCodeMessage(error.code, error.message);
    if (error instanceof Error) return error.message;
    return t('mp.error.unknown');
}

export function formatWorldServerErrorLog(error: WorldErrorMessage): string {
    return formatT('mp.errorLog', { message: getWorldServerErrorMessage(error) });
}

export function formatNetworkDeployFailure(error: unknown): string {
    return formatT('mp.deployFailed', { message: getWorldServerErrorMessage(error) });
}

function getWorldServerErrorCodeMessage(code: string, message: string): string {
    switch (code) {
        case 'AUTH_FAILED':
        case 'AUTH_REVOKED':
            return t('mp.error.authFailed');
        case 'RESUME_FAILED':
        case 'SESSION_NOT_FOUND':
            return t('mp.error.resumeFailed');
        case 'VERSION_MISMATCH':
            return t('mp.error.versionMismatch');
        case 'ORIGIN_FORBIDDEN':
        case 'WSS_REQUIRED':
            return t('mp.error.transport');
        case 'PAYLOAD_TOO_LARGE':
        case 'RATE_LIMITED':
            return t('mp.error.rateLimited');
        case 'BAD_JSON':
        case 'BAD_MESSAGE':
            return t('mp.error.badMessage');
        case 'SOCKET_NOT_OPEN':
            return t('mp.error.socketNotOpen');
        case 'CHARACTER_FORBIDDEN':
            return t('mp.error.characterForbidden');
        case 'ALREADY_JOINED':
            return t('mp.error.alreadyJoined');
        case 'NOT_JOINED':
            return t('mp.error.notJoined');
        case 'SERVER_ERROR':
            return t('mp.error.server');
        default:
            return formatT('mp.error.generic', { code, message: message || t('mp.error.unknown') });
    }
}

function isWorldErrorMessageLike(value: unknown): value is Pick<WorldErrorMessage, 'code' | 'message'> {
    return typeof value === 'object'
        && value !== null
        && 'code' in value
        && 'message' in value
        && typeof (value as { code?: unknown }).code === 'string'
        && typeof (value as { message?: unknown }).message === 'string';
}
