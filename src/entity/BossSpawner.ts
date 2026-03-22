/**
 * BossSpawner — Manages periodic boss spawning across the open world.
 * Bosses spawn independently of extraction zones.
 * Each boss type has different stats, colors, and loot tables.
 */

import { Enemy } from './Enemy';
import { TileType, TILE_PROPERTIES } from '../map/Tile';
import { t } from '../i18n/LanguageManager';

export interface BossTemplate {
    nameKey: string;     // i18n key
    color: string;
    lootItemId: string;  // item that drops on kill
    level: number;
    hp: number;
    atk: number;
    def: number;
    magAtk: number;
    magDef: number;
    spd: number;
    aggroRange: number;
    expReward: number;
}

/** Three tiers of bosses */
const BOSS_TEMPLATES: BossTemplate[] = [
    {
        nameKey: 'enemy.boss_giant',
        color: '#990000',
        lootItemId: 'corrupted_blade',
        level: 15,
        hp: 250,
        atk: 25,
        def: 20,
        magAtk: 5,
        magDef: 10,
        spd: 2,
        aggroRange: 8,
        expReward: 200,
    },
    {
        nameKey: 'enemy.boss_drake',
        color: '#4400aa',
        lootItemId: 'shadow_cloak',
        level: 18,
        hp: 300,
        atk: 20,
        def: 15,
        magAtk: 25,
        magDef: 20,
        spd: 4,
        aggroRange: 10,
        expReward: 280,
    },
    {
        nameKey: 'enemy.boss_warden',
        color: '#6600cc',
        lootItemId: 'void_crystal',
        level: 20,
        hp: 400,
        atk: 30,
        def: 25,
        magAtk: 30,
        magDef: 25,
        spd: 3,
        aggroRange: 12,
        expReward: 350,
    },
];

export class BossSpawner {
    private spawnTimer: number = 0;
    private spawnInterval: number = 90; // seconds between spawn attempts
    private maxBosses: number = 3;
    private bossIdCounter: number = 0;

    /**
     * Update the spawner. Call every frame with delta time.
     * Returns an array of newly spawned bosses (may be empty).
     */
    public update(
        dt: number,
        currentBossCount: number,
        playerX: number,
        playerY: number,
        getTile: (x: number, y: number) => TileType
    ): Enemy[] {
        this.spawnTimer += dt;

        if (this.spawnTimer < this.spawnInterval) return [];
        this.spawnTimer = 0;

        if (currentBossCount >= this.maxBosses) return [];

        // Spawn 1 boss per interval
        const template = BOSS_TEMPLATES[Math.floor(Math.random() * BOSS_TEMPLATES.length)];
        const boss = this.spawnBoss(template, playerX, playerY, getTile);
        return boss ? [boss] : [];
    }

    /**
     * Force-spawn initial bosses at the start of a raid.
     */
    public spawnInitialBosses(
        playerX: number,
        playerY: number,
        getTile: (x: number, y: number) => TileType
    ): Enemy[] {
        const bosses: Enemy[] = [];
        // Spawn one of each type
        for (const template of BOSS_TEMPLATES) {
            const boss = this.spawnBoss(template, playerX, playerY, getTile);
            if (boss) bosses.push(boss);
        }
        return bosses;
    }

    private spawnBoss(
        template: BossTemplate,
        playerX: number,
        playerY: number,
        getTile: (x: number, y: number) => TileType
    ): Enemy | null {
        // Find a random walkable position 20-40 tiles from the player
        for (let attempt = 0; attempt < 50; attempt++) {
            const dist = 20 + Math.floor(Math.random() * 21);
            const angle = Math.random() * Math.PI * 2;
            const tx = playerX + Math.round(Math.cos(angle) * dist);
            const ty = playerY + Math.round(Math.sin(angle) * dist);

            const tile = getTile(tx, ty);
            if (TILE_PROPERTIES[tile]?.walkable) {
                const id = `boss_${this.bossIdCounter++}`;
                const boss = new Enemy(id, tx, ty, t(template.nameKey), template.level, template.color);

                // Override stats
                boss.stats.maxHp = template.hp;
                boss.stats.hp = template.hp;
                boss.stats.atk = template.atk;
                boss.stats.def = template.def;
                boss.stats.magAtk = template.magAtk;
                boss.stats.magDef = template.magDef;
                boss.stats.spd = template.spd;
                boss.aggroRange = template.aggroRange;
                boss.expReward = template.expReward;

                // Boss flags
                boss.isBoss = true;
                boss.lootTableId = template.lootItemId;

                return boss;
            }
        }
        return null; // couldn't find a valid position
    }

    public reset(): void {
        this.spawnTimer = 0;
        this.bossIdCounter = 0;
    }
}
