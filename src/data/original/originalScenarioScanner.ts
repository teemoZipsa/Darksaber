export interface OriginalScenarioWordCandidate {
    offset: number;
    value: number;
}

export interface OriginalScenarioPairCandidate {
    offset: number;
    x: number;
    y: number;
}

export interface OriginalScenarioScriptScan {
    byteLength: number;
    wordCount: number;
    trailingBytes: number;
    hash: string;
    firstWords: number[];
    opcodeCandidates: OriginalScenarioWordCandidate[];
    coordinateCandidates: OriginalScenarioPairCandidate[];
    textReferenceCandidates: OriginalScenarioWordCandidate[];
    sceneReferenceCandidates: OriginalScenarioWordCandidate[];
}

export interface OriginalScenarioMapManifestEntry {
    mapId: string;
    mrc?: string;
    translatedMrc?: string;
    hmap?: string;
    setArc?: string;
}

function readInt32Words(bytes: Uint8Array): number[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const wordCount = Math.floor(bytes.byteLength / 4);
    const words: number[] = [];
    for (let index = 0; index < wordCount; index++) {
        words.push(view.getInt32(index * 4, true));
    }
    return words;
}

function stableHash(words: readonly number[]): string {
    let hash = 0x811c9dc5;
    for (const word of words) {
        let value = word >>> 0;
        for (let index = 0; index < 4; index++) {
            hash ^= value & 0xff;
            hash = Math.imul(hash, 0x01000193) >>> 0;
            value >>>= 8;
        }
    }
    return hash.toString(16).padStart(8, '0');
}

function uniqueFirst(candidates: OriginalScenarioWordCandidate[], limit: number): OriginalScenarioWordCandidate[] {
    const seen = new Set<number>();
    const result: OriginalScenarioWordCandidate[] = [];
    for (const candidate of candidates) {
        if (seen.has(candidate.value)) continue;
        seen.add(candidate.value);
        result.push(candidate);
        if (result.length >= limit) break;
    }
    return result;
}

export function scanOriginalScenarioScript(bytes: Uint8Array): OriginalScenarioScriptScan {
    const words = readInt32Words(bytes);
    const opcodeCandidates: OriginalScenarioWordCandidate[] = [];
    const coordinateCandidates: OriginalScenarioPairCandidate[] = [];
    const textReferenceCandidates: OriginalScenarioWordCandidate[] = [];
    const sceneReferenceCandidates: OriginalScenarioWordCandidate[] = [];

    for (let index = 0; index < words.length; index++) {
        const value = words[index];
        const offset = index * 4;
        if (value >= 0 && value <= 255) opcodeCandidates.push({ offset, value });
        if (value >= 1 && value <= 2000) textReferenceCandidates.push({ offset, value });
        if (value >= 0 && value <= 99) sceneReferenceCandidates.push({ offset, value });

        const next = words[index + 1];
        if (
            next !== undefined
            && value >= 0
            && value <= 255
            && next >= 0
            && next <= 255
        ) {
            coordinateCandidates.push({ offset, x: value, y: next });
        }
    }

    return {
        byteLength: bytes.byteLength,
        wordCount: words.length,
        trailingBytes: bytes.byteLength % 4,
        hash: stableHash(words),
        firstWords: words.slice(0, 16),
        opcodeCandidates: uniqueFirst(opcodeCandidates, 16),
        coordinateCandidates: coordinateCandidates.slice(0, 16),
        textReferenceCandidates: uniqueFirst(textReferenceCandidates, 16),
        sceneReferenceCandidates: uniqueFirst(sceneReferenceCandidates, 16),
    };
}

export function createOriginalScenarioMapManifest(fileNames: readonly string[]): OriginalScenarioMapManifestEntry[] {
    const entries = new Map<string, OriginalScenarioMapManifestEntry>();
    const getEntry = (mapId: string): OriginalScenarioMapManifestEntry => {
        const existing = entries.get(mapId);
        if (existing) return existing;
        const entry: OriginalScenarioMapManifestEntry = { mapId };
        entries.set(mapId, entry);
        return entry;
    };

    for (const fileName of fileNames) {
        const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
        const match = /^(?<id>\d+)(?<kind>t|hmap|set)?\.(?<ext>mrc|bmp|arc)$/i.exec(normalized);
        if (!match?.groups) continue;
        const mapId = match.groups.id;
        const kind = match.groups.kind?.toLowerCase() ?? '';
        const ext = match.groups.ext.toLowerCase();
        const entry = getEntry(mapId);

        if (ext === 'mrc' && kind === '') entry.mrc = normalized;
        else if (ext === 'mrc' && kind === 't') entry.translatedMrc = normalized;
        else if (ext === 'bmp' && kind === 'hmap') entry.hmap = normalized;
        else if (ext === 'arc' && kind === 'set') entry.setArc = normalized;
    }

    return [...entries.values()].sort((a, b) => Number(a.mapId) - Number(b.mapId));
}
