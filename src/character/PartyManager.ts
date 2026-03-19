/**
 * PartyManager — manages the player's party of up to 9 characters.
 * Main (active) character is always index 0.
 * Clicking another character instantly switches them to active.
 */

import { Character } from './Character';

export const MAX_PARTY_SIZE = 9;

export class PartyManager {
    // The active characters deployed in the raid (Max 4)
    private activeParty: Character[] = [];
    public readonly MAX_ACTIVE_PARTY_SIZE = 4;

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

    /** Switch active character by index */
    public switchTo(index: number): boolean {
        if (index < 0 || index >= this.activeParty.length) return false;
        this.activeIndex = index;
        return true;
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

    public isFull(): boolean {
        return this.activeParty.length >= this.MAX_ACTIVE_PARTY_SIZE;
    }
}
