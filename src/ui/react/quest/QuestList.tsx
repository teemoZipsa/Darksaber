import { getItemDef } from '../../../data/ItemDB';
import type { StoryQuestStatus } from '../../../data/StoryQuestData';
import { t } from '../../../i18n/LanguageManager';
import { useStore } from '../UiContext';

const STATUS_ICON: Record<StoryQuestStatus, string> = {
    active: '□',
    objectiveComplete: '◆',
    completed: '✓',
};

export function QuestList() {
    const store = useStore();
    const quests = store.getStoryQuestViews();

    return (
        <div className="ds-quest__body">
            {quests.map(({ quest, status, rewardOwned }) => {
                const reward = getItemDef(quest.rewardItemId);
                return (
                    <div key={quest.id} className={`ds-quest__row is-${status}`}>
                        <span className="ds-quest__status" aria-hidden>{STATUS_ICON[status]}</span>
                        <div className="ds-quest__info">
                            <div className="ds-quest__topline">
                                <span className="ds-quest__name">{t(quest.titleKey)}</span>
                                <span className="ds-quest__state">{t(`quest.status.${status}`)}</span>
                            </div>
                            <span className="ds-quest__desc">{t(quest.summaryKey)}</span>
                            <span className="ds-quest__objective">{t(quest.objectiveKey)}</span>
                        </div>
                        <span className="ds-quest__reward">
                            {t('quest.reward')}: {reward?.nameKr ?? quest.rewardItemId}
                            {rewardOwned ? ` ${t('quest.rewardOwned')}` : ''}
                        </span>
                    </div>
                );
            })}
            <div className="ds-quest__note">{t('quest.mainNote')}</div>
        </div>
    );
}
