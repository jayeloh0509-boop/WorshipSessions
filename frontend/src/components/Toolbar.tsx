import { useState, useEffect } from 'react';
import { KeyPicker } from './KeyPicker';

interface ToolbarProps {
  currentKey: string;
  nashville: boolean;
  nashvilleDisabled?: boolean;
  onNashvilleChange: (checked: boolean) => void;
  twoCol: boolean;
  onTwoColToggle: () => void;
  fontSize: number;
  onFontChange: (delta: number) => void;
  onReset: () => void;
  onPickKey: (key: string) => void;
  onAutoFit?: () => void;
  autoFitActive?: boolean;
  onSaveOnline?: () => void;
  onSaveLocal?: () => void;
  onExportPdf?: () => void;
  onToggleSettings?: () => void;
  isModified?: boolean;
  overrides?: { num?: boolean; twoCol?: boolean; font?: boolean };
  settingsActive?: boolean;
  renderKey?: number | string;
  /** When the current key is already shown prominently elsewhere (e.g. the
   * SongView header badge), avoid repeating it here — show a plain "change
   * key" affordance instead of duplicating the value. */
  compactKey?: boolean;
  /** Current chart reading surface. Only rendered when onChartToneChange is
   * also passed — views that don't offer a light/dark switch (Live Mode,
   * setlist prep) simply omit both props. */
  chartTone?: 'paper' | 'dark';
  onChartToneChange?: () => void;
  /** Override the built-in font/column default calculation when the caller
   * owns additional preference state (key, Nashville, tone, FIT). */
  resetDisabled?: boolean;
  onToggleMore?: () => void;
  moreControlsOpen?: boolean;
}

export function Toolbar({
  currentKey,
  nashville,
  nashvilleDisabled,
  onNashvilleChange,
  twoCol,
  onTwoColToggle,
  fontSize,
  onFontChange,
  onReset,
  onPickKey,
  onAutoFit,
  autoFitActive,
  onSaveOnline,
  onSaveLocal,
  onExportPdf,
  onToggleSettings,
  isModified,
  overrides,
  settingsActive,
  renderKey,
  compactKey,
  chartTone,
  onChartToneChange,
  resetDisabled,
  onToggleMore,
  moreControlsOpen,
}: ToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const ov = overrides || {};
  const isDefault = resetDisabled ?? (fontSize === 0 && !twoCol);

  useEffect(() => {
    setPickerOpen(false);
  }, [renderKey]);

  return (
    <>
      <div className="transpose-bar song-control-shelf">
        <div className="toolbar-group toolbar-group-key" role="group" aria-label="Key and notation">
          <button
            className={`key-current${nashville ? ' disabled' : ''}`}
            id="key-display"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label={`Change key, currently ${currentKey || 'unknown'}`}
          >
            {compactKey ? (
              <>
                KEY <span aria-hidden="true">&#9662;</span>
              </>
            ) : (
              `KEY ${currentKey || '?'}`
            )}
          </button>
          <label className={`number-toggle${ov.num ? ' overridden' : ''}`} id="nashville-toggle">
            <input
              type="checkbox"
              checked={nashville}
              disabled={nashvilleDisabled}
              onChange={(e) => onNashvilleChange(e.target.checked)}
            />
            <span>123</span>
          </label>
        </div>
        <div className="toolbar-group toolbar-group-text" role="group" aria-label="Chart text size">
          <button
            className={`transpose-btn font-btn${ov.font ? ' overridden' : ''}`}
            onClick={() => onFontChange(-1)}
            aria-label="Decrease chart text size"
            title="Decrease chart text size"
          >
            A&#8722;
          </button>
          <button
            className={`transpose-btn font-btn${ov.font ? ' overridden' : ''}`}
            onClick={() => onFontChange(1)}
            aria-label="Increase chart text size"
            title="Increase chart text size"
          >
            A+
          </button>
        </div>
        <div className="toolbar-group toolbar-group-layout" role="group" aria-label="Chart layout and appearance">
          <button
            className={`transpose-btn font-btn col-toggle${twoCol ? ' active' : ''}${ov.twoCol ? ' overridden' : ''}`}
            onClick={onTwoColToggle}
            title={twoCol ? 'Switch to single column' : 'Switch to two columns'}
            aria-label={twoCol ? 'Switch to single column' : 'Switch to two columns'}
            aria-pressed={twoCol}
          >
            2-COL
          </button>
          {onAutoFit && (
            <button
              className={`transpose-btn font-btn autofit-btn${autoFitActive ? ' active' : ''}`}
              onClick={onAutoFit}
              title="Auto-fit for this screen (one-time)"
              aria-label="Auto-fit chart to this screen"
              aria-pressed={Boolean(autoFitActive)}
            >
              FIT
            </button>
          )}
          {onChartToneChange && (
            <button
              className={`transpose-btn font-btn tone-toggle${chartTone === 'dark' ? ' active' : ''}`}
              onClick={onChartToneChange}
              title={chartTone === 'dark' ? 'Switch to light chart' : 'Switch to dark chart'}
              aria-label={chartTone === 'dark' ? 'Switch to light chart' : 'Switch to dark chart'}
              aria-pressed={chartTone === 'dark'}
            >
              {chartTone === 'dark' ? 'DARK' : 'LIGHT'}
            </button>
          )}
          <button
            className="transpose-btn font-btn font-reset"
            onClick={onReset}
            disabled={isDefault}
            title="Reset reading preferences"
            aria-label="Reset chart reading controls"
          >
            &#8634;
          </button>
        </div>
        {(onExportPdf || onToggleSettings) && (
          <div className="toolbar-group toolbar-group-output" role="group" aria-label="Export and settings">
            {onExportPdf && (
              <button
                className="transpose-btn font-btn pdf-btn"
                onClick={onExportPdf}
                title="Export as PDF"
                aria-label="Export song as PDF"
              >
                PDF
              </button>
            )}
            {onToggleSettings && (
              <button
                className={`transpose-btn font-btn gear-btn${settingsActive ? ' active' : ''}`}
                onClick={onToggleSettings}
                title="Settings"
                aria-label="Song settings"
              >
                &#9881;
              </button>
            )}
          </div>
        )}
        {onToggleMore && (
          <button
            type="button"
            className="song-secondary-toggle"
            aria-controls="song-secondary-panel"
            aria-expanded={Boolean(moreControlsOpen)}
            aria-label={moreControlsOpen ? 'Show fewer chart controls' : 'Show more chart controls'}
            title={moreControlsOpen ? 'Show fewer chart controls' : 'Show more chart controls'}
            onClick={onToggleMore}
          >
            {moreControlsOpen ? 'Less' : 'More'} <span aria-hidden="true">{moreControlsOpen ? '⌃' : '⌄'}</span>
          </button>
        )}
      </div>
      <KeyPicker
        currentKey={currentKey}
        onPickKey={onPickKey}
        visible={pickerOpen}
        isModified={isModified}
        onSaveOnline={
          onSaveOnline
            ? () => {
                onSaveOnline?.();
                setPickerOpen(false);
              }
            : undefined
        }
        onSaveLocal={
          onSaveLocal
            ? () => {
                onSaveLocal?.();
                setPickerOpen(false);
              }
            : undefined
        }
      />
    </>
  );
}
