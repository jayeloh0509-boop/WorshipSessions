import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { LANGUAGES, languageName } from '../lib/languages';
import { useDemo } from '../context/DemoContext';
import { useAuth } from '../context/AuthContext';
import { exportSongsBlob } from '../lib/api';
import { ImportModal } from '../components/ImportModal';
import { MAX_PREFERRED_LANGUAGES } from '../lib/constants';

export function SettingsView() {
  const apiCall = useApi();
  const { demoMode } = useDemo();
  const { user, isAdmin } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ text: string; color: string } | null>(null);
  const [preferredLangs, setPreferredLangs] = useState<string[]>([]);
  const [langSearch, setLangSearch] = useState('');
  const [langMsg, setLangMsg] = useState<{ text: string; color: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ text: string; color: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadPreferredLangs = useCallback(async () => {
    try {
      const data = await apiCall<{ languages: string[] }>('GET', '/api/settings/languages');
      setPreferredLangs(data.languages);
    } catch {}
  }, [apiCall]);

  useEffect(() => {
    loadPreferredLangs();
  }, [loadPreferredLangs]);

  const changePassword = async () => {
    setPwMsg(null);
    if (!currentPw || !newPw || !confirmPw) {
      setPwMsg({ text: 'All fields are required', color: 'var(--danger)' });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ text: 'New password must be at least 6 characters', color: 'var(--danger)' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ text: 'New passwords do not match', color: 'var(--danger)' });
      return;
    }
    try {
      await apiCall('PUT', '/api/auth/password', { current_password: currentPw, new_password: newPw });
      setPwMsg({ text: 'Password changed successfully', color: 'var(--success)' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      setPwMsg({ text: (e as Error).message, color: 'var(--danger)' });
    }
  };

  const addLang = async (code: string) => {
    if (preferredLangs.includes(code)) return;
    const updated = [...preferredLangs, code];
    try {
      await apiCall('PUT', '/api/settings/languages', { languages: updated });
      setPreferredLangs(updated);
      setLangSearch('');
      setLangMsg({ text: 'Saved', color: 'var(--success)' });
    } catch (e) {
      setLangMsg({ text: (e as Error).message, color: 'var(--danger)' });
    }
  };

  const removeLang = async (code: string) => {
    const updated = preferredLangs.filter((c) => c !== code);
    try {
      await apiCall('PUT', '/api/settings/languages', { languages: updated });
      setPreferredLangs(updated);
      setLangMsg({ text: 'Saved', color: 'var(--success)' });
    } catch (e) {
      setLangMsg({ text: (e as Error).message, color: 'var(--danger)' });
    }
  };

  const handleExport = async () => {
    if (!user?.token) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const { blob, filename } = await exportSongsBlob(user.token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportMsg({ text: (e as Error).message, color: 'var(--danger)' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="view-header">
        <h2 className="view-title">Settings</h2>
      </div>
      <div className="settings-grid">
        <div className="settings-section">
          <h3 className="admin-section-title">Change Password</h3>
          {demoMode ? (
            <div className="muted-text">Disabled in demo mode</div>
          ) : (
            <div className="auth-card">
              <div className="field">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="field">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button className="btn" onClick={changePassword}>
                Change Password
              </button>
              {pwMsg && (
                <div className="field-message" style={{ color: pwMsg.color }}>
                  {pwMsg.text}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3 className="admin-section-title">My Languages</h3>
          <p className="muted-hint">
            Your preferred languages appear at the top of the language picker when creating songs.
          </p>
          <div className="auth-card">
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {preferredLangs.map((code) => (
                <span
                  key={code}
                  className="badge badge-tag"
                  style={{ cursor: 'pointer' }}
                  onClick={() => removeLang(code)}
                >
                  {languageName(code)} ✕
                </span>
              ))}
              {preferredLangs.length === 0 && <span className="muted-text">No languages set</span>}
            </div>
            {preferredLangs.length < MAX_PREFERRED_LANGUAGES && (
              <div className="field">
                <input
                  type="text"
                  placeholder="Search to add a language..."
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                />
                {langSearch && (
                  <div className="language-picker-dropdown" style={{ position: 'relative', marginTop: 4 }}>
                    {LANGUAGES.filter(
                      (l) =>
                        !preferredLangs.includes(l.code) &&
                        (l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
                          l.code.includes(langSearch.toLowerCase())),
                    )
                      .slice(0, 8)
                      .map((l) => (
                        <button
                          key={l.code}
                          type="button"
                          className="language-picker-option"
                          onClick={() => addLang(l.code)}
                        >
                          {l.name} <span className="language-picker-code">{l.code}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {langMsg && (
              <div className="field-message" style={{ color: langMsg.color }}>
                {langMsg.text}
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h3 className="admin-section-title">{isAdmin ? 'Import & Export' : 'Export Songs'}</h3>
          <p className="muted-hint">
            Download all songs you can access as ChordPro (.cho) files in a zip.
            {isAdmin ? ' As an admin, you can also bulk import ChordPro files into the library.' : ''}
          </p>
          <div className="auth-card">
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 16 }}>
              {isAdmin && (
                <button className="btn btn-sm" onClick={() => setShowImport(true)}>
                  Import Songs
                </button>
              )}
              <button className="btn btn-sm" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export Songs'}
              </button>
            </div>
            {exportMsg && (
              <div className="field-message" style={{ color: exportMsg.color }}>
                {exportMsg.text}
              </div>
            )}
          </div>
          {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => {}} />}
        </div>
      </div>
    </>
  );
}
