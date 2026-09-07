interface SettingsPanelProps {
  nashville: boolean;
  onNashvilleChange: (val: boolean) => void;
  hideYt: boolean;
  onHideYtChange: (val: boolean) => void;
  twoCol: boolean;
  onTwoColChange: (val: boolean) => void;
  fontSize: number;
  onFontChange: (delta: number) => void;
  onFontReset: () => void;
  lineSpacing: number;
  onLineSpacingChange: (delta: number) => void;
}

export function SettingsPanel({
  nashville,
  onNashvilleChange,
  hideYt,
  onHideYtChange,
  twoCol,
  onTwoColChange,
  fontSize,
  onFontChange,
  onFontReset,
  lineSpacing,
  onLineSpacingChange,
}: SettingsPanelProps) {
  return (
    <div className="sl-options-panel">
      <div className="sl-options-title">Setlist defaults (all songs)</div>
      <label className="sl-option">
        <span>Number notation</span>
        <span className="toggle">
          <input type="checkbox" checked={nashville} onChange={(e) => onNashvilleChange(e.target.checked)} />
          <span className="toggle-slider" />
        </span>
      </label>
      <label className="sl-option">
        <span>Hide YouTube</span>
        <span className="toggle">
          <input type="checkbox" checked={hideYt} onChange={(e) => onHideYtChange(e.target.checked)} />
          <span className="toggle-slider" />
        </span>
      </label>
      <label className="sl-option">
        <span>Multi-column layout</span>
        <span className="toggle">
          <input type="checkbox" checked={twoCol} onChange={(e) => onTwoColChange(e.target.checked)} />
          <span className="toggle-slider" />
        </span>
      </label>
      <div className="sl-option">
        <span>Font size</span>
        <div className="sl-font-btns">
          <button className="btn btn-ghost btn-sm" onClick={() => onFontChange(-1)}>
            A&#8722;
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onFontChange(1)}>
            A+
          </button>
          <button
            className={`btn btn-ghost btn-sm${fontSize === 0 ? ' disabled' : ''}`}
            onClick={onFontReset}
            disabled={fontSize === 0}
            title="Reset"
          >
            &#8634;
          </button>
        </div>
      </div>
      <div className="sl-option">
        <span>Line spacing</span>
        <div className="sl-font-btns">
          <button className="btn btn-ghost btn-sm" onClick={() => onLineSpacingChange(-0.1)} disabled={lineSpacing <= 1.1} aria-label="Decrease line spacing">−</button>
          <span aria-live="polite">{lineSpacing.toFixed(1)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onLineSpacingChange(0.1)} disabled={lineSpacing >= 2.2} aria-label="Increase line spacing">+</button>
        </div>
      </div>
    </div>
  );
}
