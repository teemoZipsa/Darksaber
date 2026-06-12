import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { fuseActivePartyBranch, getFusionCandidates, hasActiveMasterCharacter } from '../../src/character/FusionSystem';
import { PartyManager } from '../../src/character/PartyManager';
import { getClassLine, isMasterClassLineId } from '../../src/data/ClassTree';
import { i18n } from '../../src/i18n/LanguageManager';
import { WorldMap } from '../../src/map/WorldMap';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeFusionReady(id: string, classLineId: string): Character {
    const character = new Character(id, id, classLineId);
    character.currentTier = 7;
    character.level = character.levelCap();
    character.exp = character.expToNext;
    character.hasEmblem = true;
    character.stats.maxHp = 200;
    character.stats.hp = 200;
    character.stats.atk = 35;
    return character;
}

test('max base tier level unlocks the fusion emblem', () => {
    const character = new Character('fighter', 'Fighter', 'infantry');
    character.currentTier = 7;
    character.level = character.levelCap() - 1;
    character.expToNext = 1;

    const result = character.gainExp(1);

    assert.equal(character.level, character.levelCap());
    assert.equal(character.hasEmblem, true);
    assert.equal(result.emblemUnlocked, true);
    assert.equal(character.isFusionReady(), true);
});

test('active party fusion consumes three ready base classes into one T8 master class', () => {
    const party = new PartyManager();
    const infantry = makeFusionReady('infantry', 'infantry');
    const cavalry = makeFusionReady('cavalry', 'cavalry');
    const flying = makeFusionReady('flying', 'flying');
    for (const character of [infantry, cavalry, flying]) {
        party.addToRoster(character);
        assert.equal(party.deployCharacter(character), true);
    }
    party.switchTo(1);

    const candidates = getFusionCandidates(party);
    const battle = candidates.find((candidate) => candidate.branch === 'battle');
    assert.equal(battle?.canFuse, true);

    const result = fuseActivePartyBranch(party, 'battle');

    assert.equal(result.success, true);
    assert.equal(party.getCharacters().length, 1);
    assert.equal(party.getRoster().length, 1);
    assert.equal(party.getActive()?.id, 'cavalry');
    assert.equal(party.getActive()?.classLineId, 'master_battle');
    assert.equal(party.getActive()?.currentTier, 8);
    assert.equal(hasActiveMasterCharacter(party), true);
    assert.equal(isMasterClassLineId(party.getActive()?.classLineId ?? ''), true);
    assert.ok(getClassLine('master_battle'));
});

test('fusion result messages follow the active language', () => {
    const previousLang = i18n.lang;
    try {
        i18n.lang = 'en';
        const emptyParty = new PartyManager();
        assert.equal(
            fuseActivePartyBranch(emptyParty, 'battle').message,
            'Fusion requirements are not met. The three deployed characters need T7 Lv10 and emblems for their lines.'
        );

        const party = new PartyManager();
        const infantry = makeFusionReady('infantry', 'infantry');
        const cavalry = makeFusionReady('cavalry', 'cavalry');
        const flying = makeFusionReady('flying', 'flying');
        for (const character of [infantry, cavalry, flying]) {
            party.addToRoster(character);
            assert.equal(party.deployCharacter(character), true);
        }
        party.switchTo(1);

        assert.equal(
            fuseActivePartyBranch(party, 'battle').message,
            'cavalry fused into Battle Master.'
        );
    } finally {
        i18n.lang = previousLang;
    }
});

test('master class line promotes through T8 to T10', () => {
    const character = makeFusionReady('infantry', 'infantry');
    const absorbed = [
        makeFusionReady('cavalry', 'cavalry'),
        makeFusionReady('flying', 'flying'),
    ];
    assert.equal(character.fuseToMaster('battle', absorbed), true);

    character.level = Character.MAX_LEVEL;
    character.expToNext = 1;
    character.gainExp(1);
    assert.equal(character.currentTier, 9);

    character.level = Character.MAX_LEVEL;
    character.expToNext = 1;
    character.gainExp(1);
    assert.equal(character.currentTier, 10);
});

test('world map exposes mortal and master temple entrances', () => {
    const world = new WorldMap('mortal');
    const mortalTemple = world.getPrimaryTempleTile();
    assert.equal(world.getTileAt(mortalTemple.x, mortalTemple.y), TileType.DUNGEON_ENTRANCE);

    world.setRealm('master');
    const masterTemple = world.getPrimaryTempleTile();
    assert.equal(world.getRealm(), 'master');
    assert.equal(world.getTileAt(masterTemple.x, masterTemple.y), TileType.DUNGEON_ENTRANCE);
    assert.equal(world.getDisplayName(), '마스터 월드');
});
