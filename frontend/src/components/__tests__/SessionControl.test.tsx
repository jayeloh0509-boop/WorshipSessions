import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SessionControl } from '../SessionControl';

const base = { mode: 'solo' as const, onModeChange: vi.fn(), canLead: true, canFollow: true, leaderPresent: false, error: null };

describe('SessionControl', () => {
  it('renders nothing when the user can neither lead nor follow', () => {
    const { container } = render(<SessionControl {...base} canLead={false} canFollow={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Solo and Lead to the owner', () => {
    render(<SessionControl {...base} />);
    expect(screen.getByRole('button', { name: 'Solo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lead' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  });

  it('offers Solo and Follow to a non-owner', () => {
    render(<SessionControl {...base} canLead={false} />);
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lead' })).not.toBeInTheDocument();
  });

  it('marks the active mode and reports changes', () => {
    const onModeChange = vi.fn();
    render(<SessionControl {...base} mode="lead" onModeChange={onModeChange} />);
    expect(screen.getByRole('button', { name: 'Lead' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Solo' }));
    expect(onModeChange).toHaveBeenCalledWith('solo');
  });

  it('says what is happening in each mode', () => {
    const { rerender } = render(<SessionControl {...base} mode="lead" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sharing your position');
    rerender(<SessionControl {...base} canLead={false} mode="follow" leaderPresent host="Jaye" />);
    expect(screen.getByRole('status')).toHaveTextContent('Following Jaye');
    rerender(<SessionControl {...base} canLead={false} mode="follow" leaderPresent={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the leader');
  });

  it('shows an error in place of the status', () => {
    render(<SessionControl {...base} mode="lead" error="Could not share your position." />);
    expect(screen.getByRole('status')).toHaveTextContent('Could not share your position.');
  });
});
