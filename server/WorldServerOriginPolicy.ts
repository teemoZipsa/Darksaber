import { createOriginPolicy, type OriginPolicy } from './OriginPolicy';
import type { ServerRuntimeConfig } from './ServerRuntimeConfig';

export function createWorldServerOriginPolicy(
    input: Pick<ServerRuntimeConfig, 'allowedOrigins' | 'allowMissingOrigin'>
): OriginPolicy {
    return createOriginPolicy({
        allowedOrigins: input.allowedOrigins,
        allowMissingOrigin: input.allowMissingOrigin,
    });
}
