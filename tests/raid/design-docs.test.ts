import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ALL_BASE_CLASS_LINES } from '../../src/data/ClassTree';

test('GDD states the current implemented product contract', () => {
    const gdd = readFileSync('docs/GDD.md', 'utf8');

    assert.equal(ALL_BASE_CLASS_LINES.length, 12);
    assert.match(gdd, /As-built baseline.*2026-07-10/);
    assert.match(gdd, /기본 직업 계열은 12개/);
    assert.match(gdd, /메인 시나리오 1~31화/);
    assert.match(gdd, /`WORLD_SHARD_COUNT=1`/);
    assert.match(gdd, /다중 shard 자동 배치.*비범위|현재 구현됐다고 간주하지 않는 항목:[\s\S]*다중 shard 자동 배치/);
    assert.match(gdd, /공개 상용 배포 전에는[\s\S]*권리를 확인/);
    assert.doesNotMatch(gdd, /STR \(Strength\)|Fighter, Mage, Thief, Priest|MMORPG$/m);
});

test('architecture describes viewport-driven chunks and the current server', () => {
    const architecture = readFileSync('docs/ARCHITECTURE.md', 'utf8');

    assert.match(architecture, /32x32-tile chunks/);
    assert.match(architecture, /not fixed to exactly `3x3`/);
    assert.match(architecture, /Server Architecture \(Current\)/);
    assert.match(architecture, /Chat is not currently implemented/);
    assert.doesNotMatch(architecture, /Server Architecture \(Phase 4\)|keeps exactly a `3x3`/);
});

test('source-of-truth paths referenced by the GDD exist', () => {
    const gdd = readFileSync('docs/GDD.md', 'utf8');
    const paths = [...gdd.matchAll(/`((?:src|server|docs)\/[^`\s]+)`/g)].map((match) => match[1]!);

    assert.ok(paths.length >= 12);
    for (const path of paths) assert.equal(existsSync(path), true, `missing GDD source-of-truth path: ${path}`);
});
