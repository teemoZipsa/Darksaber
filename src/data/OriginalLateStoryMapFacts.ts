import ORIGINAL_LATE_STORY_MRC_FACTS_JSON from './content/original-late-story-mrc-facts.json';

export type OriginalLateStoryMrcVisualSymbol = '.' | 'd' | 's';

export interface OriginalLateStoryMrcValueCount {
    value: number;
    count: number;
}

export interface OriginalLateStoryMrcBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OriginalLateStoryMrcLayerSummary {
    index: number;
    uniqueValues: number;
    nonZeroCells: number;
    nonEmptyCells: number;
    nonEmptyBounds: OriginalLateStoryMrcBounds | null;
    dominantValues: OriginalLateStoryMrcValueCount[];
}

export interface OriginalLateStoryMrcFact {
    source: string;
    translatedSource: string;
    byteLength: number;
    headerWordCount: number;
    width: number;
    height: number;
    dataOffset: number;
    layerCount: number;
    tailBytes: number;
    visualRows: string[];
    layerSummaries: OriginalLateStoryMrcLayerSummary[];
}

export type OriginalLateStoryMrcFactMap = Record<string, OriginalLateStoryMrcFact>;

export const ORIGINAL_LATE_STORY_MRC_FACTS = ORIGINAL_LATE_STORY_MRC_FACTS_JSON as OriginalLateStoryMrcFactMap;

const decodedVisualRowsBySource = new Map<string, string[]>();

function decodeRleRow(row: string, expectedSize: number): string {
    let decoded = '';
    let countText = '';
    for (const char of row) {
        if (char >= '0' && char <= '9') {
            countText += char;
            continue;
        }
        const count = countText ? Number(countText) : 1;
        decoded += char.repeat(count);
        countText = '';
    }
    if (decoded.length !== expectedSize) {
        throw new Error(`Invalid original late story MRC visual row width: ${decoded.length}`);
    }
    return decoded;
}

function getDecodedVisualRows(fact: OriginalLateStoryMrcFact): string[] {
    const cached = decodedVisualRowsBySource.get(fact.source);
    if (cached) return cached;
    if (fact.visualRows.length !== fact.height) {
        throw new Error(`Invalid original late story MRC visual row count: ${fact.visualRows.length}`);
    }
    const decoded = fact.visualRows.map((row) => decodeRleRow(row, fact.width));
    decodedVisualRowsBySource.set(fact.source, decoded);
    return decoded;
}

function requireOriginalLateStoryMrcFact(episode: number): OriginalLateStoryMrcFact {
    const fact = ORIGINAL_LATE_STORY_MRC_FACTS[String(episode)];
    if (!fact) {
        throw new Error(`Missing original late story MRC fact for episode ${episode}`);
    }
    return fact;
}

export function getOriginalLateStoryMrcFact(episode: number): OriginalLateStoryMrcFact {
    return requireOriginalLateStoryMrcFact(episode);
}

export function getOriginalLateStoryMrcSize(episode: number): { width: number; height: number } {
    const fact = requireOriginalLateStoryMrcFact(episode);
    return { width: fact.width, height: fact.height };
}

export function getOriginalLateStoryMrcVisualSymbol(
    fact: OriginalLateStoryMrcFact,
    x: number,
    y: number
): OriginalLateStoryMrcVisualSymbol | null {
    if (x < 0 || y < 0 || x >= fact.width || y >= fact.height) return null;
    const symbol = getDecodedVisualRows(fact)[y]?.[x];
    if (symbol === '.' || symbol === 'd' || symbol === 's') return symbol;
    throw new Error(`Invalid original late story MRC visual symbol: ${symbol}`);
}
