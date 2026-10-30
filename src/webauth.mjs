/* ============================================================
   GymTrack — login Google na PWA (iPhone / browser)
   Fluxo "implicit" por redirecionamento da página inteira (o popup falha em apps instaladas).
   JavaScript puro, testado em Node (npm test): tudo o que toca no browser é injetado.
   ============================================================ */

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const PROBE_URL = "https://www.gstatic.com/generate_204";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const TOKEN_KEY = "gymtrack-web-token";
export const STATE_KEY = "gymtrack-web-state";
export const CHOOSER_KEY = "gymtrack-web-chooser";
const SAFETY_MS = 2 * 60 * 1000;   // o token conta como caducado 2 min antes do fim
const PROBE_MS = 4000;

const fail = (message, code) => Object.assign(new Error(message), { code });

// Endereço desta app tal como tem de estar registado no Google Cloud (com a "/" final)
export function redirectUriFor(loc) {
  const path = String(loc.pathname || "/").replace(/index\.html?$/i, "");
  return loc.origin + (path.endsWith("/") ? path : path + "/");
}

export function randomState(cryptoObj = globalThis.crypto) {
  const a = new Uint8Array(16);
  if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildAuthUrl({ clientId, redirectUri, state, loginHint, chooser }) {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "token", scope: DRIVE_FILE_SCOPE, state });
  if (chooser) p.set("prompt", "select_account");       // "Mudar de conta": mostra a escolha de conta
  else if (loginHint) p.set("login_hint", loginHint);   // renovação: salta a escolha de conta
  return AUTH_URL + "?" + p.toString();
}

// Lê o que a Google devolve no endereço: #access_token=…&expires_in=…&state=…  ou  #error=…
export function parseAuthHash(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!h) return null;
  const p = new URLSearchParams(h);
  const state = p.get("state") || "";
  if (p.get("error")) return { error: p.get("error"), state };
  const token = p.get("access_token");
  if (!token) return null;
  const secs = parseInt(p.get("expires_in"), 10);
  return { token, expiresIn: Number.isFinite(secs) && secs > 0 ? secs : 3600, state };
}

/* Tudo o que é do browser vem de fora (para se testar em Node):
   loc/hist = window.location/history · storage = localStorage · fetchFn = fetch
   navigate(url) = abrir o login · getHint() = e-mail da conta confirmada · online() = navigator.onLine */
export function createWebAuth({ clientId, loc, hist, storage, fetchFn, navigate, getHint, online, now, rand }) {
  const clock = now || Date.now;
  const newState = rand || randomState;
  const get = (k) => { try { return storage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { storage.setItem(k, v); } catch (_) { /* ignora */ } };
  const del = (k) => { try { storage.removeItem(k); } catch (_) { /* ignora */ } };
  let pending = null;   // erro do último regresso da Google; mostra-se uma só vez

  function rawToken() {
    try { const x = JSON.parse(get(TOKEN_KEY)); return x && x.t ? x : null; } catch (_) { return null; }
  }
  function readToken() {
    const x = rawToken();
    return x && x.e > clock() + SAFETY_MS ? x.t : null;
  }
  function saveToken(token, secs) {
    set(TOKEN_KEY, JSON.stringify({ t: token, e: clock() + secs * 1000 }));
  }

  // Regresso da Google: o endereço traz o token (ou o erro). Trata-se logo ao arrancar e limpa-se do histórico.
  function handleReturn() {
    const r = parseAuthHash(loc.hash);
    if (!r) return;
    try { hist.replaceState(null, "", redirectUriFor(loc)); } catch (_) { /* ignora */ }
    const expected = get(STATE_KEY);
    del(STATE_KEY);
    if (!expected || r.state !== expected) {
      pending = fail("O login Google não voltou à mesma app. Abre o GymTrack a partir do ecrã principal e toca em «Ligar ao Google Drive».", "state_mismatch");
      return;
    }
    if (r.error) {
      pending = r.error === "access_denied" ? fail("Autorização cancelada.", "cancelled") : fail("Google: " + r.error, "oauth_" + r.error);
      return;
    }
    saveToken(r.token, r.expiresIn);
  }
  handleReturn();

  // Antes de sair para o login confirma-se que há rede: numa app instalada, uma página de erro não tem "voltar".
  async function reachable() {
    if (online && !online()) return false;
    if (!fetchFn) return true;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), PROBE_MS) : null;
    try {
      await fetchFn(PROBE_URL, { mode: "no-cors", cache: "no-store", signal: ctl ? ctl.signal : undefined });
      return true;
    } catch (_) {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function authorize(interactive) {
    const t = readToken();
    if (t) return t;
    if (!interactive) {
      if (pending) { const e = pending; pending = null; throw e; }
      throw fail("É necessário autorizar o acesso ao Google Drive.", "needs_consent");
    }
    pending = null;
    if (!clientId) throw fail("Esta PWA não tem o ID de cliente Google configurado.", "no_client");
    if (!(await reachable())) throw new TypeError("Sem rede: não foi possível abrir o login Google.");
    const state = newState();
    set(STATE_KEY, state);
    const chooser = get(CHOOSER_KEY) === "1";
    del(CHOOSER_KEY);
    navigate(buildAuthUrl({ clientId, redirectUri: redirectUriFor(loc), state, loginHint: getHint ? getHint() : "", chooser }));
    return new Promise(() => {});   // a página vai ser substituída pelo login da Google
  }

  function dropToken() { del(TOKEN_KEY); }

  // "Mudar de conta": anula o acesso desta app e a próxima ligação volta a mostrar a escolha de conta
  async function revokeAndForget() {
    const x = rawToken();
    del(TOKEN_KEY);
    set(CHOOSER_KEY, "1");
    if (!x || !fetchFn) return;
    try {
      await fetchFn(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "token=" + encodeURIComponent(x.t) });
    } catch (_) { /* melhor esforço */ }
  }

  return { enabled: !!clientId, authorize, dropToken, revokeAndForget, hasToken: () => !!readToken() };
}
