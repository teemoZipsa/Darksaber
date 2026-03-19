/**
 * Entity — base class for all game objects (players, monsters, NPCs).
 */

export class Entity {
    public id: string;
    public gridX: number;
    public gridY: number;
    public color: string;
    public label: string;

    constructor(id: string, gridX: number, gridY: number, color: string, label: string = '') {
        this.id = id;
        this.gridX = gridX;
        this.gridY = gridY;
        this.color = color;
        this.label = label;
    }
}
