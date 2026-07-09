import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Render deployment config matches the documented auto-deploy mode', () => {
    const renderYaml = readFileSync('render.yaml', 'utf8');
    const deploymentDocs = readFileSync('docs/deployment.md', 'utf8');

    assert.match(renderYaml, /autoDeployTrigger:\s*['"]commit['"]/);
    assert.match(deploymentDocs, /autoDeployTrigger:\s*'commit'/);
});

test('production deployment docs require durable database-backed auth', () => {
    const deploymentDocs = readFileSync('docs/deployment.md', 'utf8');
    const renderYaml = readFileSync('render.yaml', 'utf8');

    assert.match(deploymentDocs, /DATABASE_URL=<Neon pooled connection string>/);
    assert.match(deploymentDocs, /\/healthz` returns `authStore: "postgres"`/);
    assert.match(deploymentDocs, /AUTH_ALLOW_MISSING_ORIGIN=0/);
    assert.match(deploymentDocs, /without paths,\s*queries, or fragments/);
    assert.match(renderYaml, /key: AUTH_ALLOW_MISSING_ORIGIN\s*\r?\n\s*value: "0"/);
});

test('deployment docs keep single-shard world routing as an explicit operating contract', () => {
    const deploymentDocs = readFileSync('docs/deployment.md', 'utf8');
    const architectureDocs = readFileSync('docs/ARCHITECTURE.md', 'utf8');
    const renderYaml = readFileSync('render.yaml', 'utf8');

    assert.match(deploymentDocs, /Keep `WORLD_SHARD_COUNT=1` in production/);
    assert.match(deploymentDocs, /intentional operating\s+contract/);
    assert.match(deploymentDocs, /does not make `WORLD_SHARD_COUNT > 1` supported yet/);
    assert.match(architectureDocs, /`WORLD_SHARD_COUNT=1` is the current supported operating contract/);
    assert.match(renderYaml, /key: WORLD_SHARD_COUNT\s*\r?\n\s*value: "1"/);
});
