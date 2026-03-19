/**
 * PartyManager — manages the player's party of up to 9 characters.
 * Main (active) character is always index 0.
 * Clicking another character instantly switches them to active.
 */

import { Character } from './Character';

export const MAX_PARTY_SIZE = 9;

export class PartyManager {
    private characters: Character[] = [];
    private activeIndex: number = 0;

    /** Add a character to the party. Returns false if party is full. */
    public addCharacter(char: Character): boolean {
        if (this.characters.length >= MAX_PARTY_SIZE) return false;
        this.characters.push(char);
        return true;
    }

    /** Remove a character (can't remove the last one) */
    public removeCharacter(index: number): boolean {
        if (this.characters.length <= 1) return false;
        if (index < 0 || index >= this.characters.length) return false;
        this.characters.splice(index, 1);
        if (this.activeIndex >= this.characters.length) {
            this.activeIndex = 0;
        }
        return true;
    }

    /** Switch active character by index */
    public switchTo(index: number): boolean {
        if (index < 0 || index >= this.characters.length) return false;
        this.activeIndex = index;
        return true;
    }

    /** Get the currently active character */
    public getActive(): Character | undefined {
        return this.characters[this.activeIndex];
    }

    public getActiveIndex(): number {
        return this.activeIndex;
    }

    /** Get all characters */
    public getAll(): Character[] {
        return this.characters;
    }

    public getSize(): number {
        return this.characters.length;
    }

    public isFull(): boolean {
        return this.characters.length >= MAX_PARTY_SIZE;
    }
}
