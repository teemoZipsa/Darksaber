import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, AudioManagerClass } from '../../src/engine/AudioManager';
import { GameMusic } from '../../src/engine/GameMusic';
import { SettingsManager } from '../../src/engine/SettingsManager';
import { getSkill } from '../../src/data/SkillDB';
import { getSkillCastSfx } from '../../src/engine/world/WorldMagicController';

function mixer() {
    const sources: any[] = [];
    const gains: any[] = [];
    const node = () => ({ connect() {}, disconnect() {} });
    const ctx = {
        currentTime: 0, state: 'running',
        createGain() {
            const gain = { ...node(), gain: { value: 1, cancelScheduledValues() {},
                setValueAtTime(value: number) { this.value = value; },
                linearRampToValueAtTime(value: number) { this.value = value; } } };
            gains.push(gain);
            return gain;
        },
        createBufferSource() {
            const source = { ...node(), buffer: null, loop: false, started: false, stopped: false,
                playbackRate: { value: 1 }, start() { this.started = true; }, stop() { this.stopped = true; } };
            sources.push(source);
            return source;
        },
    };
    const manager = new AudioManagerClass();
    const runtime = manager as any;
    runtime.ctx = ctx;
    runtime.bgmGain = ctx.createGain();
    runtime.sfxGain = ctx.createGain();
    runtime.uiGain = ctx.createGain();
    const pending = new Map<string, () => void>();
    runtime.loadBuffer = (key: string) => new Promise<void>((resolve) => {
        pending.set(key, () => {
            runtime.buffers.set(runtime.bufferKey(key), { buffer: { key }, settled: true });
            resolve();
        });
    });
    const finish = async (key: string) => { pending.get(key)!(); await Promise.resolve(); };
    return { manager, runtime, sources, gains, finish };
}

test('late music decode cannot replace the latest scene and stop cancels pending music', async () => {
    const { manager, runtime, sources, finish } = mixer();
    manager.playBgm('bgm.world');
    manager.playBgm('bgm.town');
    await finish('bgm.town');
    await finish('bgm.world');
    assert.equal(runtime.currentBgmKey, 'bgm.town');
    assert.equal(sources.length, 1);
    manager.playBgm('bgm.boss');
    manager.stopBgm(0);
    await finish('bgm.boss');
    assert.equal(sources.length, 1);
    assert.equal(sources[0].stopped, true);
});

test('muted music retains track gain so unmuting the channel restores it', async (context) => {
    context.mock.method(SettingsManager, 'getMuteBGM', () => true);
    const { manager, runtime, finish } = mixer();
    manager.playBgm('bgm.world', { volume: 0.7 });
    await finish('bgm.world');
    assert.equal(runtime.currentBgmGain.gain.value, 0.7);
});

test('byte-identical episode aliases reuse the playing track without restarting', async () => {
    const { manager, runtime, sources, finish } = mixer();
    manager.playBgm('bgm.story.episode01');
    await finish('bgm.story.episode01');
    manager.playBgm('bgm.story.episode11');
    assert.equal(runtime.currentBgmKey, 'bgm.story.episode11');
    assert.equal(sources.length, 1);
    assert.equal(sources[0].stopped, false);
});

test('overlapping aliases of one effect produce only one voice', async (context) => {
    context.mock.method(SettingsManager, 'getMuteSFX', () => false);
    const { manager, sources, finish } = mixer();
    manager.playSfx('sfx.coin');
    manager.playSfx('sfx.loot_pickup');
    await finish('sfx.coin');
    assert.equal(sources.length, 1);
});

test('effects triggered before audio unlock do not burst out on the first gesture', async (context) => {
    context.mock.method(SettingsManager, 'getMuteSFX', () => false);
    const { manager, runtime, sources, finish } = mixer();
    runtime.ctx.state = 'suspended';
    manager.playSfx('sfx.coin');
    await finish('sfx.coin');
    assert.equal(sources.length, 0);
});

test('brief terrain changes keep the current music while sustained scene changes crossfade', (context) => {
    const calls: string[] = [];
    context.mock.method(AudioManager, 'playBgm', (key: string) => calls.push(key));
    const music = new GameMusic();
    music.update('bgm.world', 0);
    music.update('bgm.forest', 100);
    music.update('bgm.world', 800);
    music.update('bgm.raid', 1000);
    music.update('bgm.raid', 3500);
    music.update('bgm.town', 3600);
    assert.deepEqual(calls, ['bgm.world', 'bgm.raid', 'bgm.town']);
});

test('original spells retain distinctive recovered effects instead of generic element sounds', () => {
    const cases = { og_blizzard: 'sfx.magic.ice_burst', og_meteor: 'sfx.magic.atomic_wave',
        og_quick: 'sfx.magic.quick_poison', og_poison: 'sfx.magic.quick_poison',
        og_resist: 'sfx.magic.resist', og_mute: 'sfx.magic.mute' };
    for (const [id, sound] of Object.entries(cases)) assert.equal(getSkillCastSfx(getSkill(id)!), sound);
});
