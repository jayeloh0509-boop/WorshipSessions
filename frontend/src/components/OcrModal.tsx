import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface OcrModalProps {
  hasGeminiKey: boolean;
  onResult: (text: string, language?: string | null) => void;
  onClose: () => void;
  source?: 'worship-together';
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
  const sectionPattern =
    /^(?:Verse|Chorus|Bridge|Intro|Outro|Interlude|Pre-?Chorus|Tag|Instrumental|Refrain|Ending)(?:\s+\d+|\s+\(\d+X\))?$/i;
  const sections = [
    ...new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => sectionPattern.test(line)),
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

export function OcrModal({ hasGeminiKey: _hasGeminiKey, onResult, onClose, source }: OcrModalProps) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultText, setResultText] = useState('');
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pdf = file.type === 'application/pdf';
    setIsPdf(pdf);
    if (pdf) setPreview(file.name);
    else {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
    setResultText('');
    setChatHistory([]);
  };

  const importWorshipTogetherPdf = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast('Choose the Worship Together PDF first', 'error');
      return;
    }
    setProcessing(true);
    setProgress(10);
    try {
      setProgress(40);
      const response = await fetch('/api/songs/import-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/pdf',
          'X-Filename': encodeURIComponent(file.name),
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: file,
      });
      setProgress(80);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && user) logout();
        throw new Error(payload?.error || `Server returned ${response.status}`);
      }
      setResultText(payload.content || '');
      setDetectedLang(payload.language || 'en');
      setProgress(100);
    } catch (error) {
      toast(`Worship Together import failed: ${(error as Error).message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const processVisionOcr = async () => {
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
      const response = await fetch('/api/songs/import-vision', {
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
      setResultText(payload.text || '');
      setDetectedLang(payload.language || 'en');
      setChatHistory([{ role: 'model', text: payload.text || '' }]);
      setProgress(100);
      toast(`Chart recognized with ${payload.provider === 'minimax' ? 'MiniMax' : 'TheClawBay'}`, 'success');
    } catch (error) {
      toast(`OCR failed: ${(error as Error).message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const useResult = () => {
    onResult(resultText, detectedLang);
    onClose();
    toast(
      source === 'worship-together'
        ? 'Worship Together chart imported privately — review before saving'
        : 'Text imported — review and edit before saving',
      'success',
    );
  };

  const isWorshipTogether = source === 'worship-together';
  const hasCorrections = chatHistory.filter((m) => m.role === 'user').length > 0;
  const canExtract = !!preview;
  const review = chartReview(resultText);

  return createPortal(
    <div
      className="modal-backdrop"
      data-overlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ocr-card"
        role="dialog"
        aria-modal="true"
        aria-label={isWorshipTogether ? 'Import Worship Together chart' : 'Import from image or PDF'}
      >
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h3 className="view-title">
            {isWorshipTogether ? 'Import Worship Together chart' : 'Import from image or PDF'}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close import">
            ✕
          </button>
        </div>

        {!resultText && (
          <>
            {isWorshipTogether && (
              <div className="wt-import-guide">
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
                    <strong>Choose the downloaded PDF</strong>
                    <p>No API key needed. We convert the text-based PDF locally and default to private.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="ocr-file-input">
                {isWorshipTogether ? 'Select downloaded chart' : 'Select image or PDF'}
              </label>
              <input
                id="ocr-file-input"
                type="file"
                ref={fileRef}
                accept={isWorshipTogether ? 'application/pdf' : 'image/*,application/pdf'}
                onChange={handleFile}
                style={{ fontSize: 14, padding: 8 }}
              />
            </div>
            {preview && (
              <div style={{ marginBottom: 14 }}>
                {isPdf ? (
                  <div className="muted-text" style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
                    📄 {preview}
                  </div>
                ) : (
                  <img src={preview} className="ocr-preview" alt="Preview" />
                )}
              </div>
            )}
            {!isWorshipTogether && (
              <div
                className="muted-text"
                style={{ marginBottom: 12, padding: 10, background: 'var(--surface)', borderRadius: 8 }}
              >
                Uses fast MiniMax recognition first, with TheClawBay as fallback. No Gemini key is required.
              </div>
            )}
            <button
              className="btn"
              onClick={isWorshipTogether ? importWorshipTogetherPdf : processVisionOcr}
              disabled={processing || !canExtract}
              style={{ width: '100%', padding: '12px 22px', fontSize: 15 }}
            >
              {processing
                ? 'Converting…'
                : isWorshipTogether
                  ? '✨ Convert PDF to editable chart'
                  : '✨ Recognize chart'}
            </button>
            {(processing || progress > 0) && (
              <div style={{ marginTop: 12 }}>
                {processing && (
                  <div className="muted-text" style={{ fontSize: 12, marginBottom: 7, textAlign: 'center' }}>
                    {progress < 35
                      ? 'Uploading chart…'
                      : 'Recognizing chords and lyrics — GPT-5.6 Sol may take 30–90 seconds…'}
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
            {isWorshipTogether && (
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
            )}
            <textarea
              className="ocr-result"
              aria-label={isWorshipTogether ? 'Review and edit chart' : 'Extracted text'}
              value={resultText}
              onChange={(event) => setResultText(event.target.value)}
            />
            {isWorshipTogether && (
              <p className="muted-text wt-review-help">
                Check section names and chord placement. Nothing is saved until you continue to the editor and save.
              </p>
            )}
            {detectedLang && (
              <div className="muted-text" style={{ marginTop: 6 }}>
                Detected language: <strong>{detectedLang}</strong>
              </div>
            )}

            <div className="flex-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={useResult}>
                {isWorshipTogether ? 'Import into editor' : 'Use this'}
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
