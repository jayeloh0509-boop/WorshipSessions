import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Nav } from '../Nav';

const mockAuth = vi.hoisted(() => ({
  user: null as { id: number; username: string; role: string } | null,
  isAdmin: false,
  logout: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

function drawer() {
  return document.getElementById('nav-drawer')!;
}

describe('Nav drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = null;
    mockAuth.isAdmin = false;
  });

  it('renders the drawer and backdrop outside #nav so fixed positioning is not clipped', () => {
    render(<Nav view="browse" navigate={() => {}} />);
    expect(drawer().closest('nav')).toBeNull();
    expect(document.querySelector('.nav-drawer-backdrop')!.closest('nav')).toBeNull();
  });

  it('opens on hamburger click and closes via the close button', async () => {
    render(<Nav view="browse" navigate={() => {}} />);
    expect(drawer()).not.toHaveClass('open');
    expect(drawer()).toHaveAttribute('inert');

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(drawer()).toHaveClass('open');
    expect(drawer()).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Close navigation menu' }));
    expect(drawer()).not.toHaveClass('open');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on backdrop click', async () => {
    render(<Nav view="browse" navigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(document.querySelector('.nav-drawer-backdrop')!);
    expect(drawer()).not.toHaveClass('open');
  });

  it('closes on Escape and returns focus to the hamburger', async () => {
    render(<Nav view="browse" navigate={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(drawer()).not.toHaveClass('open');
    expect(trigger).toHaveFocus();
  });

  it('navigates and closes when a drawer item is clicked', async () => {
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Setlists' }));
    expect(navigate).toHaveBeenCalledWith('public-setlists');
    expect(drawer()).not.toHaveClass('open');
  });

  it('shows Tools to signed-out visitors and navigates to the launcher', async () => {
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(navigate).toHaveBeenCalledWith('tools');
    expect(drawer()).not.toHaveClass('open');
  });

  it('shows Tools to signed-in users', async () => {
    mockAuth.user = { id: 1, username: 'member', role: 'user' };
    render(<Nav view="tools" navigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveClass('active');
  });

  it('expands and collapses the Tools submenu via the disclosure button without navigating', async () => {
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    const toggle = screen.getByRole('button', { name: 'Expand Tools submenu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'nav-tools-submenu');
    expect(document.getElementById('nav-tools-submenu')).toHaveAttribute('hidden');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('nav-tools-submenu')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Song Key Finder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transpose' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capo Chart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nashville Numbers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relative Keys' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diatonic Chords' })).toBeInTheDocument();
    // Toggling only discloses; the drawer stays open and nothing navigates
    expect(navigate).not.toHaveBeenCalled();
    expect(drawer()).toHaveClass('open');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Tools submenu' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('nav-tools-submenu')).toHaveAttribute('hidden');
  });

  it('navigates directly to a tool from the submenu and closes the drawer', async () => {
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand Tools submenu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Song Key Finder' }));
    expect(navigate).toHaveBeenCalledWith('tools-key-finder');
    expect(drawer()).not.toHaveClass('open');
  });

  it('marks Tools active and auto-expands the submenu when on a tool subpage', async () => {
    mockAuth.user = { id: 1, username: 'member', role: 'user' };
    render(<Nav view="tools-capo" navigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveClass('active');
    expect(document.getElementById('nav-tools-submenu')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Capo Chart' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Song Key Finder' })).not.toHaveClass('active');
  });

  it('auto-expands and marks the new tool pages active too', async () => {
    render(<Nav view="tools-nashville" navigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveClass('active');
    expect(document.getElementById('nav-tools-submenu')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Nashville Numbers' })).toHaveClass('active');
  });

  it('navigates directly to each new tool from the submenu', async () => {
    for (const [label, view] of [
      ['Transpose', 'tools-transpose'],
      ['Nashville Numbers', 'tools-nashville'],
      ['Relative Keys', 'tools-relative'],
      ['Diatonic Chords', 'tools-diatonic'],
    ] as const) {
      const navigate = vi.fn();
      const { unmount } = render(<Nav view="browse" navigate={navigate} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
      await userEvent.click(screen.getByRole('button', { name: 'Expand Tools submenu' }));
      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(navigate).toHaveBeenCalledWith(view);
      expect(drawer()).not.toHaveClass('open');
      unmount();
    }
  });

  it('offers the Tools submenu to signed-out visitors too', async () => {
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand Tools submenu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Capo Chart' }));
    expect(navigate).toHaveBeenCalledWith('tools-capo');
    expect(drawer()).not.toHaveClass('open');
  });

  it('hides Settings and Admin from signed-in non-admin users', async () => {
    mockAuth.user = { id: 1, username: 'member', role: 'user' };
    render(<Nav view="browse" navigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'My Songs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  });

  it('shows Settings and Admin to admin users', async () => {
    mockAuth.user = { id: 1, username: 'boss', role: 'admin' };
    mockAuth.isAdmin = true;
    const navigate = vi.fn();
    render(<Nav view="browse" navigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(navigate).toHaveBeenCalledWith('settings');
  });
});
