// Ponte para o Android (Capacitor). Fora da APK (browser) IS_NATIVE é false e nada disto é usado.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";

export const IS_NATIVE = Capacitor.isNativePlatform();

// Plugin local: native/java/DriveAuthPlugin.java (login Google nativo, âmbito drive.file)
const DriveAuth = registerPlugin("DriveAuth");

const TOKEN_TTL_MS = 45 * 60 * 1000;   // o token vale ~1 h; renova-se antes
let token = null;
let expiresAt = 0;
let chain = Promise.resolve();          // serializa pedidos: nunca há 2 em simultâneo

export function authorize(interactive) {
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
  token = null;
  expiresAt = 0;
  try { if (bad) await DriveAuth.clearToken({ accessToken: bad }); } catch (_) { /* não é crítico */ }
}

// "Mudar de conta": invalida o token (e, no Google, o acesso desta app) para a escolha de conta voltar a aparecer
export async function revokeAndForget() {
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

export function onResume(cb) {
  if (!IS_NATIVE) return () => {};
  const h = App.addListener("appStateChange", (s) => { if (s && s.isActive) cb(); });
  return () => { Promise.resolve(h).then((x) => x.remove()).catch(() => {}); };
}

export function onBackButton(cb) {
  if (!IS_NATIVE) return () => {};
  const h = App.addListener("backButton", () => cb());
  return () => { Promise.resolve(h).then((x) => x.remove()).catch(() => {}); };
}

export function exitApp() {
  try { App.exitApp(); } catch (_) { /* ignora */ }
}
