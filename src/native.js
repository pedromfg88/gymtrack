// Ponte para o Android (Capacitor) e para a PWA (iPhone / browser). A app só importa este ficheiro.
//   APK: login Google nativo (DriveAuth), alarme do Android (RestAlarm), botão voltar.
//   PWA: login Google por redirecionamento (webauth.mjs) e aviso do temporizador só com a app aberta (webalarm.mjs).
// IS_NATIVE = "esta versão sincroniza com o Drive": true na APK e na PWA com o ID de cliente Google configurado.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { loadAccount } from "./store.mjs";
import { createWebAuth } from "./webauth.mjs";
import { createWebAlarm } from "./webalarm.mjs";

const IS_APK = Capacitor.isNativePlatform();

// ---- APK: plugins locais (native/java) ----
const DriveAuth = IS_APK ? registerPlugin("DriveAuth") : null;   // login Google nativo (âmbito drive.file)
const RestAlarm = IS_APK ? registerPlugin("RestAlarm") : null;   // alarme do temporizador de descanso

// ---- PWA: o ID de cliente vem do index.html (variável GOOGLE_CLIENT_ID do GitHub) ----
const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
const cfg = (!IS_APK && window.__GYMTRACK__) || {};
const web = IS_APK ? null : createWebAuth({
  clientId: String(cfg.googleClientId || ""),
  loc: window.location,
  hist: window.history,
  storage: store,
  fetchFn: (...a) => window.fetch(...a),
  navigate: (url) => window.location.assign(url),
  getHint: () => loadAccount(),
  online: () => window.navigator.onLine !== false,
});

export const IS_NATIVE = IS_APK || !!(web && web.enabled);
const alarm = !IS_APK && IS_NATIVE ? createWebAlarm({ win: window, storage: store }) : null;

// ---- login Google / token do Drive ----
const TOKEN_TTL_MS = 45 * 60 * 1000;   // (APK) o token vale ~1 h; renova-se antes
let token = null;
let expiresAt = 0;
let chain = Promise.resolve();          // (APK) serializa pedidos: nunca há 2 em simultâneo

export function authorize(interactive) {
  if (!IS_APK) return web.authorize(interactive);
  const run = chain.then(async () => {
    if (token && Date.now() < expiresAt) return token;
    const res = await DriveAuth.authorize({ interactive: !!interactive });
    token = res.accessToken;
    expiresAt = Date.now() + TOKEN_TTL_MS;
    return token;
  });
  chain = run.catch(() => {});
  return run;
}

export async function dropToken(bad) {
  if (!IS_APK) { web.dropToken(); return; }
  token = null;
  expiresAt = 0;
  try { if (bad) await DriveAuth.clearToken({ accessToken: bad }); } catch (_) { /* não é crítico */ }
}

// "Mudar de conta": invalida o token (e, no Google, o acesso desta app) para a escolha de conta voltar a aparecer
export async function revokeAndForget() {
  if (!IS_APK) { await web.revokeAndForget(); return; }
  const t = token;
  token = null;
  expiresAt = 0;
  if (!t) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=" + encodeURIComponent(t),
    });
  } catch (_) { /* melhor esforço */ }
  try { await DriveAuth.clearToken({ accessToken: t }); } catch (_) { /* melhor esforço */ }
}

// ---- ciclo de vida ----
export function onResume(cb) {
  if (IS_APK) {
    const h = App.addListener("appStateChange", (s) => { if (s && s.isActive) cb(); });
    return () => { Promise.resolve(h).then((x) => x.remove()).catch(() => {}); };
  }
  const on = () => { if (document.visibilityState === "visible") cb(); };
  document.addEventListener("visibilitychange", on);
  return () => document.removeEventListener("visibilitychange", on);
}

export function onBackButton(cb) {
  if (!IS_APK) return () => {};   // o iPhone não tem botão voltar
  const h = App.addListener("backButton", () => cb());
  return () => { Promise.resolve(h).then((x) => x.remove()).catch(() => {}); };
}

// ---- temporizador de descanso ----
// APK: o alarme é do Android (toca com o ecrã bloqueado). PWA: toca com a app aberta (ecrã mantido ligado).
export const scheduleAlarm = (seconds) => {
  if (IS_APK) return RestAlarm.schedule({ seconds }).catch(() => {});
  if (alarm) alarm.schedule(seconds);
  return Promise.resolve();
};
export const cancelAlarm = () => {
  if (IS_APK) return RestAlarm.cancel().catch(() => {});
  if (alarm) alarm.cancel();
  return Promise.resolve();
};
export const stopAlarm = () => {
  if (IS_APK) return RestAlarm.stop().catch(() => {});
  if (alarm) alarm.stop();
  return Promise.resolve();
};

export function exitApp() {
  if (!IS_APK) return;
  try { App.exitApp(); } catch (_) { /* ignora */ }
}
