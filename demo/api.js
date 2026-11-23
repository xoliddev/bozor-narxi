// The website's and the Mini App's APIs answered by the in-page backend instead of HTTP (the same method names as
// site/api.js and webapp/api.js, the same shapes and error codes as the server), so the page code is identical on the
// server and in the demo. Notes the backend returns become bot messages in the phones.
export function run(fn) {
  return Promise.resolve().then(() => {
    try {
      return structuredClone(fn());
    } catch (e) {
      if (!e.code) throw e;
      throw Object.assign(new Error(e.code), { code: e.code });
    }
  });
}

/** Runs an action that also returns notes: the notes go to the bots, the answer to the caller. */
const withNotes = (b, fn) => run(() => {
  const [out, notes] = fn();
  b.notify(notes);
  return out;
});

export function pubApi(b) {
  return {
    today: () => run(() => b.snapshot()),
    history: (product, days) => run(() => b.history(product, Number(days))),
    config: () => run(() => ({ bot: '' })),
  };
}

export function apiFor(b, uid) {
  return {
    me: () => run(() => b.me(uid)),
    setLang: (lang) => run(() => ({ lang: b.setLang(uid, lang) })),
    getList: () => run(() => ({ items: b.getList(uid) })),
    putList: (items) => run(() => ({ items: b.setList(uid, items) })),
    alerts: () => run(() => ({ items: b.alerts(uid) })),
    addAlert: (data) => withNotes(b, () => {
      const [items, notes] = b.addAlert(uid, data.product, data.below);
      return [{ items, fired: notes.length > 0 }, notes];
    }),
    removeAlert: (id) => run(() => ({ items: b.removeAlert(uid, id) })),
    setDigest: (on) => run(() => ({ digest: b.setDigest(uid, on) })),
    queue: () => run(() => ({ items: b.queue(uid) })),
    hide: (report) => withNotes(b, () => b.hide(uid, report)),
    ban: (user) => withNotes(b, () => b.ban(uid, user)),
  };
}

/** A shopping list kept in memory (the demo's website has no storage of its own). */
export function memoryList() {
  let items = [];
  return { load: async () => items.map((x) => ({ ...x })), save: async (next) => { items = next.map((x) => ({ ...x })); return items; } };
}
