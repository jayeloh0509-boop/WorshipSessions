import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrModal } from '../OcrModal';

const mockToast = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { token: 'signed-in-token' } }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

// OcrModal merged what used to be two separate flows (a Worship-Together-only
// button and a general image/PDF/text button) into one button and one
// endpoint (/api/songs/import-chart). The server decides which parsing tier
// actually handled the file and reports it back via `method` — these tests
// exercise that unified contract rather than a `source` prop, since the prop
// no longer exists.
describe('OcrModal unified chart import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a generic label before any file is chosen, and switches to a PDF-specific label once one is', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /import chart/i })).toBeDisabled();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['%PDF-test'], 'chart.pdf', { type: 'application/pdf' }));

    expect(screen.getByRole('button', { name: /convert pdf to editable chart/i })).toBeEnabled();
  });

  it('shows an image-specific label once an image is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['image'], 'chart.png', { type: 'image/png' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /recognize chart/i })).toBeEnabled());
  });

  it('authenticates the PDF import request with the signed-in user token via the unified endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: `{title: Test}

[G]Test`,
        language: 'en',
        method: 'local',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['%PDF-test'], 'chart.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /convert pdf to editable chart/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/import-chart',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer signed-in-token' }),
      }),
    );
  });

  it('shows an editable import review, and passes the detected method (Worship Together) through onResult', async () => {
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
          method: 'worship-together-text',
        }),
      }),
    );
    render(<OcrModal onResult={onResult} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['%PDF-test'], 'chart.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /convert pdf to editable chart/i }));

    const review = await screen.findByLabelText(/review and edit chart/i);
    expect(screen.getByLabelText('Import summary')).toHaveTextContent('Fall Like Rain');
    expect(screen.getByLabelText('Import summary')).toHaveTextContent('Intro · Verse 1 · Chorus');
    expect(review).not.toHaveAttribute('readonly');
    fireEvent.change(review, { target: { value: '{title: Fixed}\n\nVerse 1\n[Eb]Edited lyric' } });
    fireEvent.click(screen.getByRole('button', { name: /import into editor/i }));
    expect(onResult).toHaveBeenCalledWith('{title: Fixed}\n\nVerse 1\n[Eb]Edited lyric', 'en', 'worship-together-text');
  });

  it('recognizes image imports via the same unified endpoint, method "vision", and still shows the review panel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: `{title: Test}
{x_language: en}

[G]Test`,
        language: 'en',
        method: 'vision',
        provider: 'theclawbay',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['image'], 'chart.png', { type: 'image/png' }));
    const recognizeButton = screen.getByRole('button', { name: /recognize chart/i });
    await waitFor(() => expect(recognizeButton).toBeEnabled());
    fireEvent.click(recognizeButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/import-chart',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer signed-in-token' }),
      }),
    );
    expect(mockToast).toHaveBeenCalledWith('Chart recognized', 'success');
    // The review/summary panel used to be gated to WT/text imports only — it
    // should now show for every import method, including vision.
    expect(await screen.findByLabelText('Import summary')).toHaveTextContent('Test');
  });

  it('shows an error instead of success when the server returns an empty chart', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: '   ', method: 'local' }) }),
    );
    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText(/select image, pdf or text chart/i);
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'empty.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /convert pdf to editable chart/i }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('empty chart'), 'error'));
    expect(mockToast).not.toHaveBeenCalledWith('Chart recognized', 'success');
  });

  it('loads a text chord chart locally without calling the import endpoint, and reports method "text"', async () => {
    const onResult = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<OcrModal onResult={onResult} onClose={vi.fn()} />);
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
    expect(onResult).toHaveBeenCalledWith(expect.stringContaining('VERSE 1'), 'en', 'text');
  });

  it('shows a Worship Together guide as a collapsed, non-gating hint', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<OcrModal onResult={vi.fn()} onClose={vi.fn()} />);

    const details = screen.getByText(/downloading from worship together/i).closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    // The file input accepts everything regardless of the hint being open or closed.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf,text/plain,.txt');
  });
});
