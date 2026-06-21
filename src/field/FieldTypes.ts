import type { Character } from '../character/Character';
import type { Skill } from '../data/SkillDB';
import type { Enemy } from '../entity/Enemy';
import type { Player } from '../entity/Player';
import type { EnemyAIDecision } from './EnemyAI';
import type { TilePoint } from './FieldPathing';

export interface FieldIntent {
    kind: 'move' | 'attack' | 'interact' | 'magic' | 'tool' | 'rest' | 'defend';
    tile?: TilePoint;
    path?: TilePoint[];
    enemyId?: string;
    lootId?: string;
    skillId?: string;
    targetEnemyId?: string;
    apCost?: number;
    pathCost?: number;
}

export interface FieldActor {
    id: string;
    character: Character;
    entity: Player;
    path: TilePoint[];
    queuedIntent: FieldIntent | null;
}

export type FieldTurnEndReason = 'wait' | 'incapacitated' | 'gaugeLow' | 'statusBlocked' | 'noExecutableAction';

export interface FieldEnemy {
    enemy: Enemy;
    home: TilePoint;
    path: TilePoint[];
    previewIntent?: EnemyAIDecision | null;
}

export type FieldHitParty = FieldActor & { gridX: number; gridY: number };

export type FieldMagicState =
    | { mode: 'idle' }
    | { mode: 'menu' }
    | { mode: 'targeting'; skill: Skill; validTiles: Set<string>; hoverAoeTiles: Set<string> };

export interface AttackCue {
    from: TilePoint;
    to: TilePoint;
    timer: number;
    duration: number;
    color: string;
    label?: string;
}
