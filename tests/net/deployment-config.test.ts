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

    assert.match(deploymentDocs, /DATABASE_URL=<Neon pooled connection string>/);
    assert.match(deploymentDocs, /\/healthz` returns `authStore: "postgres"`/);
});
