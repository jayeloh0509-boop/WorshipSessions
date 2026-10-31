import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthView } from '../AuthView';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  api: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login: mocks.login }) }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('../../lib/api', () => ({ api: mocks.api }));

describe('AuthView entry experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.mockResolvedValue({
      allowRegistration: true,
      invitesEnabled: true,
      turnstileSiteKey: null,
      demoMode: false,
    });
  });

  it('presents the brand panel and an accessible sign-in form', async () => {
    render(<AuthView navigate={vi.fn()} />);

    expect(screen.getByRole('complementary', { name: 'WorshipSessions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'WorshipSessions features' })).toHaveTextContent('Chord charts');
    expect(screen.getByRole('group', { name: 'Account access' })).toBeInTheDocument();
    expect(screen.getByLabelText('auth.username')).toHaveAttribute('id', 'auth-user');
    expect(screen.getByLabelText('auth.password')).toHaveAttribute('id', 'auth-password');
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('GET', '/api/auth/config'));
  });

  it('switches to registration without losing the focused account form', () => {
    render(<AuthView navigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'auth.register' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.register' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('auth.password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('keeps the invite-only flow available and announces missing required fields', async () => {
    mocks.api.mockResolvedValue({
      allowRegistration: false,
      invitesEnabled: true,
      turnstileSiteKey: null,
      demoMode: false,
    });
    render(<AuthView navigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'auth.haveInvite' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Join your workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText('auth.inviteCode')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'auth.createAccount' }));
    expect(screen.getByRole('alert')).toHaveTextContent('auth.fillAllFields');
  });
});
