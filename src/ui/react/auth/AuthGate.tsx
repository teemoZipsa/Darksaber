import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { CHAR_CLASSES, type StartingClassId } from '../../../data/characterClasses';
import { AuthApiError, AuthClient, type AccountMeResponse, type AuthCharacter, type AuthSessionResponse } from '../../../net/AuthClient';
import { NetworkRaidClient } from '../../../net/NetworkRaidClient';
import type { GameManager } from '../../../engine/GameManager';

type Screen = 'loading' | 'auth' | 'select' | 'create' | 'playing';

interface AuthGateProps {
    client: AuthClient;
    gameManager: GameManager;
}

export function AuthGate({ client, gameManager }: AuthGateProps) {
    const [screen, setScreen] = useState<Screen>('loading');
    const [account, setAccount] = useState<AuthSessionResponse | AccountMeResponse | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        void client.refresh()
            .then((session) => {
                if (cancelled) return;
                gameManager.updateNetworkAccessToken(session.accessToken);
                setAccount(session);
                setScreen(session.characters.length > 0 ? 'select' : 'create');
            })
            .catch(() => {
                if (!cancelled) setScreen((current) => current === 'loading' ? 'auth' : current);
            });
        return () => { cancelled = true; };
    }, [client, gameManager]);

    useEffect(() => {
        if (screen !== 'select' && screen !== 'create' && screen !== 'playing') return undefined;
        const id = window.setInterval(() => {
            void client.refresh()
                .then((session) => {
                    gameManager.updateNetworkAccessToken(session.accessToken);
                    setAccount((current) => current ? { ...current, accountProgress: session.accountProgress } : session);
                })
                .catch((nextError) => {
                    if (shouldReturnToAuthAfterRefreshFailure(screen, nextError)) setScreen('auth');
                });
        }, 10 * 60 * 1000);
        return () => window.clearInterval(id);
    }, [client, gameManager, screen]);

    if (screen === 'playing') return null;

    const showError = (nextError: unknown) => {
        if (nextError instanceof AuthApiError) setError(errorText(nextError.code));
        else setError(t('auth.error.generic'));
    };

    const onSession = (session: AuthSessionResponse) => {
        setError('');
        setAccount(session);
        setScreen(session.characters.length > 0 ? 'select' : 'create');
    };

    const selectCharacter = async (characterId: string) => {
        try {
            const selected = await client.selectCharacter(characterId);
            const accessToken = client.getAccessToken();
            if (!accessToken) throw new Error('missing access token');
            gameManager.enterAuthenticatedCharacter({
                accessToken,
                character: selected.character,
                save: selected.save,
                accountProgress: selected.accountProgress,
                authClient: client,
            });
            setScreen('playing');
        } catch (nextError) {
            showError(nextError);
        }
    };

    const createCharacter = async (name: string, classKey: StartingClassId, gender: 'M' | 'F') => {
        try {
            const created = await client.createCharacter(name, classKey, gender);
            await selectCharacter(created.character.id);
        } catch (nextError) {
            showError(nextError);
        }
    };

    const deleteCharacter = async (characterId: string) => {
        try {
            await client.deleteCharacter(characterId);
            const nextAccount = await client.me();
            setAccount(nextAccount);
            setError('');
            setScreen(nextAccount.characters.length > 0 ? 'select' : 'create');
        } catch (nextError) {
            showError(nextError);
            throw nextError;
        }
    };

    const logout = async () => {
        try {
            await client.logout();
        } catch {
            // Local logout should still complete if the auth server is unavailable.
        } finally {
            NetworkRaidClient.clearStoredResumeTokens();
        }
        setAccount(null);
        setError('');
        setScreen('auth');
    };

    return (
        <div className="auth-root">
            <div className="auth-shell">
                {screen === 'loading' && <div className="auth-status">{t('auth.loading')}</div>}
                {screen === 'auth' && (
                    <AuthForm
                        error={error}
                        onError={showError}
                        onSession={onSession}
                        client={client}
                    />
                )}
                {screen === 'select' && account && (
                    <CharacterSelect
                        characters={account.characters}
                        lastSelectedCharacterId={account.lastSelectedCharacterId}
                        error={error}
                        onSelect={selectCharacter}
                        onDelete={deleteCharacter}
                        onCreate={() => { setError(''); setScreen('create'); }}
                        onLogout={logout}
                    />
                )}
                {screen === 'create' && (
                    <CharacterCreate
                        error={error}
                        onCreate={createCharacter}
                        onBack={account?.characters.length ? () => { setError(''); setScreen('select'); } : undefined}
                        onLogout={logout}
                    />
                )}
            </div>
        </div>
    );
}

function AuthForm({ client, error, onError, onSession }: {
    client: AuthClient;
    error: string;
    onError: (error: unknown) => void;
    onSession: (session: AuthSessionResponse) => void;
}) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [loginName, setLoginName] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            onSession(mode === 'login'
                ? await client.login(loginName, password)
                : await client.register(loginName, password));
        } catch (nextError) {
            onError(nextError);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="auth-panel" onSubmit={submit}>
            <div className="auth-panel__title">{t('auth.title')}</div>
            <div className="auth-tabs" role="tablist">
                <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>{t('auth.login')}</button>
                <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>{t('auth.register')}</button>
            </div>
            <label className="auth-field">
                <span>{t('auth.loginName')}</span>
                <input value={loginName} autoComplete="username" maxLength={32} onChange={(event) => setLoginName(event.target.value)} />
            </label>
            <label className="auth-field">
                <span>{t('auth.password')}</span>
                <input value={password} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-primary" disabled={busy}>{busy ? t('auth.busy') : mode === 'login' ? t('auth.login') : t('auth.register')}</button>
        </form>
    );
}

function CharacterSelect({ characters, lastSelectedCharacterId, error, onSelect, onDelete, onCreate, onLogout }: {
    characters: AuthCharacter[];
    lastSelectedCharacterId: string | null;
    error: string;
    onSelect: (characterId: string) => void;
    onDelete: (characterId: string) => Promise<void>;
    onCreate: () => void;
    onLogout: () => void;
}) {
    const [deleteTarget, setDeleteTarget] = useState<AuthCharacter | null>(null);
    const [confirmName, setConfirmName] = useState('');
    const [deleteBusy, setDeleteBusy] = useState(false);
    const lastSelected = useMemo(
        () => characters.find((character) => character.id === lastSelectedCharacterId) ?? characters[0],
        [characters, lastSelectedCharacterId]
    );

    useEffect(() => {
        if (deleteTarget && !characters.some((character) => character.id === deleteTarget.id)) {
            setDeleteTarget(null);
            setConfirmName('');
        }
    }, [characters, deleteTarget]);

    const openDeleteConfirm = (character: AuthCharacter) => {
        setDeleteTarget(character);
        setConfirmName('');
    };

    const closeDeleteConfirm = () => {
        if (deleteBusy) return;
        setDeleteTarget(null);
        setConfirmName('');
    };

    const submitDelete = async (event: FormEvent) => {
        event.preventDefault();
        if (!deleteTarget || confirmName !== deleteTarget.name || deleteBusy) return;
        setDeleteBusy(true);
        try {
            await onDelete(deleteTarget.id);
            setDeleteTarget(null);
            setConfirmName('');
        } catch {
            // Parent error state renders below; keep the confirmation open.
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <div className="auth-panel auth-panel--wide">
            <div className="auth-panel__title">{t('auth.characters')}</div>
            {lastSelected && (
                <button className="auth-continue" onClick={() => onSelect(lastSelected.id)}>
                    <span>{t('auth.continue')}</span>
                    <strong>{lastSelected.name}</strong>
                </button>
            )}
            <div className="auth-character-grid">
                {characters.map((character) => (
                    <div key={character.id} className="auth-character-card">
                        <button type="button" className="auth-character-card__select" onClick={() => onSelect(character.id)}>
                            <span className="auth-character-card__slot">{t('auth.slot')} {character.slotNo + 1}</span>
                            <strong>{character.name}</strong>
                            <span>{classLabel(character.classKey)} · Lv {character.level}</span>
                        </button>
                        <button type="button" className="auth-character-card__delete" onClick={() => openDeleteConfirm(character)}>
                            {t('auth.deleteCharacter')}
                        </button>
                    </div>
                ))}
            </div>
            {deleteTarget && (
                <form className="auth-delete-confirm" onSubmit={submitDelete}>
                    <div className="auth-delete-confirm__title">{t('auth.deleteConfirmTitle')}</div>
                    <p>
                        {t('auth.deleteConfirmBody')} <strong>{deleteTarget.name}</strong>
                    </p>
                    <label className="auth-field">
                        <span>{t('auth.deleteConfirmName')}</span>
                        <input
                            value={confirmName}
                            maxLength={24}
                            autoComplete="off"
                            placeholder={t('auth.deleteConfirmPlaceholder')}
                            onChange={(event) => setConfirmName(event.target.value)}
                            disabled={deleteBusy}
                        />
                    </label>
                    <div className="auth-delete-confirm__actions">
                        <button type="button" onClick={closeDeleteConfirm} disabled={deleteBusy}>{t('auth.cancel')}</button>
                        <button type="submit" className="auth-danger" disabled={confirmName !== deleteTarget.name || deleteBusy}>
                            {deleteBusy ? t('auth.busy') : t('auth.deleteConfirmAction')}
                        </button>
                    </div>
                </form>
            )}
            {error && <div className="auth-error">{error}</div>}
            <div className="auth-actions">
                <button type="button" onClick={onCreate}>{t('auth.createCharacter')}</button>
                <button type="button" onClick={onLogout}>{t('auth.logout')}</button>
            </div>
        </div>
    );
}

function CharacterCreate({ error, onCreate, onBack, onLogout }: {
    error: string;
    onCreate: (name: string, classKey: StartingClassId, gender: 'M' | 'F') => void;
    onBack?: () => void;
    onLogout: () => void;
}) {
    const [name, setName] = useState(() => t('create.defaultName'));
    const [classKey, setClassKey] = useState<StartingClassId>('infantry');
    const [gender, setGender] = useState<'M' | 'F'>('M');
    const selectedClass = CHAR_CLASSES.find((entry) => entry.id === classKey) ?? CHAR_CLASSES[0];
    return (
        <div className="auth-panel auth-panel--wide">
            <div className="auth-panel__title">{t('auth.createCharacter')}</div>
            <div className="auth-create-layout">
                <div className="auth-class-list">
                    {CHAR_CLASSES.map((entry) => (
                        <button key={entry.id} className={entry.id === classKey ? 'is-active' : ''} onClick={() => setClassKey(entry.id)}>
                            <img src={entry.imageSrc} alt="" />
                            <span>{t(entry.labelKey)}</span>
                        </button>
                    ))}
                </div>
                <div className="auth-create-fields">
                    <label className="auth-field">
                        <span>{t('create.namePrompt')}</span>
                        <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <div className="auth-tabs" role="radiogroup" aria-label={t('create.genderPrompt')}>
                        <button type="button" className={gender === 'M' ? 'is-active' : ''} onClick={() => setGender('M')}>{t('create.male')}</button>
                        <button type="button" className={gender === 'F' ? 'is-active' : ''} onClick={() => setGender('F')}>{t('create.female')}</button>
                    </div>
                    <div className="auth-selected-class">{t(selectedClass.labelKey)}</div>
                    {error && <div className="auth-error">{error}</div>}
                    <button className="auth-primary" onClick={() => onCreate(name, classKey, gender)}>{t('create.confirm')}</button>
                </div>
            </div>
            <div className="auth-actions">
                {onBack && <button type="button" onClick={onBack}>{t('auth.back')}</button>}
                <button type="button" onClick={onLogout}>{t('auth.logout')}</button>
            </div>
        </div>
    );
}

function classLabel(classKey: StartingClassId): string {
    const config = CHAR_CLASSES.find((entry) => entry.id === classKey);
    return config ? t(config.labelKey) : classKey;
}

function errorText(code: string): string {
    const key = `auth.error.${code}`;
    const translated = t(key);
    return translated === key ? t('auth.error.generic') : translated;
}

export function shouldReturnToAuthAfterRefreshFailure(screen: Screen, error: unknown): boolean {
    if (screen === 'playing') return false;
    return error instanceof AuthApiError
        && error.status === 401
        && error.code !== 'refresh_stale';
}
