import { AudioManager } from './AudioManager';

export function getTownMusicKey(townId: string): string {
    if (townId === 'w_forest_village' || townId === 'sw_hideout') return 'bgm.town.village';
    if (townId === 's_coast_town' || townId === 'se_port') return 'bgm.town.port';
    if (townId === 'nw_desert_city') return 'bgm.town.market';
    return 'bgm.town';
}

/** Short terrain changes must not repeatedly restart the soundtrack. */
export class GameMusic {
    private current: string | null = null;
    private candidate: string | null = null;
    private candidateSince = 0;

    public update(key: string, now: number): void {
        if (key === this.current) {
            this.candidate = null;
            return;
        }
        if (key !== this.candidate) {
            this.candidate = key;
            this.candidateSince = now;
        }
        const ambient = ['bgm.world', 'bgm.forest', 'bgm.cave', 'bgm.raid', 'bgm.boss', 'bgm.desert', 'bgm.mines'].includes(key);
        if (this.current && ambient && now - this.candidateSince < 2500) return;
        AudioManager.playBgm(key, { fadeMs: 900, volume: 0.7 });
        this.current = key;
        this.candidate = null;
    }
}
