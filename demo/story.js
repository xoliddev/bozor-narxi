// The guided story. Each step does what a person would do, through Dilshod's and Gulnora's phones (bot + Mini App)
// and the website in a browser window. Steps run in order (with pauses), all at once ("Hammasini ko'rsatish"), or
// clicked out of order: a step first quietly does whatever it needs from earlier steps. js-tests/demo.test.mjs runs the
// same steps headless, through the same simulated bots.
import { DILSHOD, GULNORA, GULNORA_HOME, MALIKA, SHERZOD, TROLL } from './seed.js';

export const STEPS = ['site', 'report', 'live', 'troll', 'confirm', 'list', 'alert', 'fire', 'moderate', 'week'];
export const LIST = [['mol', 20], ['kartoshka', 30], ['piyoz', 10], ['sabzi', 20], ['tuxum', 10], ['yog', 10], ['devzira', 10]];

/** Press the newest button with this callback data in a bot's chat (headless: straight on the simulated bot). */
function press(env, uid, data) {
  const bot = env.bots[uid];
  const msg = [...bot.messages].reverse().find((m) => m.kb.some((row) => row.some((b) => b.data === data)));
  bot.press(msg?.id ?? bot.messages[bot.messages.length - 1]?.id, data);
}

async function tap(env, uid, data) {
  if (env.ui && env.visible?.(uid)) await env.ui.botTap(uid, data);
  else press(env, uid, data);
}

async function say(env, uid, text) {
  if (env.ui && env.visible?.(uid)) await env.ui.botType(uid, text);
  else env.bots[uid].type(text);
}

function started(env, uid) {
  if (!env.bots[uid].messages.length) env.bots[uid].start();
}

const ACTIONS = {
  // 1. The website: today's prices. "Kartoshka eng arzon: Chorsu" (one report so far: "Kam ma'lumot").
  async 1(env) {
    const { ui, focus, pause } = env;
    focus('site');
    await ui?.site('');
    await pause(1800);
  },
  // 2. Dilshod is at Chorsu: Narx yuborish -> Chorsu -> Kartoshka -> "4 500". "Rahmat! Chorsuda kartoshka: bugun 4 500 so'm".
  async 2(env) {
    const { focus, pause } = env;
    if (!env.reported) {
      focus(DILSHOD, 'chat');
      await tap(env, DILSHOD, 'r');
      await tap(env, DILSHOD, 'r:chorsu');
      await tap(env, DILSHOD, 'r:chorsu:kartoshka');
      await pause(700);
      await say(env, DILSHOD, '4 500');
      env.reported = true;
    }
    await pause(1600);
  },
  // 3. The website's number and chart change at once: Chorsu 4 500, two reports.
  async 3(env) {
    const { ui, focus, pause } = env;
    focus('site');
    await ui?.site('p/kartoshka');
    await pause(2000);
  },
  // 4. Someone new writes "kartoshka 500": shubhali, the price does not move; they see a neutral answer, the moderator
  //    gets the report.
  async 4(env) {
    const { backend: b, focus, pause } = env;
    if (!env.trolled) {
      started(env, TROLL);
      press(env, TROLL, 'r:chorsu:kartoshka');
      env.bots[TROLL].type('kartoshka 500');
      env.trollReport = b.reports.length;
      env.trolled = true;
    }
    focus(DILSHOD, 'chat');
    await pause(2200);
  },
  // 5. Two regular reporters tap "✅ Shu narx": four reports agree, "Ishonchli".
  async 5(env) {
    const { ui, focus, pause } = env;
    if (!env.confirmed) {
      for (const uid of [MALIKA, SHERZOD]) {
        started(env, uid);
        press(env, uid, 'r:chorsu:kartoshka');
        press(env, uid, 'ok:chorsu:kartoshka');
      }
      env.confirmed = true;
    }
    focus('site');
    await ui?.site('p/kartoshka');
    await pause(1800);
  },
  // 6. Gulnora builds her shopping list in the Mini App and lets it use her location: the cheapest complete bazaar,
  //    the saving, distances, and the bazaars without devzira shown honestly.
  async 6(env) {
    const { backend: b, ui, focus, pause } = env;
    focus(GULNORA, 'app');
    if (!b.getList(GULNORA).length) {
      if (ui) await ui.list(LIST);
      else b.setList(GULNORA, LIST.map(([product, qty]) => ({ product, qty })));
    }
    if (ui) await ui.locate();
    env.basket = b.basketFor(GULNORA, GULNORA_HOME);
    await pause(2200);
  },
  // 7. Gulnora: "Piyoz 6 000 so'mdan arzon bo'lsa xabar ber" (now the cheapest is 6 200).
  async 7(env) {
    const { backend: b, ui, focus, pause } = env;
    focus(GULNORA, 'app');
    if (!b.alerts(GULNORA).some((a) => a.product === 'piyoz')) {
      if (ui) await ui.alert('piyoz', '6000');
      else b.addAlert(GULNORA, 'piyoz', 6000);
    }
    await pause(1600);
  },
  // 8. Dilshod reports piyoz 5 800 at Chorsu: two reports agree under her limit, the bot tells Gulnora (once).
  async 8(env) {
    const { focus, pause } = env;
    if (!env.piyoz) {
      focus(DILSHOD, 'chat');
      await tap(env, DILSHOD, 'r');
      await tap(env, DILSHOD, 'r:chorsu');
      await tap(env, DILSHOD, 'r:chorsu:piyoz');
      await say(env, DILSHOD, '5800');
      env.piyoz = true;
      await pause(900);
    }
    focus(GULNORA, 'chat');
    await pause(2000);
  },
  // 9. The moderator (Dilshod) hides the shubhali report: the price stays, the troll's trust drops.
  async 9(env) {
    const { backend: b, focus, pause } = env;
    focus(DILSHOD, 'chat');
    const r = b.reports[env.trollReport - 1];
    if (r && !r.hidden) await tap(env, DILSHOD, `qh:${r.id}`);
    await pause(2000);
  },
  // 10. The website's weekly view: "Bu hafta arzonladi: piyoz −12%".
  async 10(env) {
    const { ui, focus, pause } = env;
    focus('site');
    await ui?.site('week');
    await pause(1200);
  },
};

export async function runStep(n, env, quick = false, done = env.done ?? (env.done = new Set())) {
  for (let k = 1; k < n; k++) if (!done.has(k)) await runStep(k, env, true, done);
  const wait = quick ? async () => {} : env.wait ?? (async () => {});
  const ctx = new Proxy(env, { get: (target, key) => {
    if (key === 'ui') return quick ? null : target.ui;
    if (key === 'focus') return quick ? () => {} : target.focus ?? (() => {});
    if (key === 'pause') return (ms = 650) => wait(ms);
    return target[key];
  }, set: (target, key, value) => { target[key] = value; return true; } });
  await ACTIONS[n](ctx);
  done.add(n);
}
