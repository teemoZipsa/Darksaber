export type Language = 'ko' | 'en';

export const i18n = {
    lang: 'ko' as Language,

    strings: {
        ko: {
            // General
            'btn.deploy': '출격',
            'btn.language': 'Language: 한국어',
            
            // Lobby
            'lobby.title': '은신처',
            'lobby.stash': '창고',
            'lobby.roster': '대기소',
            
            // Inventory
            'inv.title': '⚔️ 장비 및 소지품',
            'inv.backpack': '공용 배낭',
            'inv.equipment': '장비',
            'inv.head': '머리',
            'inv.body': '갑옷',
            'inv.weapon': '무기',
            'inv.shield': '방패',
            'inv.accessory': '장신구',
            
            // Character Panel
            'char.partyTitle': '👤 캐릭터 파티',
            'char.partyList': '파티원 (클릭하여 전환)',
            'char.slotsUsed': '슬롯 사용 중',
            'char.active': '★ 활성',
            'char.switch': '▶ 전환',
            'char.stats': '능력치',
            'char.party': '출격 파티 (최대 4명)',
            'char.level': '레벨',
            'char.tier': '티어',
            
            // Stats
            'stat.hp': '생명력',
            'stat.mp': '마나',
            'stat.atk': '공격력',
            'stat.def': '방어력',
            'stat.magAtk': '마력',
            'stat.magDef': '마방',
            'stat.agi': '민첩성',
            'stat.mov': '이동력',

            // Raid & Engine
            'enemy.boss': '👿 타락한 거인',
            'raid.success': '탈출 성공',
            'raid.successDesc': '생존하여 배낭의 아이템을 확보했습니다.',
            'raid.mia': '실종 (MIA)',
            'raid.died': '사망',
            'raid.failDesc': '배낭의 모든 아이템과 전원의 장비를 1개씩 잃었습니다.',
            'raid.return': '클릭하거나 Enter를 눌러 은신처로 귀환하세요.',
        },
        en: {
            // General
            'btn.deploy': 'DEPLOY',
            'btn.language': 'Language: English',
            
            // Lobby
            'lobby.title': 'HIDEOUT',
            'lobby.stash': 'Stash',
            'lobby.roster': 'Roster',
            
            // Inventory
            'inv.title': '⚔️ Equipment & Inventory',
            'inv.backpack': 'Shared Backpack',
            'inv.equipment': 'Equipment',
            'inv.head': 'Head',
            'inv.body': 'Body',
            'inv.weapon': 'Weapon',
            'inv.shield': 'Shield',
            'inv.accessory': 'Accessory',
            
            // Character Panel
            'char.partyTitle': '👤 Character Party',
            'char.partyList': 'Party Members (Click to switch)',
            'char.slotsUsed': 'slots used',
            'char.active': '★ ACTIVE',
            'char.switch': '▶ SWITCH',
            'char.stats': 'Stats',
            'char.party': 'Raid Party (Max 4)',
            'char.level': 'Lv',
            'char.tier': 'Tier',
            
            // Stats
            'stat.hp': 'HP',
            'stat.mp': 'MP',
            'stat.atk': 'ATK',
            'stat.def': 'DEF',
            'stat.magAtk': 'MAG',
            'stat.magDef': 'M.DEF',
            'stat.agi': 'AGI',
            'stat.mov': 'MOV',

            // Raid & Engine
            'enemy.boss': '👿 Corrupted Giant',
            'raid.success': 'EXTRACTION SUCCESSFUL',
            'raid.successDesc': 'You survived and kept your backpack.',
            'raid.mia': 'MISSING IN ACTION',
            'raid.died': 'YOU DIED',
            'raid.failDesc': 'You lost your backpack and 1 random item piece per character.',
            'raid.return': 'Click or press Enter to return to Hideout.',
        }
    },

    setLanguage(l: Language) {
        this.lang = l;
    },

    toggleLanguage() {
        this.lang = this.lang === 'ko' ? 'en' : 'ko';
    },

    t(key: string): string {
        const dict = this.strings[this.lang] as Record<string, string>;
        return dict[key] || key;
    }
};

export function t(key: string): string {
    return i18n.t(key);
}
