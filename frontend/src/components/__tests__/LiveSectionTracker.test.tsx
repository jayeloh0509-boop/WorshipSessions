import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { LiveSectionTracker } from '../LiveSectionTracker';

function setup(labels = ['Intro', 'Verse 1', 'Chorus', 'Verse 1']) {
  const viewport = document.createElement('div');
  document.body.append(viewport);
  let scroll = 0;
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, get: () => scroll });
  viewport.getBoundingClientRect = () => ({ top: 0, right: 390 } as DOMRect);
  viewport.innerHTML = labels.map(label => `<div class="paragraph"><div class="label">${label}</div></div>`).join('');
  viewport.querySelectorAll<HTMLElement>('.label').forEach((label, i) => {
    Object.defineProperty(label, 'offsetTop', { configurable: true, value: i * 200 });
    label.getBoundingClientRect = () => ({ top: i * 200 - scroll, left: 0 } as DOMRect);
  });
  const scrollToMock = vi.fn() as unknown as typeof viewport.scrollTo & { mockImplementation: (fn: (optionsOrX: ScrollToOptions | number) => void) => unknown };
  scrollToMock.mockImplementation((optionsOrX) => { scroll = typeof optionsOrX === 'number' ? optionsOrX : optionsOrX.top ?? 0; viewport.dispatchEvent(new Event('scroll')); });
  viewport.scrollTo = scrollToMock;
  const viewportRef = createRef<HTMLDivElement>();
  viewportRef.current = viewport;
  const onNavigate = vi.fn();
  const result = render(<LiveSectionTracker viewportRef={viewportRef} chartKey="first" onNavigate={onNavigate} />);
  return { ...result, viewport, viewportRef, onNavigate, scrollTo: (top: number) => act(() => viewport.scrollTo({ top })) };
}

describe('LiveSectionTracker', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('follows scrolling and targets repeated section occurrences in order', () => {
    const view = setup();
    expect(screen.getByLabelText('Current chart section')).toHaveTextContent('Intro');
    fireEvent.click(screen.getByRole('button', { name: 'Next section: Verse 1' }));
    expect(view.onNavigate).toHaveBeenCalledTimes(1);
    expect(view.viewport.scrollTo).toHaveBeenLastCalledWith({ top: 196, behavior: 'instant' });
    expect(screen.getByLabelText('Current chart section')).toHaveTextContent('Verse 1');
    view.scrollTo(400);
    expect(screen.getByLabelText('Current chart section')).toHaveTextContent('Chorus');
    fireEvent.click(screen.getByRole('button', { name: 'Next section: Verse 1' }));
    expect(view.viewport.scrollTo).toHaveBeenLastCalledWith({ top: 596, behavior: 'instant' });
    expect(screen.getByText('End of chart')).toBeInTheDocument();
    view.scrollTo(0);
    expect(screen.getByLabelText('Current chart section')).toHaveTextContent('Intro');
  });

  it('updates labels after changing chart and never retains the old section', () => {
    const view = setup();
    view.scrollTo(400);
    view.viewport.innerHTML = '<div class="label">Bridge</div>';
    view.rerender(<LiveSectionTracker viewportRef={view.viewportRef} chartKey="second" onNavigate={view.onNavigate} />);
    expect(screen.getByLabelText('Current chart section')).toHaveTextContent('Bridge');
    expect(screen.queryByText('Chorus')).not.toBeInTheDocument();
    expect(screen.getByText('End of chart')).toBeInTheDocument();
  });

  it('uses live DOM targets when the chart HTML is replaced without a key change', () => {
    const view = setup();
    const replacement = view.viewport.cloneNode(true) as HTMLDivElement;
    view.viewport.replaceChildren(...Array.from(replacement.childNodes));
    view.viewport.querySelectorAll<HTMLElement>('.label').forEach((node, index) => {
      node.getBoundingClientRect = () => ({ top: index * 250, left: 0 } as DOMRect);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next section: Verse 1' }));
    expect(view.viewport.scrollTo).toHaveBeenLastCalledWith({ top: 246, behavior: 'instant' });
  });

  it('renders nothing for a chart without section labels', () => {
    const view = setup([]);
    expect(view.container).toBeEmptyDOMElement();
  });
});
