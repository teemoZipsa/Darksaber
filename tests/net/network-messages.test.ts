import test from 'node:test';
import assert from 'node:assert/strict';
import { i18n, type Language } from '../../src/i18n/LanguageManager';
import { NetworkRaidState } from '../../src/engine/world/NetworkRaidState';
import {
    formatNetworkDeployFailure,
    formatNetworkStatusLog,
    formatReconnectRestoredLog,
    formatWorldServerErrorLog,
    getWorldServerErrorMessage,
} from '../../src/net/NetworkRaidMessages';
import { WorldServerError } from '../../src/net/NetworkRaidClient';

test('network status logs use localized labels', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.equal(formatNetworkStatusLog('connecting'), '네트워크 상태: 접속 중...');
        assert.equal(formatNetworkStatusLog('reconnecting'), '네트워크 상태: 재접속 중...');
        assert.equal(formatReconnectRestoredLog(), '서버 재접속이 복구되었습니다.');

        i18n.lang = 'en';
        assert.equal(formatNetworkStatusLog('connected'), 'Network status: Connected');
        assert.equal(formatReconnectRestoredLog(), 'World server connection restored.');
    } finally {
        i18n.lang = previousLang;
    }
});

test('network raid state consumes reconnect status logs', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'en';
        const state = new NetworkRaidState();

        assert.equal(state.consumeStatusLog('idle'), null);
        assert.equal(state.consumeStatusLog('reconnecting'), 'Network status: Reconnecting...');
        assert.equal(state.consumeStatusLog('connected'), 'World server connection restored.');
        assert.equal(state.consumeStatusLog('connected'), 'Network status: Connected');
    } finally {
        i18n.lang = previousLang;
    }
});

test('world server errors map to player-facing messages', () => {
    const previousLang: Language = i18n.lang;
    try {
        i18n.lang = 'ko';
        assert.equal(
            getWorldServerErrorMessage(new WorldServerError('AUTH_FAILED', 'Access token expired.')),
            '인증이 만료되었습니다. 다시 로그인하거나 재시도해 주세요.'
        );
        assert.equal(
            formatWorldServerErrorLog({ type: 'ERROR', code: 'VERSION_MISMATCH', message: 'bad client' }),
            '서버 오류: 클라이언트와 서버 버전이 다릅니다. 새로고침 후 다시 시도해 주세요.'
        );
        assert.equal(
            formatNetworkDeployFailure(new WorldServerError('RESUME_FAILED', 'stale')),
            '월드 서버 접속 실패: 이전 원정 복구 정보가 만료되었습니다. 새 원정으로 다시 시작해 주세요.'
        );
        assert.equal(
            formatNetworkDeployFailure(new WorldServerError('RESUME_RECOVERED', 'saved')),
            '월드 서버 접속 실패: 서버 재시작 후 원정 획득품 복구 저장이 적용되었습니다. 새 원정으로 다시 시작해 주세요.'
        );
        assert.equal(
            getWorldServerErrorMessage({ code: 'CUSTOM_CODE', message: 'Custom detail' }),
            'Custom detail (CUSTOM_CODE)'
        );

        i18n.lang = 'en';
        assert.equal(
            getWorldServerErrorMessage(new WorldServerError('SOCKET_NOT_OPEN', 'not open')),
            'The world server connection is not open yet.'
        );
    } finally {
        i18n.lang = previousLang;
    }
});
