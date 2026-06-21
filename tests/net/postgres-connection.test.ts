import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostgresConnectionString } from '../../server/PostgresConnection';

test('postgres connection strings pin legacy ssl modes to verify-full', () => {
    const normalized = normalizePostgresConnectionString('postgres://user:pass@example.test/db?sslmode=require&channel_binding=require');
    const url = new URL(normalized);

    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
});

test('postgres connection strings keep explicit ssl modes that do not warn', () => {
    assert.equal(
        normalizePostgresConnectionString('postgresql://user:pass@example.test/db?sslmode=verify-full'),
        'postgresql://user:pass@example.test/db?sslmode=verify-full',
    );
    assert.equal(
        normalizePostgresConnectionString('postgresql://user:pass@example.test/db?sslmode=no-verify'),
        'postgresql://user:pass@example.test/db?sslmode=no-verify',
    );
});

test('postgres connection strings ignore non-postgres values', () => {
    assert.equal(normalizePostgresConnectionString('not a url'), 'not a url');
    assert.equal(normalizePostgresConnectionString('mysql://user:pass@example.test/db?sslmode=require'), 'mysql://user:pass@example.test/db?sslmode=require');
});
