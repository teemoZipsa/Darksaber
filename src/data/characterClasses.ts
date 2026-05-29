/**
 * Character creation class presets (portrait + relative stat bars).
 * Shared by the React character-creation screen; stats are 0..1 bar ratios.
 */

export interface CharConfig {
    id: string; // e.g. 'infantry'
    labelKey: string;
    hp: number; // 0.0 to 1.0 (bar length)
    atk: number;
    def: number;
    mag: number;
    imageSrc: string; // path to portrait sprite
    portraitCrop: { x: number; y: number; w: number; h: number };
}

export const CHAR_CLASSES: CharConfig[] = [
    { id: 'infantry', labelKey: 'create.fighter', hp: 0.8, atk: 0.7, def: 0.6, mag: 0.2, imageSrc: '/assets/images/characters/darksaber/infantry_t1.png', portraitCrop: { x: 21, y: 4, w: 85, h: 124 } },
    { id: 'cavalry', labelKey: 'create.knight', hp: 0.9, atk: 0.6, def: 0.9, mag: 0.3, imageSrc: '/assets/images/characters/darksaber/cavalry_t1.png', portraitCrop: { x: 26, y: 5, w: 78, h: 119 } },
    { id: 'cleric', labelKey: 'create.cleric', hp: 0.6, atk: 0.3, def: 0.4, mag: 0.7, imageSrc: '/assets/images/characters/darksaber/cleric_t1.png', portraitCrop: { x: 22, y: 5, w: 83, h: 118 } },
    { id: 'mage', labelKey: 'create.magician', hp: 0.4, atk: 0.3, def: 0.3, mag: 0.9, imageSrc: '/assets/images/characters/darksaber/mage_t1.png', portraitCrop: { x: 24, y: 7, w: 81, h: 115 } },
];
