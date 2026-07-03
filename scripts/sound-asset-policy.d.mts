export interface SoundAssetPolicy {
    catalog: Map<string, string>;
    requiredKeys: Set<string>;
    requiredPaths: Set<string>;
    pathToKeys: Map<string, string[]>;
}

export function parseAudioCatalog(content: string): Map<string, string>;
export function collectStoryBgmKeys(rootDir: string): Set<string>;
export function collectSkillCastSfxKeys(rootDir: string): Set<string>;
export function collectRequiredSoundKeys(rootDir: string): Set<string>;
export function buildRequiredSoundPaths(rootDir: string): SoundAssetPolicy;
export function isSoundAsset(assetString: string): boolean;
export function isOptionalSoundAsset(assetString: string, policy: SoundAssetPolicy): boolean;
