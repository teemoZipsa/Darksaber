import ORIGINAL_LATE_STORY_MRC_FACTS_JSON from './content/original-late-story-mrc-facts.json';

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
    layerSummaries: OriginalLateStoryMrcLayerSummary[];
}

export type OriginalLateStoryMrcFactMap = Record<string, OriginalLateStoryMrcFact>;

export const ORIGINAL_LATE_STORY_MRC_FACTS = ORIGINAL_LATE_STORY_MRC_FACTS_JSON as OriginalLateStoryMrcFactMap;

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
