import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; username: string; role: string },
  isAdmin: false,
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../context/DemoContext', () => ({ useDemo: () => ({ setDemoMode: vi.fn() }) }));
vi.mock('../components/Nav', () => ({ Nav: () => <div data-testid="navigation">Navigation</div> }));
vi.mock('../components/DemoBanner', () => ({ DemoBanner: () => <div data-testid="demo-banner">Demo</div> }));
vi.mock('../components/Toast', () => ({ Toast: () => <div data-testid="toast" /> }));
vi.mock('../views/AuthView', () => ({ AuthView: () => <div>Sign in or register</div> }));
vi.mock('../views/BrowseView', () => ({ BrowseView: () => <div>Song library</div> }));
vi.mock('../views/SetlistPlayView', () => ({ SetlistPlayView: () => <div>Setlist player</div> }));
vi.mock('../lib/api', () => ({ api: vi.fn(() => Promise.resolve({ demoMode: false })) }));

import { App } from '../App';

describe('App authentication gate', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isAdmin = false;
    location.hash = '';
  });

  it('shows only the authentication screen to signed-out visitors', () => {
    render(<App />);

    expect(screen.getByText('Sign in or register')).toBeInTheDocument();
    expect(screen.queryByText('Song library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument();
  });

  it('renders the application for signed-in users', () => {
    authState.user = { id: 1, username: 'member', role: 'user' };
    render(<App />);

    expect(screen.getByText('Song library')).toBeInTheDocument();
    expect(screen.getByTestId('navigation')).toBeInTheDocument();
    expect(screen.queryByText('Sign in or register')).not.toBeInTheDocument();
    expect(document.getElementById('app')).toHaveClass('app-with-nav');
  });

  it('keeps the setlist player edge-to-edge without the desktop navigation offset', () => {
    authState.user = { id: 1, username: 'member', role: 'user' };
    location.hash = '#setlist/42/play';
    render(<App />);

    expect(screen.getByText('Setlist player')).toBeInTheDocument();
    expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
    expect(document.getElementById('app')).not.toHaveClass('app-with-nav');
  });
});
