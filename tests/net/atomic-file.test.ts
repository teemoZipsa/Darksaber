import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomically } from '../../server/AtomicFile';

test('atomic file write replaces the target and preserves a backup of the previous contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-atomic-file-'));
    try {
        const persistPath = join(dir, 'state.json');
        const backupPath = `${persistPath}.bak`;

        writeFileAtomically(persistPath, '{"version":1}');
        writeFileAtomically(persistPath, '{"version":2}', { backupPath });

        assert.equal(readFileSync(persistPath, 'utf8'), '{"version":2}');
        assert.equal(readFileSync(backupPath, 'utf8'), '{"version":1}');
        assert.equal(existsSync(backupPath), true);
        assert.equal(readdirSync(dir).some((name) => name.includes('.tmp-')), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
