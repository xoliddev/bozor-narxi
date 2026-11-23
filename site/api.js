// The website's API over HTTP (public, no sign-in). The browser demo passes an object with the same method names
// answered by its in-page backend (demo/api.js), so the page code is identical on the server and in the demo.
export function publicApi(base = '/api/public') {
  async function get(path) {
    const res = await fetch(`${base}${path}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'generic'), { code: data.error || 'generic' });
    return data;
  }
  return {
    today: () => get('/today'),
    history: (product, days) => get(`/history?product=${encodeURIComponent(product)}&days=${days}`),
    config: () => get('/config'),
  };
}

/** The shopping list kept in this browser (the Mini App keeps it on the server, shared with the bot). */
export function localList(store, key = 'bozornarxi.list') {
  return {
    load: async () => {
      try {
        const items = JSON.parse(store.get(key) ?? '[]');
        return Array.isArray(items) ? items.filter((x) => x && typeof x.product === 'string' && Number.isInteger(x.qty)).slice(0, 20) : [];
      } catch {
        return [];
      }
    },
    save: async (items) => {
      store.set(key, JSON.stringify(items));
      return items;
    },
  };
}
