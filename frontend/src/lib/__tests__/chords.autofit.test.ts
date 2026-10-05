import { autoFit } from '../chords';

function mount(heights: { wrapClient: number; scrollHeight: number }) {
  document.body.innerHTML =
    '<div class="chord-sheet-wrap"><div id="chord-output"><div class="row"><span class="column"></span></div></div></div>';
  const wrap = document.querySelector('.chord-sheet-wrap') as HTMLElement;
  const output = document.querySelector('#chord-output') as HTMLElement;
  Object.defineProperty(wrap, 'clientHeight', { configurable: true, get: () => heights.wrapClient });
  Object.defineProperty(wrap, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(wrap, 'scrollWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(output, 'scrollHeight', { configurable: true, get: () => heights.scrollHeight });
  return { wrap, output };
}

describe('autoFit', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  it('keeps the normal font and one column when the song already fits', () => {
    mount({ wrapClient: 1000, scrollHeight: 400 });
    expect(autoFit()).toEqual({ fontSize: 0, twoCol: false });
  });

  it('leaves font and columns alone when nothing fits, instead of forcing the smallest font', () => {
    const { wrap } = mount({ wrapClient: 200, scrollHeight: 5000 });
    wrap.classList.add('two-col');
    expect(autoFit()).toEqual({ fontSize: 0, twoCol: true });
    // original layout restored
    expect(wrap.classList.contains('two-col')).toBe(true);
  });

  it('rejects a layout that pushes a line off the side', () => {
    const { wrap } = mount({ wrapClient: 1000, scrollHeight: 400 });
    Object.defineProperty(wrap, 'scrollWidth', { configurable: true, get: () => 1200 });
    // every candidate overflows horizontally, so nothing fits
    expect(autoFit()).toEqual({ fontSize: 0, twoCol: false });
  });
});
