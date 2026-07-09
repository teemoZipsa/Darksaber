import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../../server/OriginPolicy';
import { createWorldServerOriginPolicy } from '../../server/WorldServerOriginPolicy';

test('world server origin policy uses runtime missing-Origin setting', () => {
    const browserOnlyPolicy = createWorldServerOriginPolicy({
        allowedOrigins: ['https://game.example'],
        allowMissingOrigin: false,
    });

    assert.equal(isAllowedOrigin('https://game.example', browserOnlyPolicy), true);
    assert.equal(isAllowedOrigin('https://evil.example', browserOnlyPolicy), false);
    assert.equal(isAllowedOrigin(null, browserOnlyPolicy), false);

    const nonBrowserPolicy = createWorldServerOriginPolicy({
        allowedOrigins: ['https://game.example'],
        allowMissingOrigin: true,
    });

    assert.equal(isAllowedOrigin(null, nonBrowserPolicy), true);
});
