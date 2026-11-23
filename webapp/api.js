// The Mini App's API over HTTP: every call carries Telegram's signed initData (checked on the server). The browser
// demo passes an object with the same method names answered by its in-page backend (demo/api.js).
export function httpApi(initData, base = '/api') {
  async function call(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `tma ${initData}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'generic'), { code: data.error || 'generic' });
    return data;
  }
  const get = (p) => call('GET', p);
  const post = (p, b) => call('POST', p, b);
  return {
    me: () => get('/me'),
    setLang: (lang) => post('/lang', { lang }),
    getList: () => get('/list'),
    putList: (items) => post('/list', { items }),
    alerts: () => get('/alerts'),
    addAlert: (data) => post('/alerts', data),
    removeAlert: (id) => post('/alerts/remove', { id }),
    setDigest: (on) => post('/digest', { on }),
    queue: () => get('/mod/queue'),
    hide: (report) => post('/mod/hide', { report }),
    ban: (user) => post('/mod/ban', { user }),
  };
}
