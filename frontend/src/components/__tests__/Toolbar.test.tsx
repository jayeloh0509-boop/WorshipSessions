import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from '../Toolbar';

vi.mock('../KeyPicker', () => ({
  KeyPicker: () => null,
}));

const requiredProps = {
  currentKey: 'F',
  nashville: false,
  onNashvilleChange: vi.fn(),
  twoCol: false,
  onTwoColToggle: vi.fn(),
  fontSize: 0,
  onFontChange: vi.fn(),
  onReset: vi.fn(),
  onPickKey: vi.fn(),
};

describe('Toolbar chart controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the shared toolbar compatible when chart-tone controls are omitted', () => {
    render(<Toolbar {...requiredProps} />);

    expect(screen.getByRole('button', { name: 'Change key, currently F' })).toHaveTextContent('KEY F');
    expect(screen.getByRole('button', { name: 'Switch to two columns' })).toHaveTextContent('2-COL');
    expect(screen.queryByRole('button', { name: /chart/i })).not.toBeInTheDocument();
  });

  it('lets Song View override reset availability for non-font preferences', () => {
    const onReset = vi.fn();
    const { rerender } = render(<Toolbar {...requiredProps} onReset={onReset} resetDisabled={false} />);
    const reset = screen.getByTitle('Reset reading preferences');
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledOnce();

    rerender(<Toolbar {...requiredProps} onReset={onReset} resetDisabled />);
    expect(screen.getByTitle('Reset reading preferences')).toBeDisabled();
  });

  it('shows compact key and chart-tone controls only for Song View', () => {
    const onChartToneChange = vi.fn();
    render(<Toolbar {...requiredProps} compactKey chartTone="dark" onChartToneChange={onChartToneChange} />);

    expect(screen.getByRole('button', { name: 'Change key, currently F' })).toHaveTextContent('KEY');
    expect(screen.getByRole('button', { name: 'Switch to light chart' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light chart' }));
    expect(onChartToneChange).toHaveBeenCalledOnce();
  });
});
