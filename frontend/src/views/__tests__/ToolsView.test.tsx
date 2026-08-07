import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolsView } from '../ToolsView';

describe('ToolsView launcher', () => {
  it('shows grouped launcher cards for all six tools without inline tool UIs', () => {
    render(<ToolsView navigate={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Key & Transpose' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theory & Arrangement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Song Key Finder/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transpose Calculator/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Capo Chart Pro/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nashville Number Converter/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relative Key Finder/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diatonic Chord Finder/ })).toBeInTheDocument();
    // No interactive tool UI on the launcher itself
    expect(screen.queryByLabelText('Chord input')).toBeNull();
    expect(screen.queryByLabelText('Sounding key')).toBeNull();
  });

  it('navigates to each tool page from its card', async () => {
    const navigate = vi.fn();
    render(<ToolsView navigate={navigate} />);
    const cases: [RegExp, string][] = [
      [/Song Key Finder/, 'tools-key-finder'],
      [/Transpose Calculator/, 'tools-transpose'],
      [/Capo Chart Pro/, 'tools-capo'],
      [/Nashville Number Converter/, 'tools-nashville'],
      [/Relative Key Finder/, 'tools-relative'],
      [/Diatonic Chord Finder/, 'tools-diatonic'],
    ];
    for (const [name, view] of cases) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(navigate).toHaveBeenCalledWith(view);
    }
  });
});
