import { describe, expect, it } from 'vitest';
import { createLayout } from './layout';

/** The divider drag must end however the touch ends (sideways scan, finding 10). */

const drag = (type: string, x: number) => {
  const e = new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  return e;
};

describe('divider drag', () => {
  for (const ending of ['pointercancel', 'lostpointercapture']) {
    it(`stops following the pointer after ${ending}`, () => {
      const host = document.createElement('main');
      document.body.appendChild(host);
      const layout = createLayout(host, { orientation: 'columns' });
      const panes = host.querySelector<HTMLElement>('#panes')!;
      const splitter = host.querySelector<HTMLElement>('#splitter')!;
      panes.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;
      splitter.setPointerCapture = () => undefined;
      const before = layout.getSplit();
      splitter.dispatchEvent(drag('pointerdown', 500));
      splitter.dispatchEvent(drag(ending, 500));
      splitter.dispatchEvent(drag('pointermove', 700));
      expect(layout.getSplit()).toBe(before);
      host.remove();
    });
  }
});
