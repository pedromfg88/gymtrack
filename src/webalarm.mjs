/* ============================================================
   GymTrack — aviso do temporizador de descanso na PWA
   Só funciona com a app aberta (o iPhone suspende as páginas em segundo plano):
   mantém o ecrã ligado enquanto o descanso corre e toca no fim. JS puro, testado em Node.
   ============================================================ */

export const ALARM_KEY = "gymtrack-web-alarm";
const MAX_LATE_MS = 5000;   // se a página só acordou depois do fim, já não toca

export function createWebAlarm({ win, storage, now }) {
  const clock = now || Date.now;
  const doc = win.document;
  let timer = 0;
  let ctx = null;
  let lock = null;
  let wantLock = false;

  const keep = (v) => { try { storage.setItem(ALARM_KEY, String(v)); } catch (_) { /* ignora */ } };
  const forget = () => { try { storage.removeItem(ALARM_KEY); } catch (_) { /* ignora */ } };

  // O iOS só deixa tocar som depois de um toque do utilizador: desbloqueia-se ao iniciar o descanso
  // (e no primeiro toque em qualquer sítio da app).
  function unlock() {
    try {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) { /* sem som */ }
  }

  async function holdScreen() {
    wantLock = true;
    try {
      const wl = win.navigator && win.navigator.wakeLock;
      if (!wl || lock) return;
      const l = await wl.request("screen");
      lock = l;
      if (l.addEventListener) l.addEventListener("release", () => { if (lock === l) lock = null; });
    } catch (_) { lock = null; }
  }

  function releaseScreen() {
    wantLock = false;
    const l = lock;
    lock = null;
    try { if (l) l.release(); } catch (_) { /* ignora */ }
  }

  function beep() {
    try {
      unlock();
      if (ctx) {
        const t0 = ctx.currentTime;
        [0, 0.35, 0.7].forEach((d) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.value = 0.3;
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t0 + d);
          o.stop(t0 + d + 0.25);
        });
      }
      if (win.navigator && win.navigator.vibrate) win.navigator.vibrate([300, 150, 300]);
    } catch (_) { /* sem som */ }
  }

  function fire(target) {
    timer = 0;
    forget();
    releaseScreen();
    if (clock() - target <= MAX_LATE_MS) beep();
  }

  function cancel() {
    if (timer) win.clearTimeout(timer);
    timer = 0;
    forget();
    releaseScreen();
  }

  function schedule(seconds) {
    cancel();
    unlock();
    const target = clock() + seconds * 1000;
    keep(target);
    timer = win.setTimeout(() => fire(target), seconds * 1000);
    holdScreen();
  }

  // Se a página recarregou a meio de um descanso (ex.: ao voltar do login Google), volta a armar o aviso
  let saved = 0;
  try { saved = parseInt(storage.getItem(ALARM_KEY), 10) || 0; } catch (_) { saved = 0; }
  if (saved > clock()) {
    timer = win.setTimeout(() => fire(saved), saved - clock());
    holdScreen();
  } else if (saved) {
    forget();
  }

  const arm = () => {
    unlock();
    if (ctx && ctx.state === "running") ["touchend", "click"].forEach((ev) => doc.removeEventListener(ev, arm, true));
  };
  ["touchend", "click"].forEach((ev) => doc.addEventListener(ev, arm, true));
  // O ecrã ligado perde-se quando a app vai para segundo plano: pede-se outra vez ao voltar
  doc.addEventListener("visibilitychange", () => { if (wantLock && doc.visibilityState === "visible") holdScreen(); });

  return { schedule, cancel, stop: cancel, unlock };
}
