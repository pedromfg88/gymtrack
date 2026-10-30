// Testes da parte web (PWA): login Google por redirecionamento e aviso do temporizador. Corre com: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_URL, REVOKE_URL, PROBE_URL, DRIVE_FILE_SCOPE, TOKEN_KEY, STATE_KEY, CHOOSER_KEY,
  redirectUriFor, buildAuthUrl, parseAuthHash, randomState, createWebAuth,
} from "../src/webauth.mjs";
import { ALARM_KEY, createWebAlarm } from "../src/webalarm.mjs";

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const flush = () => new Promise((r) => setTimeout(r, 5));
const BASE = "https://pedro.github.io/gymtrack/";
const CLIENT = "123-abc.apps.googleusercontent.com";
const NOW = 1_000_000;

function setup({ hash = "", storage = mem(), clientId = CLIENT, fetchFn, online, hint = "pedro@gmail.com" } = {}) {
  const loc = { origin: "https://pedro.github.io", pathname: "/gymtrack/", hash };
  const calls = { nav: [], replace: [], fetch: [] };
  const hist = { replaceState: (...a) => calls.replace.push(a) };
  const f = fetchFn || (async (...a) => { calls.fetch.push(a); return {}; });
  const auth = createWebAuth({ clientId, loc, hist, storage, fetchFn: f, navigate: (u) => calls.nav.push(u), getHint: () => hint, online, now: () => NOW, rand: () => "STATE123" });
  return { auth, loc, calls, storage };
}
const stored = (exp) => JSON.stringify({ t: "tok", e: exp });
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || e.name; } };

/* ---------- funções puras ---------- */
test("redirectUriFor: endereço da app com a '/' final, com ou sem index.html", () => {
  const o = "https://pedro.github.io";
  assert.equal(redirectUriFor({ origin: o, pathname: "/gymtrack/" }), BASE);
  assert.equal(redirectUriFor({ origin: o, pathname: "/gymtrack/index.html" }), BASE);
  assert.equal(redirectUriFor({ origin: o, pathname: "/gymtrack" }), BASE);
  assert.equal(redirectUriFor({ origin: o, pathname: "/" }), o + "/");
});

test("buildAuthUrl: pedido implicit com drive.file; login_hint na renovação, escolha de conta quando se muda de conta", () => {
  const a = new URL(buildAuthUrl({ clientId: CLIENT, redirectUri: BASE, state: "S", loginHint: "pedro@gmail.com" }));
  assert.equal(a.origin + a.pathname, AUTH_URL);
  assert.equal(a.searchParams.get("client_id"), CLIENT);
  assert.equal(a.searchParams.get("redirect_uri"), BASE);
  assert.equal(a.searchParams.get("response_type"), "token");
  assert.equal(a.searchParams.get("scope"), DRIVE_FILE_SCOPE);
  assert.equal(a.searchParams.get("state"), "S");
  assert.equal(a.searchParams.get("login_hint"), "pedro@gmail.com");
  assert.equal(a.searchParams.get("prompt"), null);
  const b = new URL(buildAuthUrl({ clientId: CLIENT, redirectUri: BASE, state: "S", loginHint: "pedro@gmail.com", chooser: true }));
  assert.equal(b.searchParams.get("prompt"), "select_account");
  assert.equal(b.searchParams.get("login_hint"), null);
  assert.equal(new URL(buildAuthUrl({ clientId: CLIENT, redirectUri: BASE, state: "S" })).searchParams.get("login_hint"), null);
});

test("parseAuthHash: token, erro, e lixo que não é do login", () => {
  assert.deepEqual(parseAuthHash("#access_token=ya29.a-b&token_type=Bearer&expires_in=3599&state=X"), { token: "ya29.a-b", expiresIn: 3599, state: "X" });
  assert.equal(parseAuthHash("#access_token=t&state=X").expiresIn, 3600);
  assert.deepEqual(parseAuthHash("#error=access_denied&state=X"), { error: "access_denied", state: "X" });
  for (const h of ["", "#", "#foo=bar", "#state=X", undefined]) assert.equal(parseAuthHash(h), null);
});

test("randomState: 32 caracteres hexadecimais e diferente de cada vez", () => {
  const a = randomState();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, randomState());
});

/* ---------- login ---------- */
test("sem token e sem pedido interativo: 'needs_consent' (a app mostra «Ligar ao Google Drive»)", async () => {
  const { auth } = setup();
  assert.equal(await code(auth.authorize(false)), "needs_consent");
  assert.equal(auth.enabled, true);
});

test("regresso do Google com o state certo: guarda o token, limpa o endereço e devolve o token", async () => {
  const storage = mem({ [STATE_KEY]: "STATE123" });
  const { auth, calls } = setup({ hash: "#access_token=ya29.x&token_type=Bearer&expires_in=3599&state=STATE123", storage });
  assert.deepEqual(calls.replace[0].slice(1), ["", BASE], "o token não fica no histórico");
  assert.equal(await auth.authorize(false), "ya29.x");
  assert.equal(storage.getItem(STATE_KEY), null);
  assert.equal(JSON.parse(storage.getItem(TOKEN_KEY)).e, NOW + 3599 * 1000);
  assert.equal(auth.hasToken(), true);
});

test("regresso com state diferente (ou sem pedido feito): ignora o token e avisa uma só vez", async () => {
  for (const storage of [mem({ [STATE_KEY]: "OUTRO" }), mem()]) {
    const { auth } = setup({ hash: "#access_token=ya29.x&expires_in=3599&state=STATE123", storage });
    assert.equal(storage.getItem(TOKEN_KEY), null);
    assert.equal(await code(auth.authorize(false)), "state_mismatch");
    assert.equal(await code(auth.authorize(false)), "needs_consent");
  }
});

test("regresso com erro: 'cancelled' se o utilizador recusou; outros erros mostram o código", async () => {
  const a = setup({ hash: "#error=access_denied&state=STATE123", storage: mem({ [STATE_KEY]: "STATE123" }) });
  assert.equal(await code(a.auth.authorize(false)), "cancelled");
  const b = setup({ hash: "#error=invalid_scope&state=STATE123", storage: mem({ [STATE_KEY]: "STATE123" }) });
  assert.equal(await code(b.auth.authorize(false)), "oauth_invalid_scope");
});

test("token guardado: usa-se enquanto falta mais de 2 min; depois pede-se outro", async () => {
  const ok = setup({ storage: mem({ [TOKEN_KEY]: stored(NOW + 10 * 60 * 1000) }) });
  assert.equal(await ok.auth.authorize(false), "tok");
  const caduco = setup({ storage: mem({ [TOKEN_KEY]: stored(NOW + 60 * 1000) }) });
  assert.equal(await code(caduco.auth.authorize(false)), "needs_consent");
  const lixo = setup({ storage: mem({ [TOKEN_KEY]: "{isto não é json" }) });
  assert.equal(await code(lixo.auth.authorize(false)), "needs_consent");
});

test("pedido interativo: confirma que há rede, guarda o state e abre o login com a conta já confirmada", async () => {
  const { auth, calls, storage } = setup();
  auth.authorize(true);                      // não resolve: a página é substituída pelo login
  await flush();
  assert.equal(calls.fetch[0][0], PROBE_URL);
  assert.equal(calls.nav.length, 1);
  const u = new URL(calls.nav[0]);
  assert.equal(u.searchParams.get("redirect_uri"), BASE);
  assert.equal(u.searchParams.get("state"), "STATE123");
  assert.equal(u.searchParams.get("login_hint"), "pedro@gmail.com");
  assert.equal(storage.getItem(STATE_KEY), "STATE123");
});

test("sem rede: não sai da app (uma página de erro não tem 'voltar'); a app mostra 'offline'", async () => {
  const off = setup({ online: () => false });
  assert.equal(await code(off.auth.authorize(true)), "TypeError");
  assert.equal(off.calls.nav.length, 0);
  assert.equal(off.storage.getItem(STATE_KEY), null);
  const dead = setup({ fetchFn: async () => { throw new TypeError("fetch failed"); } });
  assert.equal(await code(dead.auth.authorize(true)), "TypeError");
  assert.equal(dead.calls.nav.length, 0);
});

test("sem ID de cliente: não abre o login e a PWA fica só neste aparelho", async () => {
  const { auth, calls } = setup({ clientId: "" });
  assert.equal(auth.enabled, false);
  assert.equal(await code(auth.authorize(true)), "no_client");
  assert.equal(calls.nav.length, 0);
});

test("um pedido interativo ignora um erro antigo por mostrar", async () => {
  const { auth, calls } = setup({ hash: "#access_token=t&state=X" });   // state_mismatch por consumir
  auth.authorize(true);
  await flush();
  assert.equal(calls.nav.length, 1);
});

test("mudar de conta: anula o acesso no Google, esquece o token e a próxima ligação mostra a escolha de conta", async () => {
  const { auth, calls, storage } = setup({ storage: mem({ [TOKEN_KEY]: stored(NOW + 3600 * 1000) }) });
  await auth.revokeAndForget();
  assert.equal(calls.fetch[0][0], REVOKE_URL);
  assert.equal(calls.fetch[0][1].method, "POST");
  assert.equal(calls.fetch[0][1].body, "token=tok");
  assert.equal(storage.getItem(TOKEN_KEY), null);
  assert.equal(storage.getItem(CHOOSER_KEY), "1");
  calls.fetch.length = 0;
  auth.authorize(true);
  await flush();
  const u = new URL(calls.nav[0]);
  assert.equal(u.searchParams.get("prompt"), "select_account");
  assert.equal(u.searchParams.get("login_hint"), null);
  assert.equal(storage.getItem(CHOOSER_KEY), null, "só vale uma vez");
});

test("dropToken esquece o token rejeitado (401)", async () => {
  const { auth, storage } = setup({ storage: mem({ [TOKEN_KEY]: stored(NOW + 3600 * 1000) }) });
  auth.dropToken();
  assert.equal(storage.getItem(TOKEN_KEY), null);
  assert.equal(auth.hasToken(), false);
});

/* ---------- aviso do temporizador ---------- */
function fakeWin({ wake = true, audio = true, vibrate = true } = {}) {
  const timers = new Map();
  let id = 0;
  const log = { osc: 0, resumed: 0, vib: [], locks: 0, released: 0, sentinels: [] };
  class Ctx {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    resume() { log.resumed++; this.state = "running"; return Promise.resolve(); }
    createOscillator() { log.osc++; return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: {}, connect() {} }; }
  }
  const doc = {
    visibilityState: "visible",
    handlers: {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    removeEventListener(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev) { (this.handlers[ev] || []).slice().forEach((f) => f()); },
  };
  const win = {
    document: doc,
    navigator: {
      ...(vibrate ? { vibrate: (p) => log.vib.push(p) } : {}),
      ...(wake ? { wakeLock: { request: async () => {
        log.locks++;
        const s = { addEventListener(ev, fn) { s.onrelease = fn; }, release() { log.released++; } };
        log.sentinels.push(s);
        return s;
      } } } : {}),
    },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout: (i) => timers.delete(i),
  };
  if (audio) win.AudioContext = Ctx;
  return { win, timers, log, doc };
}
const clockAt = (t) => { const c = () => c.t; c.t = t; return c; };

test("descanso: arma o aviso, mantém o ecrã ligado e, à hora certa, toca 3 vezes, vibra e liberta o ecrã", async () => {
  const { win, timers, log } = fakeWin();
  const storage = mem();
  const now = clockAt(1000);
  const al = createWebAlarm({ win, storage, now });
  al.schedule(30);
  await flush();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 30000);
  assert.equal(storage.getItem(ALARM_KEY), "31000");
  assert.equal(log.locks, 1);
  assert.equal(log.resumed, 1, "som desbloqueado no toque que iniciou o descanso");
  now.t = 31000;
  [...timers.values()][0].fn();
  assert.equal(log.osc, 3);
  assert.deepEqual(log.vib, [[300, 150, 300]]);
  assert.equal(log.released, 1);
  assert.equal(storage.getItem(ALARM_KEY), null);
});

test("se a página só acordou muito depois do fim, já não toca (mas liberta o ecrã)", async () => {
  const { win, timers, log } = fakeWin();
  const now = clockAt(1000);
  const al = createWebAlarm({ win, storage: mem(), now });
  al.schedule(30);
  await flush();
  now.t = 60000;
  [...timers.values()][0].fn();
  assert.equal(log.osc, 0);
  assert.equal(log.released, 1);
});

test("cancelar/parar: anula o aviso, apaga o registo e liberta o ecrã; novo descanso substitui o anterior", async () => {
  const { win, timers, log } = fakeWin();
  const storage = mem();
  const al = createWebAlarm({ win, storage, now: clockAt(1000) });
  al.schedule(60);
  await flush();
  al.schedule(90);
  await flush();
  assert.equal(timers.size, 1, "só há um aviso armado");
  assert.equal([...timers.values()][0].ms, 90000);
  al.stop();
  assert.equal(timers.size, 0);
  assert.equal(storage.getItem(ALARM_KEY), null);
  assert.equal(log.released, 2);
});

test("página recarregada a meio do descanso: volta a armar o aviso; registo já passado é limpo", async () => {
  const a = fakeWin();
  createWebAlarm({ win: a.win, storage: mem({ [ALARM_KEY]: "11000" }), now: clockAt(1000) });
  assert.equal([...a.timers.values()][0].ms, 10000);
  const stale = mem({ [ALARM_KEY]: "500" });
  const b = fakeWin();
  createWebAlarm({ win: b.win, storage: stale, now: clockAt(1000) });
  assert.equal(b.timers.size, 0);
  assert.equal(stale.getItem(ALARM_KEY), null);
});

test("primeiro toque na app desbloqueia o som; ao voltar à app pede o ecrã ligado outra vez", async () => {
  const { win, doc, log } = fakeWin();
  const al = createWebAlarm({ win, storage: mem(), now: clockAt(1000) });
  doc.emit("touchend");
  assert.equal(log.resumed, 1);
  al.schedule(30);
  await flush();
  assert.equal(log.locks, 1);
  doc.visibilityState = "hidden";            // o sistema liberta o ecrã ligado em segundo plano
  log.sentinels[0].onrelease();
  doc.emit("visibilitychange");
  await flush();
  assert.equal(log.locks, 1, "em segundo plano não pede");
  doc.visibilityState = "visible";
  doc.emit("visibilitychange");
  await flush();
  assert.equal(log.locks, 2, "ao voltar pede outra vez");
  al.stop();
  doc.emit("visibilitychange");
  await flush();
  assert.equal(log.locks, 2, "depois de parar já não pede");
});

test("aparelho sem som, vibração ou ecrã ligado: não rebenta", async () => {
  const { win, timers } = fakeWin({ wake: false, audio: false, vibrate: false });
  const now = clockAt(1000);
  const al = createWebAlarm({ win, storage: mem(), now });
  al.schedule(30);
  await flush();
  now.t = 31000;
  [...timers.values()][0].fn();
  al.cancel();
});
