import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrModal } from '../OcrModal';

const mockToast = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { token: 'signed-in-token' } }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

describe('OcrModal Worship Together import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates the raw PDF request with the signed-in user token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: `{title: Test}

[G]Test`,
        language: 'en',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal hasGeminiKey={false} source="worship-together" onResult={vi.fn()} onClose={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['%PDF-test'], 'chart.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /convert pdf to editable chart/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/import-pdf',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer signed-in-token' }),
      }),
    );
  });
  it('shows an editable import review and passes edited ChordPro into the editor', async () => {
    const onResult = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: `{title: Fall Like Rain}
{key: Eb}
{tempo: 70}

Intro
[Eb] [Bb/D]
Verse 1
[Eb]God, I live to worship You
Chorus
[Ab2]Fall like rain`,
          language: 'en',
        }),
      }),
    );
    render(<OcrModal hasGeminiKey={false} source="worship-together" onResult={onResult} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['%PDF-test'], 'chart.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /convert pdf to editable chart/i }));

    const review = await screen.findByLabelText(/review and edit chart/i);
    expect(screen.getByLabelText('Import summary')).toHaveTextContent('Fall Like Rain');
    expect(screen.getByLabelText('Import summary')).toHaveTextContent('Intro · Verse 1 · Chorus');
    expect(review).not.toHaveAttribute('readonly');
    fireEvent.change(review, { target: { value: '{title: Fixed}\n\nVerse 1\n[Eb]Edited lyric' } });
    fireEvent.click(screen.getByRole('button', { name: /import into editor/i }));
    expect(onResult).toHaveBeenCalledWith('{title: Fixed}\n\nVerse 1\n[Eb]Edited lyric', 'en');
  });

  it('uses managed TheClawBay or MiniMax recognition for regular image imports', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: `{title: Test}
{x_language: en}

[G]Test`,
        language: 'en',
        provider: 'theclawbay',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal hasGeminiKey={false} onResult={vi.fn()} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['image'], 'chart.png', { type: 'image/png' }));
    const recognizeButton = screen.getByRole('button', { name: /recognize chart/i });
    await waitFor(() => expect(recognizeButton).toBeEnabled());
    fireEvent.click(recognizeButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/import-vision',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer signed-in-token' }),
      }),
    );
    expect(mockToast).toHaveBeenCalledWith('Chart recognized with TheClawBay', 'success');
  });

  it('loads a text chord chart locally without calling a recognition endpoint', async () => {
    const onResult = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal hasGeminiKey={false} onResult={onResult} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(
        ['Intro\n[|Ab / / / |]\n\nVERSE 1\nI am an [Ab]instrument of exalt[Eb]ation'],
        'Who Else - Gateway Worship.txt',
        { type: 'text/plain' },
      ),
    );

    const review = await screen.findByLabelText(/review and edit chart/i);
    const chart = (review as HTMLTextAreaElement).value;
    expect(chart).toContain('{title: Who Else}');
    expect(chart).toContain('{artist: Gateway Worship}');
    expect(chart).toContain('{key: Ab}');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /import into editor/i }));
    expect(onResult).toHaveBeenCalledWith(expect.stringContaining('VERSE 1'), 'en');
  });
});
