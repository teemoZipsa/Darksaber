import type { FieldPassableQuery } from './FieldPathing';

/** Town entry ends exploration. Do not use a town as a shortcut toward an
 * outdoor destination; an explicit destination inside town remains legal. */
export function canTraverseTownTile(query: FieldPassableQuery, getTownAt: (x: number, y: number) => unknown): boolean {
    return query.intent !== 'move' || !query.goal || !getTownAt(query.x, query.y)
        || Boolean(getTownAt(query.goal.x, query.goal.y));
}
