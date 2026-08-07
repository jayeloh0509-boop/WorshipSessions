import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { DEFAULT_GEMINI_MODEL } from '../lib/constants';

interface OcrModalProps {
  hasGeminiKey: boolean;
  onResult: (text: string, language?: string | null) => void;
  onClose: () => void;
  source?: 'worship-together';
}

interface ChatMessage { role: 'user' | 'model'; text: string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function OcrModal({ hasGeminiKey, onResult, onClose, source }: OcrModalProps) {
  const api = useApi();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultText, setResultText] = useState('');
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_GEMINI_MODEL);
  const [models, setModels] = useState<{ id: string; label: string; hint: string }[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [fixInput, setFixInput] = useState('');
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    if (source === 'worship-together') return;
    api<{ model: string; models: { id: string; label: string; hint: string }[] }>('GET', '/api/settings/ocr-model')
      .then((data) => { setSelectedModel(data.model); setModels(data.models); })
      .catch(() => undefined);
  }, [api, source]);

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
    setImageBase64(null);
  };

  const importWorshipTogetherPdf = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast('Choose the Worship Together PDF first', 'error'); return; }
    setProcessing(true);
    setProgress(10);
    try {
      setProgress(40);
      const response = await fetch('/api/songs/import-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/pdf',
          'X-Filename': encodeURIComponent(file.name),
        },
        body: file,
      });
      setProgress(80);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Server returned ${response.status}`);
      setResultText(payload.content || '');
      setDetectedLang(payload.language || 'en');
      setProgress(100);
    } catch (error) {
      toast(`Worship Together import failed: ${(error as Error).message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const processGeminiOcr = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast('Please select a file first', 'error'); return; }
    if (!hasGeminiKey) { toast('Please set up your Gemini API key in Settings first', 'error'); return; }
    setProcessing(true);
    setProgress(0);
    setChatHistory([]);
    try {
      setProgress(10);
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
      setProgress(30);
      const result = await api<{ text: string; language: string | null }>('POST', '/api/ocr/gemini', { image: base64, model: selectedModel });
      setProgress(100);
      setResultText(result.text);
      setDetectedLang(result.language);
      setChatHistory([{ role: 'model', text: result.text }]);
    } catch (error) {
      toast(`OCR failed: ${(error as Error).message}`, 'error');
    }
    setProcessing(false);
  };

  const sendFix = async () => {
    const msg = fixInput.trim();
    if (!msg || !imageBase64) return;
    setRefining(true);
    setFixInput('');
    const newHistory = [...chatHistory, { role: 'user' as const, text: msg }];
    setChatHistory(newHistory);
    try {
      const result = await api<{ text: string }>('POST', '/api/ocr/gemini/refine', {
        image: imageBase64,
        history: chatHistory,
        message: msg,
        model: selectedModel,
      });
      setResultText(result.text);
      setChatHistory([...newHistory, { role: 'model', text: result.text }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      toast(`Fix failed: ${(error as Error).message}`, 'error');
      setChatHistory(chatHistory);
    }
    setRefining(false);
  };

  const useResult = () => {
    onResult(resultText, detectedLang);
    onClose();
    toast(source === 'worship-together'
      ? 'Worship Together chart imported privately — review before saving'
      : 'Text imported — review and edit before saving', 'success');
  };

  const isWorshipTogether = source === 'worship-together';
  const hasCorrections = chatHistory.filter((m) => m.role === 'user').length > 0;
  const canExtract = isWorshipTogether ? !!preview : (hasGeminiKey && !!preview);

  return createPortal(
    <div className="modal-backdrop" data-overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ocr-card" role="dialog" aria-modal="true" aria-label={isWorshipTogether ? 'Import Worship Together chart' : 'Import from image or PDF'}>
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h3 className="view-title">{isWorshipTogether ? 'Import Worship Together chart' : 'Import from image or PDF'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close import">✕</button>
        </div>

        {!resultText && (
          <>
            {isWorshipTogether && (
              <div className="wt-import-guide">
                <div className="wt-import-step"><span>1</span><div><strong>Download the official chart</strong><p>Sign in to Worship Together, open your song, and download its chart or lead sheet.</p></div></div>
                <a className="btn btn-sm wt-open-button" href="https://www.worshiptogether.com/song-search/" target="_blank" rel="noreferrer">Open Worship Together ↗</a>
                <div className="wt-import-step"><span>2</span><div><strong>Choose the downloaded PDF</strong><p>No API key needed. We convert the text-based PDF locally and default to private.</p></div></div>
              </div>
            )}
            <div className="field">
              <label>{isWorshipTogether ? 'Select downloaded chart' : 'Select image or PDF'}</label>
              <input
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
            {!isWorshipTogether && !hasGeminiKey && (
              <div className="muted-text" style={{ marginBottom: 12, padding: 10, background: 'var(--surface)', borderRadius: 8 }}>
                Image/scanned PDF OCR requires a Gemini API key. Worship Together text-PDF import does not.
              </div>
            )}
            {!isWorshipTogether && models.length > 0 && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ fontSize: 14, padding: '8px 12px' }}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              className="btn"
              onClick={isWorshipTogether ? importWorshipTogetherPdf : processGeminiOcr}
              disabled={processing || !canExtract}
              style={{ width: '100%', padding: '12px 22px', fontSize: 15 }}
            >
              {processing ? 'Converting…' : (isWorshipTogether ? '✨ Convert PDF to editable chart' : '✨ Extract text')}
            </button>
            {(processing || progress > 0) && (
              <div style={{ marginTop: 12 }}>
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

            <label className="muted-text flex-align-center" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              {hasCorrections ? 'Corrected result' : 'Extracted text'}
              {hasCorrections && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 400, textTransform: 'none' }}>({chatHistory.filter((m) => m.role === 'user').length} fix{chatHistory.filter((m) => m.role === 'user').length > 1 ? 'es' : ''} applied)</span>}
            </label>
            <textarea className="ocr-result" readOnly value={resultText} />
            {detectedLang && (
              <div className="muted-text" style={{ marginTop: 6 }}>
                Detected language: <strong>{detectedLang}</strong>
              </div>
            )}

            {!isWorshipTogether && models.length > 0 && imageBase64 && (
              <div style={{ marginBottom: 8 }}>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', color: 'var(--muted)' }}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                  ))}
                </select>
              </div>
            )}
            {!isWorshipTogether && imageBase64 && (
              <div className="ocr-fix-row">
                <input
                  type="text"
                  className="ocr-fix-input"
                  placeholder="Describe what to fix..."
                  value={fixInput}
                  onChange={(e) => setFixInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFix(); } }}
                  disabled={refining}
                />
                <button
                  className="btn btn-sm"
                  onClick={sendFix}
                  disabled={refining || !fixInput.trim()}
                >
                  {refining ? '...' : 'Fix'}
                </button>
              </div>
            )}
            {!isWorshipTogether && imageBase64 && (
              <div className="muted-text" style={{ fontSize: 12, marginTop: 4 }}>
                e.g. "move the G chord to the next word" or "verse 2 should be Am not Em"
              </div>
            )}

            <div className="flex-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={useResult}>Use this</button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>, document.body,
  );
}