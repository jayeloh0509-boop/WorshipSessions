import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSetlistSession } from '../useSetlistSession';
import { ApiError } from '../../lib/api';
import type { SetlistEntry } from '../../types';

const mockApiCall = vi.fn();
vi.mock('../useApi', () => ({ useApi: () => mockApiCall }));

const entries = [{ entry_id: 11 }, { entry_id: 22 }, { entry_id: 33 }] as unknown as SetlistEntry[];

function setup(over: Partial<Parameters<typeof useSetlistSession>[0]> = {}) {
  const goTo = vi.fn();
  const hook = renderHook((props) => useSetlistSession(props), {
    initialProps: { setlistId: 5, enabled: true, isOwner: true, entries, index: 0, goTo, ...over },
  });
  return { goTo, ...hook };
}

beforeEach(() => {
  mockApiCall.mockReset();
  mockApiCall.mockResolvedValue({ active: false, version: 0 });
});

afterEach(() => vi.useRealTimers());

describe('useSetlistSession', () => {
  it('stays inert in solo mode', () => {
    setup();
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('only lets the owner lead, and only for server setlists', () => {
    expect(setup({ isOwner: false }).result.current.canLead).toBe(false);
    expect(setup({ enabled: false }).result.current.canLead).toBe(false);
    expect(setup().result.current.canLead).toBe(true);
  });

  it('leader pushes its position, then again on every navigation', async () => {
    const { result, rerender } = setup();
    act(() => result.current.setMode('lead'));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('PUT', '/api/setlists/5/session', { entry_id: 11, index: 0 }));
    rerender({ setlistId: 5, enabled: true, isOwner: true, entries, index: 2, goTo: vi.fn() });
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('PUT', '/api/setlists/5/session', { entry_id: 33, index: 2 }));
  });

  it('leader pings periodically so followers can tell it is still there', async () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.setMode('lead'));
    await act(async () => {});
    const before = mockApiCall.mock.calls.filter((c) => c[0] === 'PUT').length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockApiCall.mock.calls.filter((c) => c[0] === 'PUT').length).toBe(before + 1);
  });

  it('ending lead mode tells the server', async () => {
    const { result } = setup();
    act(() => result.current.setMode('lead'));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('PUT', expect.anything(), expect.anything()));
    act(() => result.current.setMode('solo'));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/api/setlists/5/session'));
  });

  it('follower jumps to the leader and reports who it is following', async () => {
    mockApiCall.mockResolvedValueOnce({ active: true, version: 3, host: 'Jaye', entry_id: 22, index: 1 });
    mockApiCall.mockImplementation(() => new Promise(() => {})); // park the next long-poll
    const { result, goTo } = setup({ isOwner: false });
    act(() => result.current.setMode('follow'));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(1));
    expect(result.current.leaderPresent).toBe(true);
    expect(result.current.remote?.host).toBe('Jaye');
  });

  it('follower sends the last version back so the server can hold the request', async () => {
    mockApiCall.mockResolvedValueOnce({ active: true, version: 7, host: 'Jaye', entry_id: 22, index: 1 });
    mockApiCall.mockImplementation(() => new Promise(() => {}));
    const { result } = setup({ isOwner: false });
    act(() => result.current.setMode('follow'));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('GET', '/api/setlists/5/session?since=7'));
  });

  it('follower ignores a leader position whose entry no longer matches', async () => {
    mockApiCall.mockResolvedValueOnce({ active: true, version: 1, host: 'Jaye', entry_id: 999, index: 1 });
    mockApiCall.mockImplementation(() => new Promise(() => {}));
    const { result, goTo } = setup({ isOwner: false });
    act(() => result.current.setMode('follow'));
    await waitFor(() => expect(result.current.leaderPresent).toBe(true));
    expect(goTo).not.toHaveBeenCalled();
  });

  it('follower waits quietly when nobody is leading', async () => {
    mockApiCall.mockResolvedValueOnce({ active: false, version: 0 });
    mockApiCall.mockImplementation(() => new Promise(() => {}));
    const { result, goTo } = setup({ isOwner: false });
    act(() => result.current.setMode('follow'));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalled());
    expect(result.current.leaderPresent).toBe(false);
    expect(goTo).not.toHaveBeenCalled();
  });

  it('falls back to solo when the setlist is not available to follow', async () => {
    mockApiCall.mockRejectedValue(new ApiError('Setlist not found', 404));
    const { result } = setup({ isOwner: false });
    act(() => result.current.setMode('follow'));
    await waitFor(() => expect(result.current.mode).toBe('solo'));
    expect(result.current.error).toMatch(/not available/i);
  });

  it('falls back to solo when a lead push is refused', async () => {
    mockApiCall.mockRejectedValue(new ApiError('Only the setlist owner can lead', 403));
    const { result } = setup();
    act(() => result.current.setMode('lead'));
    await waitFor(() => expect(result.current.mode).toBe('solo'));
  });
});
