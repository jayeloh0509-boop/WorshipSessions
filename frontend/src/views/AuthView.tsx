import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../lib/api';
import type { AuthConfig, AuthResponse } from '../types';

interface AuthViewProps {
  navigate: (view: string) => void;
}

export function AuthView({ navigate }: AuthViewProps) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<'login' | 'register' | 'invite'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<AuthConfig>({
    allowRegistration: true,
    invitesEnabled: false,
    turnstileSiteKey: null,
    demoMode: false,
  });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const inviteRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<AuthConfig>('GET', '/api/auth/config')
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.demoMode) {
          setUsername('demo');
          setPassword('demopass123');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'invite' && inviteRef.current) inviteRef.current.focus();
    else if (userRef.current) userRef.current.focus();
  }, [tab]);

  useEffect(() => {
    const siteKey = config.turnstileSiteKey;
    if (!siteKey || tab === 'login') return;
    setTurnstileToken(null);

    const scriptId = 'cf-turnstile-script';
    const renderWidget = () => {
      const w = window as unknown as {
        turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => void };
      };
      if (turnstileRef.current && w.turnstile) {
        while (turnstileRef.current.firstChild) turnstileRef.current.removeChild(turnstileRef.current.firstChild);
        w.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: (token: string) => setTurnstileToken(token),
        });
      }
    };

    if (document.getElementById(scriptId)) {
      renderWidget();
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, [config.turnstileSiteKey, tab]);

  const submit = async () => {
    setError('');
    if (tab === 'invite') {
      if (!inviteCode || !username || !password) {
        setError(t('auth.fillAllFields'));
        return;
      }
      try {
        const data = await api<AuthResponse>('POST', '/api/auth/redeem-invite', {
          code: inviteCode,
          username,
          password,
          turnstile_token: turnstileToken,
        });
        login(data);
        navigate('browse');
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    if (!username || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }
    try {
      const effectiveTab = !config.allowRegistration ? 'login' : tab;
      const endpoint = effectiveTab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        effectiveTab === 'login' ? { username, password } : { username, password, turnstile_token: turnstileToken };
      const data = await api<AuthResponse>('POST', endpoint, body);
      login(data);
      navigate('browse');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };
  const showTabs = config.allowRegistration;
  const showInviteLink = !config.allowRegistration && config.invitesEnabled && tab !== 'invite';

  return (
    <div className="auth-entry">
      <div className="auth-entry-shell">
        <aside className="auth-brand-panel" aria-label="WorshipSessions">
          <div className="auth-brand-lockup">
            <div className="auth-logo">{t('auth.logo')}</div>
            <div className="auth-tagline">Charts, Keys, Setlists.</div>
          </div>
          <div className="auth-brand-message">
            <p className="auth-brand-copy">Keep every chart clear, every key ready, and every setlist close at hand.</p>
            <ul className="auth-feature-list" aria-label="WorshipSessions features">
              <li><span aria-hidden="true">♪</span>Chord charts</li>
              <li><span aria-hidden="true">◈</span>Setlists</li>
              <li><span aria-hidden="true">▣</span>Live Mode</li>
            </ul>
          </div>
          <svg className="auth-stage-art" viewBox="0 0 520 190" fill="none" aria-hidden="true">
            <path d="M18 37H502M18 66H502M18 95H502M18 124H502M18 153H502" />
            <path className="auth-stage-stem" d="M106 95V27M250 124V56M393 66V12" />
            <ellipse cx="96" cy="99" rx="16" ry="10" transform="rotate(-18 96 99)" />
            <ellipse cx="240" cy="128" rx="16" ry="10" transform="rotate(-18 240 128)" />
            <ellipse cx="383" cy="70" rx="16" ry="10" transform="rotate(-18 383 70)" />
            <path className="auth-stage-accent" d="M106 27L122 33M250 56L266 62M393 12L409 18" />
          </svg>
        </aside>
        <section className="auth-form-panel" id="auth-form-panel" aria-labelledby="auth-heading">
          <div className="auth-form-content">
            <div className="auth-form-heading">
              <h1 id="auth-heading">{tab === 'login' ? 'Welcome back' : tab === 'invite' ? 'Join your workspace' : 'Create your account'}</h1>
              <p>{tab === 'login' ? 'Sign in to continue rehearsing.' : 'Set up your worship workspace in a moment.'}</p>
            </div>
            {showTabs && (
              <div className="auth-tabs" role="group" aria-label="Account access">
                <button
                  className={`auth-tab${tab === 'login' ? ' active' : ''}`}
                  type="button"
                  aria-pressed={tab === 'login'}
                  aria-controls="auth-form-panel"
                  onClick={() => setTab('login')}
                >
                  {t('auth.signIn')}
                </button>
                <button
                  className={`auth-tab${tab !== 'login' ? ' active' : ''}`}
                  type="button"
                  aria-pressed={tab !== 'login'}
                  aria-controls="auth-form-panel"
                  onClick={() => setTab('register')}
                >
                  {t('auth.register')}
                </button>
              </div>
            )}
            {tab === 'invite' && (
              <div className="field">
                <label htmlFor="auth-invite-code">{t('auth.inviteCode')}</label>
                <input
                  id="auth-invite-code"
                  type="text"
                  ref={inviteRef}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={t('auth.inviteCodePlaceholder')}
                  autoComplete="off"
                  onKeyDown={onKeyDown}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-user">{t('auth.username')}</label>
              <input
                type="text"
                ref={userRef}
                id="auth-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                autoComplete="username"
                onKeyDown={onKeyDown}
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">{t('auth.password')}</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                onKeyDown={onKeyDown}
              />
            </div>
            {config.turnstileSiteKey && tab !== 'login' && <div ref={turnstileRef} style={{ marginTop: 8 }} />}
            <button className="btn btn-full auth-submit" id="auth-submit" type="button" onClick={submit}>
              {tab === 'invite'
                ? t('auth.createAccount')
                : tab === 'login' || !showTabs
                  ? t('auth.signIn')
                  : t('auth.createAccount')}
            </button>
            {showInviteLink && (
              <button className="btn btn-ghost btn-full auth-invite-link" type="button" onClick={() => setTab('invite')}>
                {t('auth.haveInvite')}
              </button>
            )}
            {tab === 'invite' && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setTab('login');
                  }}
                  style={{ fontSize: 13, color: 'var(--muted)' }}
                >
                  {t('auth.backToLogin')}
                </a>
              </div>
            )}
            {error && <div className="auth-error" role="alert">{error}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
