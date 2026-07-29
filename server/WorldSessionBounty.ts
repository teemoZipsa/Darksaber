import {
    BOUNTY_PROOF_ITEM_ID,
    isBountyRiskCompleted,
    resolveBountyContract,
} from '../src/data/BountyContractData';
import type { BountySettlementSummary } from '../src/net/WorldProtocol';
import { addCarriedItemQuantity } from './WorldSessionCarryState';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type { ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export function recordBountyTargetKill(
    player: ServerPlayer,
    target: ServerEnemy,
): boolean {
    const bounty = player.bounty;
    if (
        !bounty
        || target.bountyPlayerId !== player.id
        || target.bountyContractId !== bounty.contractId
        || target.enemy.id !== bounty.targetEnemyId
    ) {
        return false;
    }
    const contract = resolveBountyContract(bounty.contractId);
    if (!contract) return false;
    bounty.targetEnemyId = null;
    bounty.proofEarned = true;
    bounty.riskCompleted = isBountyRiskCompleted(contract, {
        elapsedSeconds: player.elapsedSeconds,
        hadActorDown: bounty.hadActorDown,
        killsIncludingTarget: player.kills,
    });
    return true;
}

export function settleSurvivedBounty(
    player: ServerPlayer,
    saveState: WorldSessionSaveState,
): BountySettlementSummary | undefined {
    const bounty = player.bounty;
    const contract = resolveBountyContract(bounty?.contractId);
    if (
        !bounty
        || !contract
        || !bounty.proofEarned
        || (player.carriedItems.get(BOUNTY_PROOF_ITEM_ID) ?? 0) <= 0
        || player.saveSnapshot?.questState.activeBountyContractId !== contract.id
    ) {
        return undefined;
    }
    if (!saveState.tryRemoveItemQuantity(player, BOUNTY_PROOF_ITEM_ID, 1)) {
        return undefined;
    }
    const riskCompleted = bounty.riskCompleted === true;
    const bonusReward = riskCompleted ? contract.bonusGold : 0;
    const totalReward = contract.rewardGold + bonusReward;
    player.raidGoldReward += totalReward;
    addCarriedItemQuantity(player, BOUNTY_PROOF_ITEM_ID, -1);
    player.saveSnapshot.questState.activeBountyContractId = null;
    return {
        contractId: contract.id,
        baseReward: contract.rewardGold,
        bonusReward,
        riskCompleted,
        totalReward,
    };
}
