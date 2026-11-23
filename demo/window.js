// The website's frame in the demo: a desktop browser window (on narrow screens it fills the tab). The address bar
// follows the page the reader is on.
import { h } from '../site/util.js';

export function createWindow({ P }) {
  const root = h('div', { class: 'win-body', 'data-testid': 'site-app' });
  const url = h('span', { class: 'win-url', 'data-testid': 'site-url' }, 'bozor-narxi');
  const label = h('div', { class: 'side-label' });
  const frame = h('div', { class: 'win', 'data-testid': 'site-window' },
    h('div', { class: 'win-bar' }, h('span', { class: 'win-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), url), root);
  const side = h('section', { class: 'side side-win', 'data-who': 'site' }, label, frame);
  return {
    side, root,
    paint(path = '') {
      label.replaceChildren(h('b', {}, P('demo.site')), h('span', {}, P('demo.role_site')));
      url.textContent = `bozor-narxi${path ? ` / ${path}` : ''}`;
    },
  };
}
