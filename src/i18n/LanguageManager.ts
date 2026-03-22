export type Language = 'ko' | 'en';

export const i18n = {
    lang: 'ko' as Language,

    strings: {
        ko: {
            // General UI
            'ui.title': '⚔️ Darksaber',
            'ui.subtitle': '그리드 SRPG 엔진 v0.1',
            'ui.ctrlMove': '↑↓←→ / WASD: 이동',
            'ui.ctrlMouse': '마우스: 정보 확인 / 공격',
            'ui.ctrlInv': 'Tab / I: 인벤토리',
            'ui.ctrlParty': 'P: 파티 편성',
            'ui.ctrlMinimap': 'M: 미니맵',
            'ui.ctrlAction': 'Space: 턴 넘기기',
            'ui.ctrlEsc': 'Esc: 취소 / 닫기',
            'ui.pos': '위치:',
            'ui.loading': '불러오는 중...',
            'ui.terrain': '지형',
            'ui.enemies': '적',

            // General
            'btn.deploy': '출격',
            'btn.language': 'Language: 한국어',
            'btn.settings': '설정',
            
            // Settings
            'settings.title': '환경 설정',
            'settings.general': '일반',
            'settings.lang': '언어',
            'settings.langValue': '한국어',
            'settings.display': '화면 표시',
            'settings.showGrid': '타일 그리드 보기',
            'settings.showFPS': 'FPS 표시',
            'settings.showHelp': '조작 안내 표시',
            'settings.audio': '오디오',
            'settings.bgm': '배경음악',
            'settings.sfx': '효과음',
            'settings.on': '켜기',
            'settings.off': '끄기',
            'settings.close': '닫기',
            
            // Lobby
            'lobby.title': '은신처',
            'lobby.stash': '창고',
            'lobby.roster': '대기소',
            
            // Inventory
            'inv.title': '⚔️ 장비 및 소지품',
            'inv.backpack': '공용 배낭',
            'inv.equipment': '장비',
            'inv.head': '머리',
            'inv.ring': '반지',
            'inv.necklace': '목걸이',
            
            // Party
            'party.title': '파티 편성',
            'party.roster': '대기 명단',
            'party.active': '현재 출격조',
            'party.leader': '리더',
            'party.cannotRemoveLead': '리더는 제외할 수 없습니다.',
            'party.full': '출격조가 가득 찼습니다.',
            'inv.body': '갑옷',
            'inv.weapon': '무기',
            'inv.shield': '방패',
            'inv.boots': '신발',
            'inv.accessory': '장신구',

            // Character Creation
            'create.title': '지휘관을 선택해주십시오',
            'create.fighter': '파이터',
            'create.knight': '나이트',
            'create.cleric': '클레릭',
            'create.magician': '매지션',
            'create.hp': '체력',
            'create.atk': '공격',
            'create.def': '방어',
            'create.mag': '마법',
            'create.namePrompt': '총 지휘관의 이름을 정하세요',
            'create.genderPrompt': '성별을 고르세요',
            'create.confirm': '확 인',
            
            // Shop
            'shop.title': '🏪 상점',
            'shop.buy': '구매',
            'shop.sell': '판매',
            'shop.gold': '골드',
            'shop.buyConfirm': '구매하시겠습니까?',
            'shop.soldItem': '아이템을 판매했습니다!',
            'shop.noGold': '골드가 부족합니다!',
            'shop.backpackFull': '배낭이 가득 찼습니다!',
            
            // Lobby Tabs
            'tab.inventory': '인벤토리',
            'tab.shop': '상점',
            'tab.party': '파티',
            
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
            
            // Character Info UI
            'info.title': '자기 정보',
            'info.name': '이름',
            'info.class': '직업',
            'info.level': '레벨',
            'info.exp': '경험',
            'info.age': '나이',
            'info.gender': '성별',
            'info.money': '돈',
            'info.statAdj': '능력조정',
            
            // Stats
            'stat.hp': '체력',
            'stat.mp': '마법력',
            'stat.atk': '공격력',
            'stat.def': '방어력',
            'stat.magAtk': '마법공격',
            'stat.magDef': '마법방어',
            'stat.agi': '민첩성',
            'stat.mov': '이동거리',
            // Extended Detailed Stats
            'stat.actionLimit': '행동제한',
            'stat.hit': '명중률',
            'stat.eva': '회피율',
            'stat.crit': '필살률',
            'stat.magHit': '마법명중',
            'stat.magEva': '마법회피',
            'stat.cmd': '지휘범위',
            'stat.atkMod': '공격수정',
            'stat.defMod': '방어수정',

            // Raid & Engine
            'enemy.boss': '👿 타락한 거인',
            'enemy.boss_giant': '👿 타락한 거인',
            'enemy.boss_drake': '🐉 그림자 드레이크',
            'enemy.boss_warden': '🔮 공허의 감시자',
            'raid.success': '탈출 성공',
            'raid.successDesc': '생존하여 배낭의 아이템을 확보했습니다.',
            'raid.mia': '실종 (MIA)',
            'raid.died': '사망',
            'raid.failDesc': '배낭의 모든 아이템과 전원의 장비를 1개씩 잃었습니다.',
            'raid.return': '클릭하거나 Enter를 눌러 은신처로 귀환하세요.',
            'raid.bossLoot': '보스 처치! 전리품 획득: ',
            'raid.bossSpawn': '강력한 적이 근처에 출현했습니다!',
            'raid.extraction': '🚁 탈출 지점 (20분 내 도달)',
            // Multiplayer
            'mp.online': '온라인: ',
            'mp.players': '명',
            'mp.joined': '님이 접속했습니다.',
            'mp.left': '님이 떠났습니다.',
            'mp.connect': '접속',
            'mp.disconnect': '연결 해제',
            'mp.server': '서버 주소',
            'mp.connecting': '접속 중...',
            'mp.connected': '접속됨',
            'mp.disconnected': '미접속',

            // Terrain
            'tile.grass': '잔디',
            'tile.stone': '돌',
            'tile.water': '물',
            'tile.wall': '벽',
            'tile.lava': '용암',
            'tile.sand': '모래',
            'tile.forest': '숲',
            'tile.road': '길',

            // Combat Log
            'log.deployed': '레이드에 배치되었습니다!',
            'log.hitYou': '이(가) 당신에게 {dmg} 데미지!',
            'log.missedYou': '이(가) 공격 실패!',
            'log.youDied': '사망했습니다.',
            'log.noEnemy': '인접한 적이 없습니다.',
            'log.extraction': '탈출 지점에 도달했습니다!',
            'log.lostItem': '이(가) {slot}을(를) 잃었습니다.',
        },
        en: {
            // General UI
            'ui.title': '⚔️ Darksaber',
            'ui.subtitle': 'Grid SRPG Engine v0.1',
            'ui.ctrlMove': '↑↓←→ / WASD: Move',
            'ui.ctrlMouse': 'Mouse: Hover / Attack',
            'ui.ctrlInv': 'Tab / I: Inventory',
            'ui.ctrlParty': 'P: Party',
            'ui.ctrlMinimap': 'M: Minimap',
            'ui.ctrlAction': 'Space: Skip Turn',
            'ui.ctrlEsc': 'Esc: Cancel / Close',
            'ui.pos': 'Pos:',
            'ui.loading': 'Loading...',
            'ui.terrain': 'Terrain',
            'ui.enemies': 'Enemies',

            // General
            'btn.deploy': 'DEPLOY',
            'btn.language': 'Language: English',
            'btn.settings': 'Settings',
            
            // Settings
            'settings.title': 'Settings',
            'settings.general': 'General',
            'settings.lang': 'Language',
            'settings.langValue': 'English',
            'settings.display': 'Display',
            'settings.showGrid': 'Show Tile Grid',
            'settings.showFPS': 'Show FPS',
            'settings.showHelp': 'Show Control Help',
            'settings.audio': 'Audio',
            'settings.bgm': 'Background Music',
            'settings.sfx': 'Sound Effects',
            'settings.on': 'ON',
            'settings.off': 'OFF',
            'settings.close': 'Close (X)',
            
            // Lobby
            'lobby.title': 'HIDEOUT',
            'lobby.stash': 'Stash',
            'lobby.roster': 'Roster',
            
            // Inventory
            'inv.title': '⚔️ Equipment & Inventory',
            'inv.backpack': 'Shared Backpack',
            'inv.equipment': 'Equipment',
            'inv.head': 'Head',
            'inv.ring': 'Ring',
            'inv.necklace': 'Necklace',
            
            // Party
            'party.title': 'Party Assembly',
            'party.roster': 'PC Box (Roster)',
            'party.active': 'Active Squad',
            'party.leader': 'Leader',
            'party.cannotRemoveLead': 'Cannot remove the leader.',
            'party.full': 'Active squad is full.',
            'inv.body': 'Body',
            'inv.weapon': 'Weapon',
            'inv.shield': 'Shield',
            'inv.boots': 'Boots',
            'inv.accessory': 'Accessory',

            // Character Creation
            'create.title': 'Please select a commander',
            'create.fighter': 'Fighter',
            'create.knight': 'Knight',
            'create.cleric': 'Cleric',
            'create.magician': 'Magician',
            'create.hp': 'HP',
            'create.atk': 'Attack',
            'create.def': 'Defense',
            'create.mag': 'Magic',
            'create.namePrompt': 'Enter your player nickname',
            'create.genderPrompt': 'Select gender',
            'create.confirm': 'Confirm',
            
            // Shop
            'shop.title': '🏪 Merchant',
            'shop.buy': 'BUY',
            'shop.sell': 'SELL',
            'shop.gold': 'Gold',
            'shop.buyConfirm': 'Purchase this item?',
            'shop.soldItem': 'Item sold!',
            'shop.noGold': 'Not enough gold!',
            'shop.backpackFull': 'Backpack is full!',
            
            // Lobby Tabs
            'tab.inventory': 'Inventory',
            'tab.shop': 'Shop',
            'tab.party': 'Party',
            
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
            
            // Character Info UI
            'info.title': 'Self Information',
            'info.name': 'Name',
            'info.class': 'Class',
            'info.level': 'Level',
            'info.exp': 'Experience',
            'info.age': 'Age',
            'info.gender': 'Gender',
            'info.money': 'Money',
            'info.statAdj': 'Stat Adjustment',

            // Stats
            'stat.hp': 'HP',
            'stat.mp': 'MP',
            'stat.atk': 'ATK',
            'stat.def': 'DEF',
            'stat.magAtk': 'MAG Hit',
            'stat.magDef': 'MAG Def',
            'stat.agi': 'AGI',
            'stat.mov': 'MOV',
            // Extended Detailed Stats
            'stat.actionLimit': 'Action Limit',
            'stat.hit': 'Accuracy',
            'stat.eva': 'Evasion',
            'stat.crit': 'Crit Rate',
            'stat.magHit': 'Mag Acc',
            'stat.magEva': 'Mag Eva',
            'stat.cmd': 'Cmd Range',
            'stat.atkMod': 'Atk Mod',
            'stat.defMod': 'Def Mod',

            // Raid & Engine
            'enemy.boss': '👿 Corrupted Giant',
            'enemy.boss_giant': '👿 Corrupted Giant',
            'enemy.boss_drake': '🐉 Shadow Drake',
            'enemy.boss_warden': '🔮 Void Warden',
            'raid.success': 'EXTRACTION SUCCESSFUL',
            'raid.successDesc': 'You survived and kept your backpack.',
            'raid.mia': 'MISSING IN ACTION',
            'raid.died': 'YOU DIED',
            'raid.failDesc': 'You lost your backpack and 1 random item piece per character.',
            'raid.return': 'Click or press Enter to return to Hideout.',
            'raid.bossLoot': 'Boss killed! Loot acquired: ',
            'raid.bossSpawn': 'A powerful enemy has appeared nearby!',
            'raid.extraction': '🚁 Extraction Point (reach within 20 min)',
            // Multiplayer
            'mp.online': 'Online: ',
            'mp.players': ' players',
            'mp.joined': ' has joined.',
            'mp.left': ' has left.',
            'mp.connect': 'Connect',
            'mp.disconnect': 'Disconnect',
            'mp.server': 'Server URL',
            'mp.connecting': 'Connecting...',
            'mp.connected': 'Connected',
            'mp.disconnected': 'Disconnected',

            // Terrain
            'tile.grass': 'Grass',
            'tile.stone': 'Stone',
            'tile.water': 'Water',
            'tile.wall': 'Wall',
            'tile.lava': 'Lava',
            'tile.sand': 'Sand',
            'tile.forest': 'Forest',
            'tile.road': 'Road',

            // Combat Log
            'log.deployed': 'Deployed into the Raid!',
            'log.hitYou': ' hits you for {dmg}!',
            'log.missedYou': ' missed you!',
            'log.youDied': 'You have died.',
            'log.noEnemy': 'No enemy adjacent to attack.',
            'log.extraction': 'Entered Extraction Zone!',
            'log.lostItem': ' lost their {slot}.',
        }
    },

    listeners: [] as (() => void)[],

    subscribe(cb: () => void) {
        this.listeners.push(cb);
    },

    notify() {
        this.listeners.forEach(cb => cb());
    },

    setLanguage(l: Language) {
        this.lang = l;
        this.notify();
    },

    toggleLanguage() {
        this.lang = this.lang === 'ko' ? 'en' : 'ko';
        this.notify();
    },

    t(key: string): string {
        const dict = this.strings[this.lang] as Record<string, string>;
        return dict[key] || key;
    }
};

export function t(key: string): string {
    return i18n.t(key);
}
