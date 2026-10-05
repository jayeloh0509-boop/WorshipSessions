import { renderHook, act } from '@testing-library/react';
import { useSongEditor } from '../useSongEditor';

describe('useSongEditor line endings', () => {
  it('normalises CRLF content on load so the editor does not open as unsaved', () => {
    const { result } = renderHook(() => useSongEditor());
    act(() => result.current.setInitialContent('{title: T}\r\n[G]Hello\r\n[C]World\r'));
    expect(result.current.state.content).toBe('{title: T}\n[G]Hello\n[C]World\n');
  });
});
