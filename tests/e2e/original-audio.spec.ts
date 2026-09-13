import { expect, test } from '@playwright/test';

test('original and community audio decodes, unlocks on touch and survives mute and scene changes', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const moduleUrls = { audio: '', settings: '' };
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        if (response.url().includes('/assets/sounds/') && !response.ok()) errors.push(response.url());
        if (/\/src\/engine\/AudioManager\.ts(?:\?|$)/.test(response.url())) moduleUrls.audio = response.url();
        if (/\/src\/engine\/SettingsManager\.ts(?:\?|$)/.test(response.url())) moduleUrls.settings = response.url();
    });
    await page.goto('/?devStart=town&devLocal=1');
    await page.getByRole('tab', { name: /무기점|Weapon Shop/ }).click();
    // Import the app's exact Vite URL, including its HMR version. A bare path
    // after an edit can create a second singleton that the game never uses.
    expect(moduleUrls.audio).not.toBe('');
    await page.evaluate(async (urls) => {
        (window as any).__audioModule = await import(urls.audio);
        (window as any).__audioSettings = (await import(urls.settings)).SettingsManager;
    }, moduleUrls);
    const readAudio = () => page.evaluate(() => {
        const { AudioManager: manager } = (window as any).__audioModule;
        return { state: manager.ctx?.state, key: manager.currentBgmKey };
    });
    await expect.poll(readAudio).toEqual({ state: 'running', key: 'bgm.town' });
    const decoded = await page.evaluate(async () => {
        const { AudioManager: manager, AUDIO_CATALOG: catalog } = (window as any).__audioModule;
        const keys = Object.keys(catalog).filter((key) => key.startsWith('sfx.original.') || key.startsWith('bgm.') || catalog[key].src.includes('/community/'));
        await manager.preload(keys);
        return keys.map((key) => {
            const buffer = manager.buffers.get(manager.bufferKey(key))?.buffer;
            const data = buffer?.getChannelData(0);
            let peak = 0;
            let power = 0;
            let samples = 0;
            if (data) for (let i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 8192))) {
                peak = Math.max(peak, Math.abs(data[i]));
                power += data[i] ** 2;
                samples++;
            }
            return { key, duration: buffer?.duration ?? 0, peak, rmsDb: 10 * Math.log10(power / Math.max(1, samples) + 1e-12) };
        });
    });
    for (const track of decoded) {
        expect(track.duration, track.key).toBeGreaterThan(0.1);
        expect(track.peak, track.key).toBeGreaterThan(0.0001);
    }
    await testInfo.attach('decoded-audio', { body: JSON.stringify(decoded, null, 2), contentType: 'application/json' });
    // Supplementary music should stay close to the recovered town track's level.
    const townLevel = decoded.find((track) => track.key === 'bgm.town')!.rmsDb;
    for (const track of decoded.filter((track) => ['bgm.town.village', 'bgm.town.port', 'bgm.desert', 'bgm.mines'].includes(track.key))) {
        expect(Math.abs(track.rmsDb - townLevel), track.key).toBeLessThan(5);
    }
    // Listen to the actual mixed signal, not just a requested track key.
    await page.evaluate(() => {
        const { AudioManager: manager } = (window as any).__audioModule;
        const analyser = manager.ctx.createAnalyser();
        manager.bgmGain.connect(analyser);
        (window as any).__audioProbe = analyser;
    });
    const signal = () => page.evaluate(() => {
        const analyser = (window as any).__audioProbe as AnalyserNode;
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.max(...samples.map(Math.abs));
    });
    await expect.poll(signal).toBeGreaterThan(0.0001);
    await page.evaluate(() => {
        (window as any).__audioSettings.setMuteBGM(true);
    });
    await expect.poll(signal).toBeLessThan(0.00001);
    await page.evaluate(() => {
        (window as any).__audioSettings.setMuteBGM(false);
    });
    await expect.poll(signal).toBeGreaterThan(0.0001);
    await page.evaluate(() => { (window as any).__audioSettings.setMuteBGM(true); });
    await page.getByRole('button', { name: /필드로 나가기|Leave for the field/ }).click({ timeout: 10_000 });
    await expect.poll(readAudio).toEqual({ state: 'running', key: 'bgm.world' });
    await expect.poll(signal).toBeLessThan(0.00001);
    await page.evaluate(() => { (window as any).__audioSettings.setMuteBGM(false); });
    await expect.poll(signal).toBeGreaterThan(0.0001);
    // Drive real town-entry state, so a correct catalog alone cannot pass.
    for (const [townId, key] of [
        ['w_forest_village', 'bgm.town.village'],
        ['s_coast_town', 'bgm.town.port'],
        ['nw_desert_city', 'bgm.town.market'],
    ]) {
        await page.evaluate((id) => {
            const engine = (window as any).__gm.worldEngine;
            engine.openTown(engine.worldMap.getTowns().find((town: any) => town.id === id));
        }, townId);
        await expect.poll(readAudio).toEqual({ state: 'running', key });
        await expect.poll(signal).toBeGreaterThan(0.0001);
    }
    expect(errors).toEqual([]);
});
