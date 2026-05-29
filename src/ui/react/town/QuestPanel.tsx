/**
 * QuestPanel — DD-styled DOM replacement for the canvas quest board.
 * Placeholder quest list (Korean flavor text, as in the original canvas board);
 * the first-survival quest reflects real cleared state via the store.
 */

import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { useStore, useUiVersion } from '../UiContext';

interface QuestRow { id?: string; name: string; desc: string; reward: string; }

const QUESTS: QuestRow[] = [
    { id: 'quest:first_survival', name: '첫 생환', desc: '출발지가 아닌 다른 마을로 생환하기', reward: '200G' },
    { name: '위협 제거', desc: '보스 1마리 처치하기', reward: '전직 상점 해금' },
    { name: '약초 수집 (일일)', desc: '약초 3개를 마을로 가져오기', reward: '100G' },
    { name: '사냥터 정리 (일일)', desc: '적 10마리 처치하기', reward: '150G' },
];

export function QuestPanel() {
    useUiVersion();
    const store = useStore();
    const panelStyle = { width: 'min(560px, 92vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-quest" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.board')}</span>
            </div>

            <div className="ds-quest__body">
                {QUESTS.map((q, i) => {
                    const done = q.id ? store.isQuestDone(q.id) : false;
                    return (
                        <div key={q.id ?? i} className={`ds-quest__row${done ? ' is-done' : ''}`}>
                            <span className="ds-quest__status" aria-hidden>{done ? '✅' : '⬜'}</span>
                            <div className="ds-quest__info">
                                <span className="ds-quest__name">{q.name}</span>
                                <span className="ds-quest__desc">{q.desc}</span>
                            </div>
                            <span className="ds-quest__reward">{t('quest.reward')}: {q.reward}</span>
                        </div>
                    );
                })}
                <div className="ds-quest__note">{t('quest.sessionNote')}</div>
            </div>
        </div>
    );
}
