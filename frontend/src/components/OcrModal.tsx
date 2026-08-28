import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { textChartToChordPro } from '../lib/import';
import { EditorPreview } from './EditorPreview';
import { canonicalizeSectionLabel, isSectionLabel } from '../lib/chords';

interface OcrModalProps {
  onResult: (text: string, language?: string | null, method?: string) => void;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

function extractDirective(content: string, name: string): string {
  const prefix = `{${name}:`;
  const line = content
    .split('\n')
    .find((candidate) => candidate.trimStart().toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return '';
  const start = line.toLowerCase().indexOf(prefix.toLowerCase()) + prefix.length;
  const end = line.indexOf('}', start);
  return (end >= 0 ? line.slice(start, end) : line.slice(start)).trim();
}

function chartReview(content: string) {
  const sections = [
    ...new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter(isSectionLabel)
        .map(canonicalizeSectionLabel),
    ),
  ];
  const chords = content.match(/\[(?!Verse|Chorus|Bridge|Intro|Outro|Interlude|Tag|Instrumental)[A-G][^\]]*\]/gi) || [];
  return {
    title: extractDirective(content, 'title'),
    key: extractDirective(content, 'key'),
    tempo: extractDirective(content, 'tempo'),
    sections,
    chordCount: chords.length,
  };
}

export function OcrModal({ onResult, onClose }: OcrModalProps) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [isTextImport, setIsTextImport] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultText, setResultText] = useState('');
  const [resultMethod, setResultMethod] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<'edit' | 'preview'>('edit');
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const textFile = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
    setIsPdf(pdf);
    setIsTextImport(textFile);
    setResultText('');
    setResultMethod(null);
    setReviewMode('edit');
    setWarningsAcknowledged(false);
    setChatHistory([]);
    if (textFile) {
      setPreview(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setResultText(textChartToChordPro(file.name, String(event.target?.result || '')));
        setResultMethod('text');
        setDetectedLang('en');
      };
      reader.readAsText(file);
      return;
    }
    if (pdf) setPreview(file.name);
    else {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // One endpoint for both PDFs and images — the server tries fast local text
  // parsing first for PDFs (including a Worship-Together-specific parser)
  // before falling back to vision recognition, and goes straight to vision
  // for images. `method` in the response tells us which tier actually
  // produced the result.
  const importChart = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast('Please select a file first', 'error');
      return;
    }
    setProcessing(true);
    setProgress(10);
    setChatHistory([]);
    try {
      setProgress(35);
      const response = await fetch('/api/songs/import-chart', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': encodeURIComponent(file.name),
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: file,
      });
      setProgress(85);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && user) logout();
        throw new Error(payload?.error || `Server returned ${response.status}`);
      }
      if (typeof payload.content !== 'string' || !payload.content.trim()) {
        throw new Error('Server returned an empty chart. Try another file or use a clearer scan.');
      }
      setResultText(payload.content);
      setResultMethod(payload.method || null);
      setDetectedLang(payload.language || 'en');
      if (payload.method === 'vision') setChatHistory([{ role: 'model', text: payload.content || '' }]);
      setProgress(100);
      toast('Chart recognized', 'success');
    } catch (error) {
      toast(`Import failed: ${(error as Error).message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const useResult = () => {
    onResult(resultText, detectedLang, resultMethod ?? undefined);
    onClose();
    toast(
      resultMethod === 'worship-together-text'
        ? 'Worship Together chart imported privately — review before saving'
        : 'Chart imported — review and edit before saving',
      'success',
    );
  };

  const hasCorrections = chatHistory.filter((m) => m.role === 'user').length > 0;
  const canExtract = !!preview;
  const review = chartReview(resultText);
  const reviewWarnings = [
    !review.title ? 'Title was not detected' : '',
    !review.key ? 'Key was not detected' : '',
    !review.sections.length ? 'No recognizable song sections were found' : '',
    !review.chordCount ? 'No chords were detected' : '',
  ].filter(Boolean);

  const importLabel = processing
    ? isPdf
      ? 'Converting…'
      : 'Recognizing…'
    : isPdf
      ? '✨ Convert PDF to editable chart'
      : preview
        ? '✨ Recognize chart'
        : 'Import chart';

  return createPortal(
    <div
      className="modal-backdrop"
      data-overlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ocr-card" role="dialog" aria-modal="true" aria-label="Import chart">
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h3 className="view-title">Import chart</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close import">
            ✕
          </button>
        </div>

        {!resultText && (
          <>
            <details className="wt-import-guide" style={{ marginBottom: 14 }}>
              <summary>Downloading from Worship Together?</summary>
              <div className="wt-import-step">
                <span>1</span>
                <div>
                  <strong>Download the official chart</strong>
                  <p>Sign in to Worship Together, open your song, and download its chart or lead sheet.</p>
                </div>
              </div>
              <a
                className="btn btn-sm wt-open-button"
                href="https://www.worshiptogether.com/song-search/"
                target="_blank"
                rel="noreferrer"
              >
                Open Worship Together ↗
              </a>
              <div className="wt-import-step">
                <span>2</span>
                <div>
                  <strong>Choose the downloaded PDF below</strong>
                </div>
              </div>
            </details>
            <div className="field">
              <label htmlFor="ocr-file-input">Select image, PDF or text chart</label>
              <input
                id="ocr-file-input"
                type="file"
                ref={fileRef}
                accept="image/*,application/pdf,text/plain,.txt"
                onChange={handleFile}
                style={{ fontSize: 14, padding: 8 }}
              />
            </div>
            {preview && (
              <div style={{ marginBottom: 14 }}>
                {isPdf || isTextImport ? (
                  <div className="muted-text" style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
                    📄 {preview}
                  </div>
                ) : (
                  <img src={preview} className="ocr-preview" alt="Preview" />
                )}
              </div>
            )}
            {!isTextImport && (
              <button
                className="btn"
                onClick={importChart}
                disabled={processing || !canExtract}
                style={{ width: '100%', padding: '12px 22px', fontSize: 15 }}
              >
                {importLabel}
              </button>
            )}
            {(processing || progress > 0) && (
              <div style={{ marginTop: 12 }}>
                {processing && (
                  <div className="muted-text" style={{ fontSize: 12, marginBottom: 7, textAlign: 'center' }}>
                    {progress < 35
                      ? 'Uploading chart…'
                      : 'Recognizing chords and lyrics — this may take 30–90 seconds…'}
                  </div>
                )}
                <div className="ocr-progress-bar">
                  <div className="ocr-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </>
        )}

        {resultText && (
          <div style={{ marginTop: 14 }}>
            {hasCorrections && (
              <div className="ocr-chat-history">
                {chatHistory.slice(1).map((m, i) => (
                  <div key={i} className={`ocr-chat-bubble ${m.role === 'user' ? 'ocr-chat-user' : 'ocr-chat-ai'}`}>
                    {m.role === 'user' ? m.text : '✓ Fix applied'}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}

            <label
              className="muted-text flex-align-center"
              htmlFor="import-review-text"
              style={{
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 5,
              }}
            >
              {hasCorrections ? 'Corrected result' : 'Extracted text'}
              {hasCorrections && (
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 400, textTransform: 'none' }}>
                  ({chatHistory.filter((m) => m.role === 'user').length} fix
                  {chatHistory.filter((m) => m.role === 'user').length > 1 ? 'es' : ''} applied)
                </span>
              )}
            </label>
            <div className="wt-review-summary" aria-label="Import summary">
              <div>
                <span>Title</span>
                <strong>{review.title || 'Review needed'}</strong>
              </div>
              <div>
                <span>Key</span>
                <strong>{review.key || 'Not detected'}</strong>
              </div>
              <div>
                <span>Tempo</span>
                <strong>{review.tempo ? `${review.tempo} BPM` : 'Not detected'}</strong>
              </div>
              <div>
                <span>Chords</span>
                <strong>{review.chordCount}</strong>
              </div>
              <div className="wt-review-sections">
                <span>Sections</span>
                <strong>{review.sections.length ? review.sections.join(' · ') : 'Review needed'}</strong>
              </div>
            </div>
            {reviewWarnings.length > 0 && (
              <div className="wt-review-warnings" role="status" aria-label="Import warnings">
                <strong>Check before continuing</strong>
                <ul>
                  {reviewWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <label className="wt-review-acknowledge">
                  <input
                    type="checkbox"
                    checked={warningsAcknowledged}
                    onChange={(event) => setWarningsAcknowledged(event.target.checked)}
                  />
                  I understand this import may need correction
                </label>
              </div>
            )}
            <div className="wt-review-switch" role="group" aria-label="Import review view">
              <button
                className={`btn btn-sm ${reviewMode === 'edit' ? '' : 'btn-ghost'}`}
                onClick={() => setReviewMode('edit')}
                aria-pressed={reviewMode === 'edit'}
              >
                Edit chart
              </button>
              <button
                className={`btn btn-sm ${reviewMode === 'preview' ? '' : 'btn-ghost'}`}
                onClick={() => setReviewMode('preview')}
                aria-pressed={reviewMode === 'preview'}
              >
                Preview chart
              </button>
            </div>
            {reviewMode === 'edit' ? (
              <textarea
                id="import-review-text"
                className="ocr-result"
                aria-label="Review and edit chart"
                value={resultText}
                onChange={(event) => {
                  setResultText(event.target.value);
                  setWarningsAcknowledged(false);
                }}
              />
            ) : (
              <div className="wt-rendered-preview" aria-label="Rendered chart preview">
                <EditorPreview content={resultText} debounceMs={0} outputId="import-review-chord-output" />
              </div>
            )}
            <p className="muted-text wt-review-help">
              Check section names and chord placement. Nothing is saved until you continue to the editor and save.
            </p>
            {detectedLang && (
              <div className="muted-text" style={{ marginTop: 6 }}>
                Detected language: <strong>{detectedLang}</strong>
              </div>
            )}

            <div className="flex-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={useResult} disabled={reviewWarnings.length > 0 && !warningsAcknowledged}>
                Import into editor
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
