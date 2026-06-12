import type { Character } from './Character';
import type { PartyManager } from './PartyManager';
import {
    MASTER_CLASSES,
    getClassLine,
    getMasterClass,
    getMasterClassLineId,
    type MasterBranch,
} from '../data/ClassTree';
import { formatT, i18n, t } from '../i18n/LanguageManager';

export interface FusionRequirementStatus {
    classId: string;
    classNameKr: string;
    classNameEn: string;
    character: Character | null;
    ready: boolean;
}

export interface FusionCandidate {
    branch: MasterBranch;
    masterClassId: string;
    masterNameKr: string;
    masterNameEn: string;
    requirements: FusionRequirementStatus[];
    canFuse: boolean;
}

export interface FusionResult {
    success: boolean;
    branch?: MasterBranch;
    masterCharacter?: Character;
    absorbedCharacters: Character[];
    message: string;
}

export function getFusionCandidates(party: PartyManager): FusionCandidate[] {
    const activeParty = party.getCharacters();
    return MASTER_CLASSES.map((masterClass) => {
        const requirements = masterClass.requiredClassIds.map((classId) => {
            const classLine = getClassLine(classId);
            const character = activeParty.find((candidate) => candidate.classLineId === classId) ?? null;
            return {
                classId,
                classNameKr: classLine?.nameKr ?? classId,
                classNameEn: classLine?.nameEn ?? classId,
                character,
                ready: Boolean(character?.isFusionReady()),
            };
        });
        return {
            branch: masterClass.branch,
            masterClassId: getMasterClassLineId(masterClass.branch),
            masterNameKr: masterClass.tiers[0]?.nameKr ?? masterClass.branch,
            masterNameEn: masterClass.tiers[0]?.nameEn ?? masterClass.branch,
            requirements,
            canFuse: requirements.every((requirement) => requirement.ready),
        };
    });
}

export function hasActiveMasterCharacter(party: PartyManager): boolean {
    return party.getCharacters().some((character) => character.classLineId.startsWith('master_'));
}

export function fuseActivePartyBranch(party: PartyManager, branch: MasterBranch): FusionResult {
    const masterClass = getMasterClass(branch);
    if (!masterClass) {
        return {
            success: false,
            absorbedCharacters: [],
            message: t('fusion.error.unknownBranch'),
        };
    }

    const candidate = getFusionCandidates(party).find((entry) => entry.branch === branch);
    if (!candidate || !candidate.canFuse) {
        return {
            success: false,
            branch,
            absorbedCharacters: [],
            message: t('fusion.error.requirements'),
        };
    }

    const participants = masterClass.requiredClassIds
        .map((classId) => party.getCharacters().find((character) => character.classLineId === classId))
        .filter((character): character is Character => Boolean(character));

    const vessel = participants.find((character) => character.id === party.getActive()?.id) ?? participants[0];
    const absorbedCharacters = participants.filter((character) => character !== vessel);
    if (!vessel.fuseToMaster(branch, absorbedCharacters)) {
        return {
            success: false,
            branch,
            absorbedCharacters: [],
            message: t('fusion.error.failed'),
        };
    }

    party.removeCharacters(new Set(absorbedCharacters.map((character) => character.id)));
    party.makeOnlyActive(vessel);

    return {
        success: true,
        branch,
        masterCharacter: vessel,
        absorbedCharacters,
        message: formatT('fusion.success', {
            name: vessel.name,
            master: i18n.lang === 'en' ? candidate.masterNameEn : candidate.masterNameKr,
        }),
    };
}
