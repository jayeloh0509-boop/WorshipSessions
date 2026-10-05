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
  highContrast: boolean;
  onHighContrastChange: (value: boolean) => void;
  holdToAdvance: boolean;
  onHoldToAdvanceChange: (value: boolean) => void;
  chartTone?: 'paper' | 'dark';
  onChartToneChange?: (value: 'paper' | 'dark') => void;
}
export function SettingsPanel({
  nashville, onNashvilleChange, hideYt, onHideYtChange, twoCol, onTwoColChange,
  fontSize, onFontChange, onFontReset, lineSpacing, onLineSpacingChange,
  highContrast, onHighContrastChange, holdToAdvance, onHoldToAdvanceChange,
  chartTone = 'dark', onChartToneChange,
}: SettingsPanelProps) {
  return (
    <div className="sl-options-panel">
      <div className="sl-options-title">Setlist defaults (all songs)</div>
      {[
        ['Number notation', nashville, onNashvilleChange],
        ['Hide YouTube', hideYt, onHideYtChange],
        ['Multi-column layout', twoCol, onTwoColChange],
        ['High contrast', highContrast, onHighContrastChange],
        ['Hold Next on touch', holdToAdvance, onHoldToAdvanceChange],
      ].map(([label, checked, onChange]) => (
        <label className="sl-option" key={label as string}>
          <span>{label as string}</span><span className="toggle">
            <input type="checkbox" checked={checked as boolean} onChange={(e) => (onChange as (v: boolean) => void)(e.target.checked)} />
            <span className="toggle-slider" />
          </span>
        </label>
      ))}
      <div className="sl-option"><span>Theme</span><div className="sl-font-btns">
        <button className="btn btn-ghost btn-sm" aria-pressed={chartTone === 'paper'} onClick={() => onChartToneChange?.('paper')}>Paper</button>
        <button className="btn btn-ghost btn-sm" aria-pressed={chartTone === 'dark'} onClick={() => onChartToneChange?.('dark')}>Dark</button>
      </div></div>
      <div className="sl-option"><span>Font size</span><div className="sl-font-btns">
        <button className="btn btn-ghost btn-sm" onClick={() => onFontChange(-1)}>A&#8722;</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onFontChange(1)}>A+</button>
        <button className="btn btn-ghost btn-sm" onClick={onFontReset} disabled={fontSize === 0} title="Reset">&#8634;</button>
      </div></div>
      <div className="sl-option"><span>Line spacing</span><div className="sl-font-btns">
        <button className="btn btn-ghost btn-sm" onClick={() => onLineSpacingChange(-0.1)} disabled={lineSpacing <= 1.1} aria-label="Decrease line spacing">−</button>
        <span aria-live="polite">{lineSpacing.toFixed(1)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onLineSpacingChange(0.1)} disabled={lineSpacing >= 2.2} aria-label="Increase line spacing">+</button>
      </div></div>
    </div>
  );
}
