import { useState } from 'react';
import '../styles/import-review.css';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useDemo } from '../context/DemoContext';
import { useToast } from '../context/ToastContext';
import { importSongs, ApiError, type ImportResult } from '../lib/api';
import { fileToSong, chunkSongs, reviewChart, type ChartReview } from '../lib/import';
import { renderChordPro } from '../lib/chords';
import { ChordSheet } from './ChordSheet';
import { IMPORT_ACCEPT, IMPORT_CONFIRM_FILE_COUNT, DEMO_MAX_IMPORT } from '../lib/constants';

interface ImportModalProps {
  onClose: () => void;
  onDone: () => void;
}

interface Summary {
  imported: number;
  skipped: { filename: string }[];
  errors: { filename: string; error: string }[];
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportModal({ onClose, onDone }: ImportModalProps) {
  const { user } = useAuth();
  const { demoMode } = useDemo();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reviews, setReviews] = useState<
    { filename: string; original: string; content: string; review: ChartReview }[]
  >([]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    let picked = Array.from(e.target.files ?? []);
    if (demoMode && picked.length > DEMO_MAX_IMPORT) picked = picked.slice(0, DEMO_MAX_IMPORT);
    setFiles(picked);
    setSummary(null);
    setReviews([]);
  };

  async function postBatchWithRetry(songs: { content: string }[]): Promise<ImportResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await importSongs(songs, user?.token as string);
      } catch (e) {
        if (e instanceof ApiError && e.status === 429 && attempt < 3) {
          await sleep(1500);
          continue;
        }
        throw e;
      }
    }
  }

  const prepareReview = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const texts = await Promise.all(files.map(readText));
      setReviews(
        texts.map((text, i) => {
          const { content } = fileToSong(files[i].name, text);
          return { filename: files[i].name, original: text, content, review: reviewChart(content) };
        }),
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (reviews.length === 0) return;
    if (
      !demoMode &&
      files.length > IMPORT_CONFIRM_FILE_COUNT &&
      !confirm(`You selected ${files.length} files. Import all of them?`)
    )
      return;

    setBusy(true);
    try {
      const songs = reviews.map(({ content }) => ({ content }));
      const batches = chunkSongs(songs);

      const agg: Summary = { imported: 0, skipped: [], errors: [] };
      let offset = 0;
      setTotal(songs.length);
      setProgress(0);

      for (const batch of batches) {
        const res = await postBatchWithRetry(batch);
        agg.imported += res.imported;
        for (const s of res.skipped) agg.skipped.push({ filename: files[offset + s.index].name });
        for (const er of res.errors) agg.errors.push({ filename: files[offset + er.index].name, error: er.error });
        offset += batch.length;
        setProgress(offset);
      }
      setSummary(agg);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      data-overlay
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="ocr-card import-review-dialog" role="dialog" aria-modal="true" aria-label="Import ChordPro files">
        <div className="view-header" style={{ marginBottom: 16 }}>
          <h3 className="view-title">Import ChordPro files</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            &#10005;
          </button>
        </div>

        {reviews.length > 0 && (
          <div className="import-review" data-testid="import-review">
            <strong>Review before importing</strong>
            <p>
              {summary ? 'Import complete.' : 'No files have been saved yet.'} Compare the source and preview;
              structural checks do not verify musical accuracy.
            </p>
            {reviews.map(({ filename, original, content, review }, index) => (
              <div key={`${filename}-${index}`} className="import-review-row">
                <span>{filename}</span>
                <span className={review.status === 'verified' ? 'text-success' : 'text-warning'}>
                  {review.status === 'verified' ? 'No structural warnings' : `Needs review (${review.warnings.length})`}
                </span>
                <small>
                  {review.title || 'Untitled'}
                  {review.artist ? ` · ${review.artist}` : ''}
                  {review.key ? ` · Key ${review.key}` : ''}
                  {review.capo ? ` · Capo ${review.capo}` : ''}
                </small>
                <small>
                  {review.sections} sections · {review.chordLines} chord lines · {review.lyricLines} lyric lines
                </small>
                {!summary && (
                  <details>
                    <summary>Compare and edit {filename}</summary>
                    <details>
                      <summary>Original file</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{original}</pre>
                    </details>
                    <label htmlFor={`import-draft-${index}`}>Editable chart for {filename}</label>
                    <textarea
                      id={`import-draft-${index}`}
                      value={content}
                      disabled={busy}
                      rows={10}
                      style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
                      onChange={(e) => {
                        const value = e.target.value;
                        setReviews((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, content: value, review: reviewChart(value) } : item,
                          ),
                        );
                      }}
                    />
                    <strong>Rendered preview — {filename}</strong>
                    <ChordSheet html={renderChordPro(content)} outputId={`import-preview-${index}`} />
                  </details>
                )}
                {review.warnings.length > 0 && (
                  <ul className="import-review-warnings">
                    {review.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {!summary && (
          <>
            <div className="field">
              <label htmlFor="import-file-input">Select ChordPro files</label>
              <input
                id="import-file-input"
                data-testid="import-file-input"
                type="file"
                multiple
                accept={IMPORT_ACCEPT}
                onChange={handleFiles}
                disabled={busy}
                style={{ fontSize: 14, padding: 8 }}
              />
            </div>
            {demoMode && (
              <div className="muted-text" style={{ marginBottom: 12 }}>
                Demo mode: only the first {DEMO_MAX_IMPORT} songs will be imported.
              </div>
            )}
            {files.length > 0 && (
              <div className="muted-text" style={{ marginBottom: 12 }}>
                {files.length} file(s) selected
              </div>
            )}
            {busy && (
              <div className="muted-text" style={{ marginBottom: 12 }}>
                Importing {progress} / {total}…
              </div>
            )}
            <button
              className="btn btn-primary"
              data-testid="import-start"
              onClick={reviews.length ? start : prepareReview}
              disabled={busy || files.length === 0 || reviews.some((item) => !item.content.trim())}
            >
              {busy ? 'Working…' : reviews.length ? 'Confirm import to library' : 'Review files'}
            </button>
            {reviews.length > 0 && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setReviews([]);
                  setFiles([]);
                }}
              >
                Discard review
              </button>
            )}
          </>
        )}

        {summary && (
          <div data-testid="import-summary">
            <p>
              <strong>{summary.imported}</strong> imported · <strong>{summary.skipped.length}</strong> already in your
              library · <strong>{summary.errors.length}</strong> errors
            </p>
            {summary.errors.length > 0 && (
              <details>
                <summary>Skipped with errors ({summary.errors.length})</summary>
                <ul>
                  {summary.errors.map((er, i) => (
                    <li key={i}>
                      {er.filename} — {er.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
