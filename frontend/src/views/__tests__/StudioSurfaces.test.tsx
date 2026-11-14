import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolShell } from '../../components/ToolShell';
import { ToolsView } from '../ToolsView';
import { SetlistCard } from '../../components/SetlistCard';
import { SetlistEntryCard } from '../../components/SetlistEntryCard';
import { SettingsPanel } from '../../components/SettingsPanel';

vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => vi.fn(),
}));

const setlist = {
  id: 4,
  name: 'Sunday Service',
  visibility: 'public' as const,
  song_count: 3,
  event_date: '2026-11-15',
  username: 'band',
};

describe('Studio workspace surfaces', () => {
  it('scopes the tools launcher and every tool page to the same Studio workbench', () => {
    const { unmount } = render(<ToolsView navigate={() => {}} />);
    const launcher = screen.getByRole('heading', { name: 'Tools', level: 1 }).closest('.studio-page');
    expect(launcher).not.toBeNull();
    expect(launcher).toHaveClass('studio-tools');
    expect(screen.getByText('YOUR WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('Find your key. Shape your arrangement. Keep the music moving.')).toBeInTheDocument();
    unmount();

    render(
      <ToolShell navigate={() => {}} title="Transpose Calculator" subtitle="Move a chart to a new key.">
        <p>tool body</p>
      </ToolShell>,
    );
    const subpage = screen.getByRole('heading', { name: 'Transpose Calculator', level: 1 }).closest('.studio-page');
    expect(subpage).toHaveClass('studio-tools', 'tool-subpage');
    expect(screen.getByText('YOUR WORKSPACE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to tools/i })).toBeInTheDocument();
  });

  it('keeps the tools launcher free of inline tool UI and keeps navigation intact', async () => {
    const navigate = vi.fn();
    render(<ToolsView navigate={navigate} />);
    expect(screen.queryByLabelText('Chord input')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Song Key Finder/ }));
    expect(navigate).toHaveBeenCalledWith('tools-key-finder');
  });

  it('renders setlist rows as a running order with sibling actions, not nested buttons', async () => {
    const onClick = vi.fn();
    const onPrepare = vi.fn();
    const onPlay = vi.fn();
    const onDuplicate = vi.fn();
    const { container } = render(
      <SetlistCard
        setlist={setlist}
        onClick={onClick}
        onPrepare={onPrepare}
        onPlay={onPlay}
        onDuplicate={onDuplicate}
      />,
    );

    const open = screen.getByRole('button', { name: 'Open Sunday Service setlist' });
    expect(open).toBeInTheDocument();
    expect(container.querySelector('button button')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Prepare Sunday Service' }));
    expect(onPrepare).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Sunday Service' }));
    expect(onDuplicate).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Play Sunday Service' }));
    expect(onPlay).toHaveBeenCalled();
    await userEvent.click(open);
    expect(onClick).toHaveBeenCalled();
  });

  it('keeps setlist entry preparation summary compact and the checklist explicit', async () => {
    const onSavePreparation = vi.fn().mockResolvedValue(undefined);
    render(
      <SetlistEntryCard
        entry={{
          entry_id: 11,
          song_id: 3,
          title: 'Great Is Your Faithfulness',
          artist: 'Tim Hughes',
          content: '[C]Great',
          content_override: null,
          transpose: 0,
          nashville: 0,
          font: null,
          two_col: null,
          bpm: null,
          youtube_url: null,
          language: 'en',
          arrangement_confirmed: true,
          key_confirmed: true,
          transition_rehearsed: false,
          chart_verified: false,
        }}
        idx={0}
        totalEntries={1}
        isEditable
        isLocal={false}
        onRemove={() => {}}
        onMove={() => {}}
        onTranspose={() => {}}
        onClick={() => {}}
        onSavePreparation={onSavePreparation}
        t={(key: string) => key}
      />,
    );

    expect(screen.getByText(/2\/4 prepared/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^prep$/i }));
    const panel = screen.getByLabelText('Preparation checklist');
    expect(within(panel).getByLabelText(/arrangement confirmed/i)).toBeChecked();
    expect(within(panel).getByLabelText(/chart verified/i)).not.toBeChecked();
    expect(screen.getByRole('button', { name: /save preparation/i })).toBeInTheDocument();
  });

  it('keeps the setlist defaults panel controls intact', async () => {
    const onHighContrastChange = vi.fn();
    render(
      <SettingsPanel
        nashville={false}
        onNashvilleChange={() => {}}
        hideYt={false}
        onHideYtChange={() => {}}
        twoCol={false}
        onTwoColChange={() => {}}
        fontSize={0}
        onFontChange={() => {}}
        onFontReset={() => {}}
        lineSpacing={1.4}
        onLineSpacingChange={() => {}}
        highContrast={false}
        onHighContrastChange={onHighContrastChange}
        holdToAdvance={false}
        onHoldToAdvanceChange={() => {}}
      />,
    );

    expect(screen.getByText('Setlist defaults (all songs)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /high contrast/i }));
    expect(onHighContrastChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: /decrease line spacing/i })).toBeInTheDocument();
  });
});
