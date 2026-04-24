/**
 * CombatSFX — 8-bit style combat sound effects using Web Audio API.
 * No external files needed — all sounds are generated programmatically.
 */

type WaveType = OscillatorType;

interface ToneStep {
    freq: number;
    duration: number;
    wave?: WaveType;
    gain?: number;
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/** Play a sequence of tones — the core of all SFX */
function playTones(steps: ToneStep[], masterGain = 0.15): void {
    try {
        const ctx = getCtx();
        const gain = ctx.createGain();
        gain.gain.value = masterGain;
        gain.connect(ctx.destination);

        let t = ctx.currentTime;
        for (const step of steps) {
            const osc = ctx.createOscillator();
            const stepGain = ctx.createGain();
            osc.type = step.wave || 'square';
            osc.frequency.value = step.freq;
            stepGain.gain.value = step.gain ?? 1.0;
            // Quick fade out to avoid clicks
            stepGain.gain.setValueAtTime(step.gain ?? 1.0, t);
            stepGain.gain.exponentialRampToValueAtTime(0.01, t + step.duration - 0.005);

            osc.connect(stepGain);
            stepGain.connect(gain);
            osc.start(t);
            osc.stop(t + step.duration);
            t += step.duration;
        }
    } catch { /* silently fail if audio unavailable */ }
}

/** Add white noise burst (for impact sounds) */
function playNoise(duration: number, gain = 0.1): void {
    try {
        const ctx = getCtx();
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // fade out
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const g = ctx.createGain();
        g.gain.value = gain;
        source.connect(g);
        g.connect(ctx.destination);
        source.start();
    } catch { /* silent */ }
}

// ═══════════════════════════════════════════════════════════
//  Basic Combat Sounds
// ═══════════════════════════════════════════════════════════

export function sfxHit(): void {
    playNoise(0.08, 0.12);
    playTones([
        { freq: 200, duration: 0.04, wave: 'sawtooth' },
        { freq: 120, duration: 0.06, wave: 'square' },
    ], 0.12);
}

export function sfxCritical(): void {
    playNoise(0.1, 0.15);
    playTones([
        { freq: 300, duration: 0.03, wave: 'sawtooth' },
        { freq: 500, duration: 0.04, wave: 'square' },
        { freq: 250, duration: 0.05, wave: 'sawtooth' },
        { freq: 150, duration: 0.08, wave: 'square' },
    ], 0.15);
}

export function sfxMiss(): void {
    playTones([
        { freq: 400, duration: 0.06, wave: 'sine', gain: 0.5 },
        { freq: 200, duration: 0.1, wave: 'sine', gain: 0.3 },
    ], 0.08);
}

export function sfxHeal(): void {
    playTones([
        { freq: 523, duration: 0.08, wave: 'sine' },
        { freq: 659, duration: 0.08, wave: 'sine' },
        { freq: 784, duration: 0.12, wave: 'sine' },
    ], 0.12);
}

export function sfxLevelUp(): void {
    playTones([
        { freq: 523, duration: 0.08, wave: 'square' },
        { freq: 659, duration: 0.08, wave: 'square' },
        { freq: 784, duration: 0.08, wave: 'square' },
        { freq: 1047, duration: 0.15, wave: 'square' },
    ], 0.12);
}

export function sfxKill(): void {
    playNoise(0.06, 0.1);
    playTones([
        { freq: 300, duration: 0.05, wave: 'sawtooth' },
        { freq: 200, duration: 0.06, wave: 'sawtooth' },
        { freq: 100, duration: 0.12, wave: 'square', gain: 0.6 },
    ], 0.12);
}

export function sfxPromotion(): void {
    playTones([
        { freq: 392, duration: 0.1, wave: 'square' },
        { freq: 523, duration: 0.1, wave: 'square' },
        { freq: 659, duration: 0.1, wave: 'square' },
        { freq: 784, duration: 0.1, wave: 'square' },
        { freq: 1047, duration: 0.2, wave: 'square' },
    ], 0.14);
}

// ═══════════════════════════════════════════════════════════
//  Spell Element Sounds
// ═══════════════════════════════════════════════════════════

export function sfxFire(): void {
    playNoise(0.15, 0.1);
    playTones([
        { freq: 150, duration: 0.05, wave: 'sawtooth' },
        { freq: 300, duration: 0.06, wave: 'sawtooth' },
        { freq: 200, duration: 0.04, wave: 'sawtooth' },
        { freq: 400, duration: 0.08, wave: 'sawtooth', gain: 0.7 },
    ], 0.13);
}

export function sfxIce(): void {
    playTones([
        { freq: 1200, duration: 0.03, wave: 'sine', gain: 0.5 },
        { freq: 800, duration: 0.04, wave: 'sine', gain: 0.7 },
        { freq: 500, duration: 0.06, wave: 'triangle' },
        { freq: 300, duration: 0.1, wave: 'sine', gain: 0.4 },
    ], 0.1);
    playNoise(0.08, 0.06);
}

export function sfxThunder(): void {
    playNoise(0.12, 0.18);
    playTones([
        { freq: 80, duration: 0.03, wave: 'sawtooth' },
        { freq: 600, duration: 0.02, wave: 'square' },
        { freq: 100, duration: 0.08, wave: 'sawtooth', gain: 0.8 },
        { freq: 60, duration: 0.12, wave: 'sawtooth', gain: 0.5 },
    ], 0.15);
}

export function sfxWind(): void {
    playTones([
        { freq: 400, duration: 0.06, wave: 'sine', gain: 0.4 },
        { freq: 600, duration: 0.05, wave: 'sine', gain: 0.6 },
        { freq: 500, duration: 0.04, wave: 'sine', gain: 0.5 },
        { freq: 700, duration: 0.06, wave: 'sine', gain: 0.3 },
    ], 0.1);
    playNoise(0.1, 0.05);
}

export function sfxEarth(): void {
    playNoise(0.1, 0.12);
    playTones([
        { freq: 80, duration: 0.08, wave: 'sawtooth' },
        { freq: 60, duration: 0.1, wave: 'square', gain: 0.8 },
        { freq: 100, duration: 0.06, wave: 'sawtooth', gain: 0.5 },
    ], 0.14);
}

export function sfxHoly(): void {
    playTones([
        { freq: 784, duration: 0.06, wave: 'sine' },
        { freq: 988, duration: 0.06, wave: 'sine' },
        { freq: 1175, duration: 0.1, wave: 'sine', gain: 0.7 },
    ], 0.1);
}

export function sfxDark(): void {
    playTones([
        { freq: 150, duration: 0.08, wave: 'sawtooth', gain: 0.8 },
        { freq: 100, duration: 0.1, wave: 'sawtooth', gain: 0.6 },
        { freq: 80, duration: 0.12, wave: 'square', gain: 0.4 },
    ], 0.12);
}

export function sfxBuff(): void {
    playTones([
        { freq: 440, duration: 0.06, wave: 'triangle' },
        { freq: 554, duration: 0.06, wave: 'triangle' },
        { freq: 659, duration: 0.1, wave: 'triangle', gain: 0.7 },
    ], 0.1);
}

export function sfxDebuff(): void {
    playTones([
        { freq: 400, duration: 0.06, wave: 'square', gain: 0.6 },
        { freq: 300, duration: 0.08, wave: 'square', gain: 0.5 },
        { freq: 200, duration: 0.1, wave: 'square', gain: 0.3 },
    ], 0.1);
}

export function sfxMeteor(): void {
    // Dramatic: falling whistle + explosion
    playTones([
        { freq: 1000, duration: 0.05, wave: 'sine', gain: 0.4 },
        { freq: 600, duration: 0.05, wave: 'sine', gain: 0.5 },
        { freq: 300, duration: 0.05, wave: 'sine', gain: 0.6 },
        { freq: 150, duration: 0.04, wave: 'sawtooth' },
    ], 0.12);
    setTimeout(() => {
        playNoise(0.2, 0.2);
        playTones([
            { freq: 80, duration: 0.1, wave: 'sawtooth' },
            { freq: 60, duration: 0.15, wave: 'square', gain: 0.6 },
        ], 0.16);
    }, 180);
}

export function sfxDrain(): void {
    playTones([
        { freq: 300, duration: 0.05, wave: 'sawtooth', gain: 0.5 },
        { freq: 400, duration: 0.05, wave: 'sawtooth', gain: 0.6 },
        { freq: 500, duration: 0.05, wave: 'sine', gain: 0.4 },
        { freq: 600, duration: 0.08, wave: 'sine', gain: 0.3 },
    ], 0.1);
}

// ═══════════════════════════════════════════════════════════
//  Convenience: play SFX by element name
// ═══════════════════════════════════════════════════════════

export function sfxByElement(element: string): void {
    switch (element) {
        case 'fire': sfxFire(); break;
        case 'ice': sfxIce(); break;
        case 'lightning': sfxThunder(); break;
        case 'wind': sfxWind(); break;
        case 'earth': sfxEarth(); break;
        case 'holy': sfxHoly(); break;
        case 'dark': sfxDark(); break;
        default: sfxHit(); break;
    }
}
