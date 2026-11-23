// What the story "does with its fingers": taps on the bot's buttons and typing in the phones' chats, taps inside the
// real Mini App screens, and pages of the real website, so the guided story shows the very same UI a person would use.
import { GULNORA } from './seed.js';

export function makeUi({ phones, apps, site, wait }) {
  async function until(root, sel, ms = 8000) {
    for (let i = 0; i < ms / 50; i++) {
      const all = root.querySelectorAll(sel);
      const el = all[all.length - 1];
      if (el && !el.disabled) return el;
      await wait(50);
    }
    throw new Error(`demo: ${sel} did not appear`);
  }
  const app = (uid) => phones[uid].appRoot;
  const body = (uid) => app(uid).querySelector('.mapp-body');
  async function show(root, scroller, sel, gap = 120) {
    const el = await until(root, sel);
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - gap;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    await wait(380);
    return el;
  }
  /** Scroll only the chat (never the page) so `el` is in view. */
  function reveal(box, el) {
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTo({ top: box.scrollTop + r.top - b.top - 12, behavior: 'smooth' });
  }
  const tapIn = async (uid, sel, gap) => { (await show(app(uid), body(uid), sel, gap)).click(); await wait(260); };
  async function typeInto(el, value, every = 55) {
    el.focus?.({ preventScroll: true });
    for (let i = 1; i <= value.length; i++) {
      el.value = value.slice(0, i);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(every);
    }
  }

  return {
    async site(path) {
      await site.show(path);
      await wait(250);
    },
    async botTap(uid, data) {
      const chat = phones[uid].chat;
      const btn = await until(chat, `.kb-btn[data-cb="${CSS.escape(data)}"]`);
      reveal(chat, btn);
      btn.classList.add('pressing');
      await wait(420);
      const mid = btn.closest('.msg')?.dataset.mid;
      btn.click();
      await wait(120);
      const msg = chat.querySelector(`.msg[data-mid="${mid}"]`);
      if (msg) reveal(chat, msg);
      await wait(300);
    },
    async botType(uid, text) {
      const { input } = phones[uid];
      await typeInto(input, text, 90);
      await wait(200);
      input.form.requestSubmit();
      input.blur();
      await wait(500);
    },
    async list(items) {
      await apps[GULNORA].switchTab('list');
      for (const [pid, qty] of items) {
        await tapIn(GULNORA, `[data-testid=add-${pid}]`, 200);
        const p = site.ctx.pmap[pid];
        for (let q = 10; q < qty; q += p.step) await tapIn(GULNORA, `[data-testid=more-${pid}]`, 160);
      }
      await show(app(GULNORA), body(GULNORA), '[data-testid=list-best]', 80);
    },
    async locate() {
      await tapIn(GULNORA, '[data-testid=locate]', 120);
      await until(app(GULNORA), '[data-testid^=total-] .ldist');
      await show(app(GULNORA), body(GULNORA), '[data-testid=list-best]', 60);
    },
    async alert(pid, limit) {
      await apps[GULNORA].switchTab('alerts');
      const select = await until(app(GULNORA), '[data-testid=alert-product]');
      select.value = pid;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(500);
      await typeInto(await until(app(GULNORA), '[data-testid=alert-limit]'), limit, 120);
      await tapIn(GULNORA, '[data-testid=alert-add]', 200);
      await until(app(GULNORA), `[data-testid=alert-${pid}]`);
    },
  };
}
