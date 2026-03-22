/**
 * PartyManager — manages the player's party of up to 9 characters.
 * Main (active) character is always index 0.
 * Clicking another character instantly switches them to active.
 */

import { Character } from './Character';

export const MAX_PARTY_SIZE = 9;

export class PartyManager {
    // The active characters deployed in the raid (Max 3)
    private activeParty: Character[] = [];
    public readonly MAX_ACTIVE_PARTY_SIZE = 3;

    // The full roster of all owned characters (Pokemon PC style)
    private roster: Character[] = [];

    // The index of the currently controlled character in the activeParty
    private activeIndex: number = 0;

    /** Adds a new character to the overall roster */
    public addToRoster(char: Character): void {
        this.roster.push(char);
    }

    /** Deploys a character from the roster to the active raid party, if space allows */
    public deployCharacter(char: Character): boolean {
        if (this.activeParty.length >= this.MAX_ACTIVE_PARTY_SIZE) return false;
        if (this.activeParty.includes(char)) return false;
        
        this.activeParty.push(char);
        return true;
    }

    /** Removes a character from the active raid party (returns them to roster/stash state) */
    public unDeployCharacter(charId: string): boolean {
        const index = this.activeParty.findIndex(c => c.id === charId);
        if (index === -1) return false;
        
        // Cannot remove the last active character or if it's the 0th main slot (maybe allow later)
        if (this.activeParty.length <= 1) return false;

        this.activeParty.splice(index, 1);
        // Reset active index if needed
        if (this.activeIndex >= this.activeParty.length) {
            this.activeIndex = 0;
        }
        return true;
    }

    /** Swap two active slots during drag and drop */
    public swapActiveSlots(indexA: number, indexB: number): boolean {
        if (indexA < 0 || indexA >= this.activeParty.length || 
            indexB < 0 || indexB >= this.activeParty.length) return false;
        
        const temp = this.activeParty[indexA];
        this.activeParty[indexA] = this.activeParty[indexB];
        this.activeParty[indexB] = temp;
        return true;
    }

    /** Replaces a target slot with a new character. If already active, it swaps them */
    public replaceActiveSlot(targetIndex: number, newChar: Character): void {
        const existingIndex = this.activeParty.indexOf(newChar);
        
        if (existingIndex !== -1) {
            // It's a swap inside active
            this.swapActiveSlots(existingIndex, targetIndex);
            return;
        }

        if (targetIndex >= this.activeParty.length) {
            this.deployCharacter(newChar);
            return;
        }

        // It is replacing someone from roster into an occupied slot
        // Just overwrite the slot. The old character returns to roster natively because they are no longer in activeParty.
        this.activeParty[targetIndex] = newChar;
    }

    /** Switch active character by index */
    public switchTo(index: number): boolean {
        if (index < 0 || index >= this.activeParty.length) return false;
        // In raid, don't allow switching to dead characters
        if (this.activeParty[index].isDead) return false;
        this.activeIndex = index;
        return true;
    }

    /** Mark the active character as dead and try to switch to next alive */
    public markActiveDead(): Character | null {
        const active = this.activeParty[this.activeIndex];
        if (active) {
            active.isDead = true;
            active.exp = 0; // Reset EXP on death
        }

        // Find next alive character in the squad
        const next = this.getNextAlive();
        if (next !== null) {
            this.activeIndex = next;
            return this.activeParty[next];
        }
        return null; // squad wiped
    }

    /** Get index of next alive character in active party, or null */
    public getNextAlive(): number | null {
        for (let i = 0; i < this.activeParty.length; i++) {
            if (!this.activeParty[i].isDead) return i;
        }
        return null;
    }

    /** Are all active party members dead? */
    public isSquadWiped(): boolean {
        return this.activeParty.every(c => c.isDead);
    }

    /** Reset death states for all roster characters (after returning to shelter) */
    public resetForNewRaid(): void {
        for (const c of this.roster) {
            c.isDead = false;
            c.stats.hp = c.stats.maxHp;
            c.stats.mp = c.stats.maxMp;
        }
        this.activeIndex = 0;
    }

    /** Get the currently active character */
    public getActive(): Character | undefined {
        return this.activeParty[this.activeIndex];
    }

    public getActiveIndex(): number {
        return this.activeIndex;
    }

    public getCharacters(): Character[] {
        return this.activeParty;
    }

    public getRoster(): Character[] {
        return this.roster;
    }

    /** Swap two roster positions during drag and drop reorder */
    public swapRoster(indexA: number, indexB: number): boolean {
        if (indexA < 0 || indexA >= this.roster.length ||
            indexB < 0 || indexB >= this.roster.length) return false;
        const temp = this.roster[indexA];
        this.roster[indexA] = this.roster[indexB];
        this.roster[indexB] = temp;
        return true;
    }

    public isFull(): boolean {
        return this.activeParty.length >= this.MAX_ACTIVE_PARTY_SIZE;
    }
}
