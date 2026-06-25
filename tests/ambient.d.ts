declare module '../../scripts/sound-asset-policy.mjs' {
    export function buildRequiredSoundPaths(rootDir: string): {
        requiredKeys: string[];
        requiredPaths: string[];
        catalog: Map<string, string>;
    };
    export function collectRequiredSoundKeys(rootDir: string): Set<string>;
    export function isOptionalSoundAsset(src: string, policy: ReturnType<typeof buildRequiredSoundPaths>): boolean;
    export function parseAudioCatalog(content: string): Map<string, string>;
}
