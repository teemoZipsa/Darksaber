interface MidiTempoEvent {
    tick: number;
    usPerQuarter: number;
}

type MidiEvent =
    | { type: 'noteOn'; tick: number; order: number; channel: number; note: number; velocity: number }
    | { type: 'noteOff'; tick: number; order: number; channel: number; note: number }
    | { type: 'program'; tick: number; order: number; channel: number; program: number }
    | { type: 'control'; tick: number; order: number; channel: number; controller: number; value: number };

interface MidiSequence {
    ticksPerQuarter: number;
    tempos: MidiTempoEvent[];
    events: MidiEvent[];
    maxTick: number;
}

interface MidiNote {
    channel: number;
    note: number;
    velocity: number;
    program: number;
    volume: number;
    startSec: number;
    endSec: number;
}

class MidiReader {
    private readonly view: DataView;
    public pos = 0;

    constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
    }

    public readU8(): number {
        return this.view.getUint8(this.pos++);
    }

    public readU16(): number {
        const value = this.view.getUint16(this.pos, false);
        this.pos += 2;
        return value;
    }

    public readU32(): number {
        const value = this.view.getUint32(this.pos, false);
        this.pos += 4;
        return value;
    }

    public readText(length: number): string {
        let text = '';
        for (let i = 0; i < length; i++) text += String.fromCharCode(this.readU8());
        return text;
    }

    public readVarLen(): number {
        let value = 0;
        for (let i = 0; i < 4; i++) {
            const byte = this.readU8();
            value = (value << 7) | (byte & 0x7f);
            if ((byte & 0x80) === 0) break;
        }
        return value;
    }

    public skip(length: number): void {
        this.pos += length;
    }

    public seek(pos: number): void {
        this.pos = pos;
    }
}

const DEFAULT_TEMPO_US_PER_QUARTER = 500_000;
const DRUM_CHANNEL = 9;

export async function renderMidiToAudioBuffer(context: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    const sequence = parseMidiSequence(data);
    const notes = buildNotes(sequence);
    if (notes.length === 0) throw new Error('MIDI contains no notes');

    const sampleRate = context.sampleRate || 44_100;
    const durationSec = Math.max(0.5, ...notes.map((note) => note.endSec)) + 0.3;
    const frameCount = Math.ceil(durationSec * sampleRate);
    const offline = createOfflineContext(2, frameCount, sampleRate);
    const master = offline.createGain();
    master.gain.value = 0.85;

    const compressor = offline.createDynamicsCompressor();
    master.connect(compressor);
    compressor.connect(offline.destination);

    for (const note of notes.slice(0, 5000)) {
        scheduleNote(offline, master, note);
    }

    return offline.startRendering();
}

function createOfflineContext(channels: number, frameCount: number, sampleRate: number): OfflineAudioContext {
    const OfflineCtor = globalThis.OfflineAudioContext
        ?? (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtor) throw new Error('OfflineAudioContext is unavailable');
    return new OfflineCtor(channels, frameCount, sampleRate);
}

function parseMidiSequence(data: ArrayBuffer): MidiSequence {
    const reader = new MidiReader(data);
    if (reader.readText(4) !== 'MThd') throw new Error('Invalid MIDI header');
    const headerLength = reader.readU32();
    reader.readU16(); // format
    const trackCount = reader.readU16();
    const division = reader.readU16();
    if ((division & 0x8000) !== 0) throw new Error('SMPTE MIDI timing is not supported');
    if (headerLength > 6) reader.skip(headerLength - 6);

    const sequence: MidiSequence = {
        ticksPerQuarter: division,
        tempos: [{ tick: 0, usPerQuarter: DEFAULT_TEMPO_US_PER_QUARTER }],
        events: [],
        maxTick: 0,
    };
    let order = 0;

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
        const chunkId = reader.readText(4);
        const chunkLength = reader.readU32();
        const chunkEnd = reader.pos + chunkLength;
        if (chunkId !== 'MTrk') {
            reader.seek(chunkEnd);
            continue;
        }
        order = parseTrack(reader, chunkEnd, sequence, order);
        reader.seek(chunkEnd);
    }

    sequence.tempos.sort((a, b) => a.tick - b.tick);
    sequence.events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    return sequence;
}

function parseTrack(reader: MidiReader, chunkEnd: number, sequence: MidiSequence, order: number): number {
    let tick = 0;
    let runningStatus = 0;

    while (reader.pos < chunkEnd) {
        tick += reader.readVarLen();
        sequence.maxTick = Math.max(sequence.maxTick, tick);

        let status = reader.readU8();
        if (status < 0x80) {
            reader.seek(reader.pos - 1);
            status = runningStatus;
        } else if (status < 0xf0) {
            runningStatus = status;
        }

        if (status === 0xff) {
            const metaType = reader.readU8();
            const length = reader.readVarLen();
            if (metaType === 0x51 && length === 3) {
                const usPerQuarter = (reader.readU8() << 16) | (reader.readU8() << 8) | reader.readU8();
                sequence.tempos.push({ tick, usPerQuarter });
            } else {
                reader.skip(length);
            }
            if (metaType === 0x2f) break;
            continue;
        }

        if (status === 0xf0 || status === 0xf7) {
            reader.skip(reader.readVarLen());
            continue;
        }

        const command = status & 0xf0;
        const channel = status & 0x0f;
        const data1 = reader.readU8();
        const needsSecondByte = command !== 0xc0 && command !== 0xd0;
        const data2 = needsSecondByte ? reader.readU8() : 0;

        if (command === 0x90) {
            sequence.events.push(data2 > 0
                ? { type: 'noteOn', tick, order: order++, channel, note: data1, velocity: data2 }
                : { type: 'noteOff', tick, order: order++, channel, note: data1 });
        } else if (command === 0x80) {
            sequence.events.push({ type: 'noteOff', tick, order: order++, channel, note: data1 });
        } else if (command === 0xc0) {
            sequence.events.push({ type: 'program', tick, order: order++, channel, program: data1 });
        } else if (command === 0xb0) {
            sequence.events.push({ type: 'control', tick, order: order++, channel, controller: data1, value: data2 });
        }
    }

    return order;
}

function buildNotes(sequence: MidiSequence): MidiNote[] {
    const programs = new Array<number>(16).fill(0);
    const channelVolumes = new Array<number>(16).fill(100);
    const channelExpressions = new Array<number>(16).fill(127);
    const active = new Map<string, Array<{ tick: number; velocity: number; program: number; volume: number }>>();
    const notes: MidiNote[] = [];

    for (const event of sequence.events) {
        if (event.type === 'program') {
            programs[event.channel] = event.program;
            continue;
        }
        if (event.type === 'control') {
            if (event.controller === 7) channelVolumes[event.channel] = event.value;
            if (event.controller === 11) channelExpressions[event.channel] = event.value;
            continue;
        }

        const key = `${event.channel}:${event.note}`;
        if (event.type === 'noteOn') {
            const volume = (channelVolumes[event.channel] / 127) * (channelExpressions[event.channel] / 127);
            const entries = active.get(key) ?? [];
            entries.push({ tick: event.tick, velocity: event.velocity, program: programs[event.channel], volume });
            active.set(key, entries);
            continue;
        }

        const entries = active.get(key);
        const start = entries?.shift();
        if (!start) continue;
        if (entries && entries.length === 0) active.delete(key);
        const startSec = tickToSeconds(start.tick, sequence);
        const endSec = Math.max(startSec + 0.04, tickToSeconds(Math.max(event.tick, start.tick + 1), sequence));
        notes.push({
            channel: event.channel,
            note: event.note,
            velocity: start.velocity,
            program: start.program,
            volume: start.volume,
            startSec,
            endSec,
        });
    }

    for (const [key, entries] of active) {
        const [channelText, noteText] = key.split(':');
        for (const start of entries) {
            const startSec = tickToSeconds(start.tick, sequence);
            const fallbackEndTick = Math.max(sequence.maxTick, start.tick + sequence.ticksPerQuarter);
            notes.push({
                channel: Number(channelText),
                note: Number(noteText),
                velocity: start.velocity,
                program: start.program,
                volume: start.volume,
                startSec,
                endSec: Math.max(startSec + 0.1, tickToSeconds(fallbackEndTick, sequence)),
            });
        }
    }

    return notes;
}

function tickToSeconds(tick: number, sequence: MidiSequence): number {
    let seconds = 0;
    let lastTick = 0;
    let tempo = DEFAULT_TEMPO_US_PER_QUARTER;

    for (const event of sequence.tempos) {
        if (event.tick > tick) break;
        seconds += ((event.tick - lastTick) * tempo) / (sequence.ticksPerQuarter * 1_000_000);
        lastTick = event.tick;
        tempo = event.usPerQuarter;
    }

    return seconds + ((tick - lastTick) * tempo) / (sequence.ticksPerQuarter * 1_000_000);
}

function scheduleNote(context: OfflineAudioContext, destination: AudioNode, note: MidiNote): void {
    const isDrum = note.channel === DRUM_CHANNEL;
    const start = Math.max(0, note.startSec);
    const end = isDrum ? Math.min(note.endSec, start + 0.14) : note.endSec;
    const releaseEnd = Math.max(end + 0.06, start + 0.05);
    const peak = Math.min(0.08, (note.velocity / 127) * note.volume * (isDrum ? 0.045 : 0.035));

    const oscillator = context.createOscillator();
    oscillator.type = getWaveform(note.program, note.channel);
    oscillator.frequency.setValueAtTime(getFrequency(note.note, note.channel), start);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, Math.min(end, start + 0.02));
    gain.gain.setValueAtTime(peak * 0.75, end);
    gain.gain.linearRampToValueAtTime(0, releaseEnd);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(releaseEnd + 0.01);
}

function getFrequency(note: number, channel: number): number {
    if (channel === DRUM_CHANNEL) {
        if (note < 40) return 70;
        if (note < 50) return 120;
        return 220;
    }
    return 440 * 2 ** ((note - 69) / 12);
}

function getWaveform(program: number, channel: number): OscillatorType {
    if (channel === DRUM_CHANNEL) return 'square';
    if (program >= 24 && program <= 31) return 'sawtooth';
    if (program >= 32 && program <= 39) return 'triangle';
    if (program >= 40 && program <= 55) return 'sawtooth';
    if (program >= 72 && program <= 79) return 'sine';
    if (program >= 80 && program <= 103) return 'square';
    return 'triangle';
}
