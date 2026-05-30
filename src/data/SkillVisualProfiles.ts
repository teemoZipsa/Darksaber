import type { Skill, SkillElement, SkillType } from './SkillDB';

export type SkillVisualPhase = 'cast' | 'impact';

export type SkillSpriteEffect =
    | 'hit'
    | 'critHit'
    | 'fire'
    | 'ice'
    | 'lightning'
    | 'wind'
    | 'heal'
    | 'dark'
    | 'buff'
    | 'debuff'
    | 'earth';

export type SkillVisualMotion =
    | 'burst'
    | 'slash'
    | 'pierce'
    | 'charge'
    | 'rain'
    | 'spiral'
    | 'ward'
    | 'drain'
    | 'mist'
    | 'quake'
    | 'nova';

export interface SkillVisualProfile {
    skillId: string;
    visualKey: string;
    spriteEffect: SkillSpriteEffect;
    motion: SkillVisualMotion;
    palette: string[];
    glyph: string;
    particleCount: number;
    ringCount: number;
    spriteSize: number;
    duration: number;
}

const ELEMENT_PALETTES: Record<SkillElement, string[]> = {
    fire: ['#ff4d20', '#ff8a1f', '#ffd166', '#fff2a8'],
    ice: ['#7dd8ff', '#bdf2ff', '#e9fbff', '#6aa6ff'],
    lightning: ['#fff36a', '#ffffff', '#80e6ff', '#b68cff'],
    holy: ['#fff4a8', '#f0c050', '#ffffff', '#83ffd2'],
    dark: ['#7b3fb8', '#cf6bff', '#26113f', '#ff4ea3'],
    earth: ['#a87945', '#d5ad67', '#735037', '#f0c050'],
    wind: ['#8cffb8', '#d9ffe7', '#66d7ff', '#a6ff8a'],
    physical: ['#ffffff', '#ffd2a0', '#f0c050', '#c84d2f'],
    none: ['#f0c050', '#ffffff', '#8cffb8', '#7dd8ff'],
};

const TYPE_DEFAULTS: Record<SkillType, Pick<SkillVisualProfile, 'spriteEffect' | 'motion'>> = {
    damage: { spriteEffect: 'hit', motion: 'burst' },
    aoe: { spriteEffect: 'hit', motion: 'nova' },
    heal: { spriteEffect: 'heal', motion: 'ward' },
    buff: { spriteEffect: 'buff', motion: 'ward' },
    debuff: { spriteEffect: 'debuff', motion: 'mist' },
};

const ELEMENT_SPRITES: Partial<Record<SkillElement, SkillSpriteEffect>> = {
    fire: 'fire',
    ice: 'ice',
    lightning: 'lightning',
    wind: 'wind',
    earth: 'earth',
    holy: 'heal',
    dark: 'dark',
};

const VISUAL_OVERRIDES: Record<string, Partial<SkillVisualProfile>> = {
    inf_t1: { motion: 'ward', spriteEffect: 'buff', palette: ['#f0c050', '#ffffff', '#ffb347'] },
    inf_t2: { motion: 'nova', spriteEffect: 'buff', palette: ['#f0c050', '#ff6b35', '#ffffff'] },
    inf_t3: { motion: 'slash', spriteEffect: 'hit' },
    inf_t4: { motion: 'spiral', spriteEffect: 'wind' },
    inf_t5: { motion: 'pierce', spriteEffect: 'critHit' },
    inf_t6: { motion: 'burst', spriteEffect: 'critHit' },
    inf_t7: { motion: 'nova', spriteEffect: 'lightning', palette: ['#f0c050', '#ffffff', '#ff4d4d'] },

    cav_t1: { motion: 'charge' },
    cav_t2: { motion: 'pierce' },
    cav_t3: { motion: 'charge' },
    cav_t4: { motion: 'pierce', spriteEffect: 'wind' },
    cav_t5: { motion: 'pierce', spriteEffect: 'critHit' },
    cav_t6: { motion: 'nova', spriteEffect: 'buff' },
    cav_t7: { motion: 'pierce', spriteEffect: 'dark', palette: ['#ffffff', '#f0c050', '#262626'] },

    fly_t1: { motion: 'charge', spriteEffect: 'wind' },
    fly_t2: { motion: 'slash', spriteEffect: 'wind' },
    fly_t3: { motion: 'pierce', spriteEffect: 'wind' },
    fly_t4: { motion: 'spiral', spriteEffect: 'wind' },
    fly_t5: { motion: 'nova', spriteEffect: 'fire' },
    fly_t6: { motion: 'charge', spriteEffect: 'wind' },
    fly_t7: { motion: 'nova', spriteEffect: 'wind', palette: ['#ffffff', '#8cffb8', '#f0c050'] },

    nav_t2: { motion: 'mist', spriteEffect: 'ice' },
    nav_t5: { motion: 'rain', spriteEffect: 'ice' },
    nav_t6: { motion: 'spiral', spriteEffect: 'ice' },
    nav_t7: { motion: 'nova', spriteEffect: 'ice', palette: ['#7dd8ff', '#ffffff', '#f0c050'] },

    lan_t1: { motion: 'pierce' },
    lan_t2: { motion: 'pierce', spriteEffect: 'critHit' },
    lan_t3: { motion: 'spiral' },
    lan_t4: { motion: 'rain', spriteEffect: 'lightning' },
    lan_t5: { motion: 'pierce', spriteEffect: 'earth' },
    lan_t6: { motion: 'pierce', spriteEffect: 'heal' },
    lan_t7: { motion: 'pierce', spriteEffect: 'critHit', palette: ['#f0c050', '#ffffff', '#ff4d4d'] },

    arc_t1: { motion: 'pierce' },
    arc_t2: { motion: 'pierce', spriteEffect: 'critHit' },
    arc_t3: { motion: 'pierce', spriteEffect: 'wind' },
    arc_t4: { motion: 'rain' },
    arc_t5: { motion: 'pierce', spriteEffect: 'critHit' },
    arc_t6: { motion: 'rain', spriteEffect: 'fire' },
    arc_t7: { motion: 'pierce', spriteEffect: 'lightning', palette: ['#ffffff', '#f0c050', '#66d7ff'] },

    cle_t3: { motion: 'ward', spriteEffect: 'heal', palette: ['#ffffff', '#83ffd2', '#f0c050'] },
    cle_t4: { motion: 'ward', spriteEffect: 'heal', palette: ['#ffffff', '#f0c050', '#83ffd2'] },
    cle_t5: { motion: 'nova', spriteEffect: 'heal' },
    cle_t6: { motion: 'nova', spriteEffect: 'heal', palette: ['#ffffff', '#fff4a8', '#83ffd2'] },
    cle_t7: { motion: 'nova', spriteEffect: 'heal', palette: ['#ffffff', '#f0c050', '#83ffd2'] },

    pri_t1: { motion: 'ward', spriteEffect: 'buff' },
    pri_t2: { motion: 'ward', spriteEffect: 'buff' },
    pri_t3: { motion: 'spiral', spriteEffect: 'lightning' },
    pri_t4: { motion: 'ward', spriteEffect: 'buff' },
    pri_t5: { motion: 'ward', spriteEffect: 'buff' },
    pri_t6: { motion: 'nova', spriteEffect: 'heal' },
    pri_t7: { motion: 'nova', spriteEffect: 'buff', palette: ['#ffffff', '#f0c050', '#83ffd2', '#ff8cff'] },

    shr_t1: { motion: 'ward', spriteEffect: 'heal', palette: ['#ffb7e8', '#ffffff', '#83ffd2'] },
    shr_t2: { motion: 'ward', spriteEffect: 'heal', palette: ['#8cffb8', '#ffffff', '#f0c050'] },
    shr_t3: { motion: 'ward', spriteEffect: 'buff' },
    shr_t5: { motion: 'nova', spriteEffect: 'buff' },
    shr_t6: { motion: 'pierce', spriteEffect: 'heal' },
    shr_t7: { motion: 'nova', spriteEffect: 'heal', palette: ['#ffffff', '#f0c050', '#ffb7e8', '#83ffd2'] },

    cul_t2: { motion: 'mist', spriteEffect: 'debuff' },
    cul_t3: { motion: 'drain', spriteEffect: 'dark' },
    cul_t5: { motion: 'mist', spriteEffect: 'dark' },
    cul_t6: { motion: 'spiral', spriteEffect: 'dark' },
    cul_t7: { motion: 'nova', spriteEffect: 'dark', palette: ['#1a0828', '#cf6bff', '#ff4ea3', '#ffffff'] },

    alc_t1: { motion: 'burst', spriteEffect: 'earth' },
    alc_t2: { motion: 'mist', spriteEffect: 'debuff', palette: ['#7cff4d', '#a87945', '#5c2f80'] },
    alc_t3: { motion: 'burst', spriteEffect: 'fire' },
    alc_t4: { motion: 'drain', spriteEffect: 'heal', palette: ['#83ffd2', '#7dd8ff', '#ffffff'] },
    alc_t5: { motion: 'burst', spriteEffect: 'earth', palette: ['#f0c050', '#ffffff', '#d5ad67'] },
    alc_t6: { motion: 'ward', spriteEffect: 'heal', palette: ['#83ffd2', '#ffffff', '#f0c050'] },
    alc_t7: { motion: 'quake', spriteEffect: 'earth', palette: ['#f0c050', '#d5ad67', '#ffffff'] },

    og_freeze: { motion: 'mist', spriteEffect: 'ice' },
    og_poison: { motion: 'mist', spriteEffect: 'debuff', palette: ['#7cff4d', '#a87945', '#5c2f80'] },
    og_blizzard: { motion: 'rain', spriteEffect: 'ice' },
    og_thunderstorm: { motion: 'rain', spriteEffect: 'lightning' },
    og_tornado: { motion: 'spiral', spriteEffect: 'wind' },
    og_earthquake: { motion: 'quake', spriteEffect: 'earth' },
    og_meteor: { motion: 'rain', spriteEffect: 'fire', palette: ['#ff4d20', '#f0c050', '#ffffff', '#7b3fb8'] },
    og_cure: { motion: 'ward', spriteEffect: 'heal' },
    og_slow: { motion: 'mist', spriteEffect: 'debuff' },
    og_demove: { motion: 'mist', spriteEffect: 'debuff' },
    og_deattack: { motion: 'mist', spriteEffect: 'debuff' },
    og_mute: { motion: 'mist', spriteEffect: 'dark' },
    og_antiresist: { motion: 'mist', spriteEffect: 'dark' },
    og_hpdrain: { motion: 'drain', spriteEffect: 'dark' },
    og_mpdrain: { motion: 'drain', spriteEffect: 'dark', palette: ['#7dd8ff', '#cf6bff', '#ffffff'] },
};

export function getSkillVisualProfile(skill: Skill): SkillVisualProfile {
    const byType = TYPE_DEFAULTS[skill.type] ?? TYPE_DEFAULTS.damage;
    const spriteEffect = ELEMENT_SPRITES[skill.element] ?? byType.spriteEffect;
    const motion = getDefaultMotion(skill);
    const tier = finiteAtLeast(skill.tier, 1, 1);
    const aoeRadius = finiteAtLeast(skill.aoeRadius, 0, 0);
    const power = Number.isFinite(skill.power) ? skill.power : 0;
    const tierScale = 1 + Math.max(0, tier - 1) * 0.08;
    const areaScale = 1 + aoeRadius * 0.14;
    const base: SkillVisualProfile = {
        skillId: skill.id,
        visualKey: `${skill.id}:${skill.type}:${skill.element}:${tier}`,
        spriteEffect,
        motion,
        palette: ELEMENT_PALETTES[skill.element] ?? ELEMENT_PALETTES.none,
        glyph: skill.icon,
        particleCount: Math.round((skill.type === 'aoe' ? 20 : 12) * tierScale * areaScale),
        ringCount: skill.type === 'aoe' || power >= 3 ? 2 : 1,
        spriteSize: Math.round((skill.type === 'aoe' ? 88 : 68) * tierScale * areaScale),
        duration: Math.min(1.35, 0.55 + tier * 0.05 + aoeRadius * 0.08),
    };
    const override = VISUAL_OVERRIDES[skill.id];
    const resolvedMotion = override?.motion ?? base.motion;
    const resolvedSpriteEffect = override?.spriteEffect ?? base.spriteEffect;
    const resolvedPalette = override?.palette ?? base.palette;
    const resolvedParticleCount = override?.particleCount ?? base.particleCount;
    const resolvedRingCount = override?.ringCount ?? base.ringCount;
    const resolvedSpriteSize = override?.spriteSize ?? base.spriteSize;
    const resolvedDuration = override?.duration ?? base.duration;

    return {
        ...base,
        ...override,
        skillId: skill.id,
        visualKey: [
            skill.id,
            skill.type,
            skill.element,
            tier,
            resolvedMotion,
            resolvedSpriteEffect,
            resolvedPalette.join(','),
            resolvedParticleCount,
            resolvedRingCount,
            resolvedSpriteSize,
            resolvedDuration,
        ].join(':'),
        glyph: override?.glyph ?? skill.icon,
    };
}

function getDefaultMotion(skill: Skill): SkillVisualMotion {
    const byType = TYPE_DEFAULTS[skill.type] ?? TYPE_DEFAULTS.damage;
    const aoeRadius = finiteAtLeast(skill.aoeRadius, 0, 0);
    const range = finiteAtLeast(skill.range, 1, 1);

    if (skill.type === 'heal' || skill.type === 'buff') return 'ward';
    if (skill.type === 'debuff') return 'mist';
    if (aoeRadius >= 2) return skill.element === 'earth' ? 'quake' : 'nova';
    if (skill.type === 'aoe') return skill.element === 'lightning' || skill.element === 'ice' ? 'rain' : 'nova';
    if (skill.element === 'physical') {
        if (range >= 2) return 'pierce';
        return 'slash';
    }
    if (skill.element === 'wind') return 'spiral';
    if (skill.element === 'dark') return 'drain';
    return byType.motion;
}

function finiteAtLeast(value: number, min: number, fallback: number): number {
    return Number.isFinite(value) ? Math.max(min, value) : fallback;
}
