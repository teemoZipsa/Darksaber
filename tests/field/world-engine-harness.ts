import { WorldEngine } from '../../src/engine/WorldEngine';

export function createWorldEnginePrototypeHarness<T extends object>(): T {
    return Object.create(WorldEngine.prototype) as T;
}
