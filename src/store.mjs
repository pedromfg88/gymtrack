/* ============================================================
   GymTrack — dados
   Cache local (telemóvel) + ficheiro CSV no Google Drive.
   JavaScript puro (sem React): é testado em Node (npm test).
   ============================================================ */

export const FOLDER_NAME = "GymTrack";
export const BACKUP_FOLDER_NAME = "Backups";
export const CSV_NAME = "gymtrack-registos.csv";
export const LOCAL_KEY = "gymtrack-data";
export const ACCOUNT_KEY = "gymtrack-account";
const BACKUP_KEEP = 30;

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const ABOUT = "https://www.googleapis.com/drive/v3/about";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/* ---------- utilitários ---------- */

// Nome do exercício -> chave do histórico ("Hack Squat" tem sempre a mesma chave)
export const exerciseKey = (name) =>
  String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const pad = (n) => String(n).padStart(2, "0");
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Data local (não UTC) em formato AAAA-MM-DD
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- CSV ----------
   Formato: UTF-8 com BOM, separador ";" e vírgula decimal (abre bem no Excel PT).
   Uma linha por série:  data;plano;ciclo;exercicio;serie;peso_kg;reps;atualizado
   Uma linha com serie/peso/reps vazios = "dia apagado" (para o apagar chegar ao Drive). */

const BOM = "\uFEFF";
const SEP = ";";
const HEADER = ["data", "plano", "ciclo", "exercicio", "serie", "peso_kg", "reps", "atualizado"];

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const fmtWeight = (w) => String(w == null ? "" : w).replace(".", ",");
const fmtStamp = (ms) => (ms > 0 ? new Date(ms).toISOString() : "");

export function logsToCsv(logs, names = {}) {
  const rows = [];
  for (const [key, entries] of Object.entries(logs || {})) {
    const name = (names && names[key]) || key;
    for (const e of entries || []) {
      if (!e || !e.date) continue;
      const stamp = fmtStamp(e.u || 0);
      const head = [e.date, e.p || "", e.c || "", name];
      const sets = e.sets || [];
      if (sets.length === 0) {
        rows.push({ d: e.date, n: name, i: 0, c: [...head, "", "", "", stamp] });
      } else {
        sets.forEach((s, i) =>
          rows.push({ d: e.date, n: name, i: i + 1, c: [...head, String(i + 1), fmtWeight(s.weight), String(s.reps == null ? "" : s.reps), stamp] })
        );
      }
    }
  }
  rows.sort((a, b) => cmp(a.d, b.d) || cmp(a.n, b.n) || a.i - b.i);
  const lines = [HEADER, ...rows.map((r) => r.c)].map((r) => r.map(cell).join(SEP));
  return BOM + lines.join("\r\n") + "\r\n";
}

function splitTable(text, sep) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const ALIASES = {
  data: "data", date: "data",
  plano: "plano", plan: "plano",
  ciclo: "ciclo", cycle: "ciclo",
  exercicio: "exercicio", exercise: "exercicio",
  serie: "serie", set: "serie",
  peso_kg: "peso", peso: "peso", weight: "peso", kg: "peso",
  reps: "reps", repeticoes: "reps",
  atualizado: "u", updated: "u",
};

// Aceita AAAA-MM-DD e também D/M/AAAA (caso o Excel reformate a coluna)
function normDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return "";
}
const normNum = (s) => String(s || "").trim().replace(",", ".");
const parseStamp = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? 0 : t; };

// Lança erro se o ficheiro não tiver o formato esperado (para NUNCA o sobrescrever às cegas).
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  if (!src.trim()) return { logs: {}, names: {}, skipped: 0 };
  const firstLine = src.split(/\r?\n/, 1)[0];
  const sep = [";", ",", "\t"].map((c) => [c, firstLine.split(c).length - 1]).sort((a, b) => b[1] - a[1])[0][0];
  const table = splitTable(src, sep);
  const idx = {};
  table[0].forEach((h, i) => {
    const k = ALIASES[exerciseKey(h)];
    if (k && idx[k] === undefined) idx[k] = i;
  });
  if (idx.data === undefined || idx.exercicio === undefined) {
    throw new Error("O ficheiro de registos no Drive não tem o formato esperado (faltam as colunas data/exercicio). Não foi alterado.");
  }

  const groups = new Map();
  const names = {};
  let skipped = 0;
  for (const r of table.slice(1)) {
    if (r.every((c) => String(c).trim() === "")) continue;
    const get = (k) => (idx[k] === undefined ? "" : String(r[idx[k]] == null ? "" : r[idx[k]]).trim());
    const date = normDate(get("data"));
    const name = get("exercicio");
    const key = name ? exerciseKey(name) : "";
    if (!date || !key) { skipped++; continue; }
    if (!names[key]) names[key] = name;
    const id = key + "|" + date;
    let g = groups.get(id);
    if (!g) { g = { key, date, p: "", c: "", u: 0, sets: new Map() }; groups.set(id, g); }
    g.p = g.p || get("plano");
    g.c = g.c || get("ciclo");
    g.u = Math.max(g.u, parseStamp(get("u")));
    const serie = parseInt(get("serie"), 10);
    const weight = normNum(get("peso"));
    const reps = get("reps");
    if (weight !== "" || reps !== "") {
      g.sets.set(Number.isFinite(serie) && serie > 0 ? serie : g.sets.size + 1, { weight, reps });
    }
  }

  const logs = {};
  for (const g of groups.values()) {
    const entry = { date: g.date, sets: [...g.sets.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s) };
    if (g.p) entry.p = g.p;
    if (g.c) entry.c = g.c;
    if (g.u) entry.u = g.u;
    (logs[g.key] = logs[g.key] || []).push(entry);
  }
  for (const k of Object.keys(logs)) logs[k].sort((a, b) => cmp(a.date, b.date));
  return { logs, names, skipped };
}

/* ---------- registos em memória ----------
   logs = { chaveDoExercicio: [ { date, sets:[{weight,reps}], p?, c?, u } ] }
   u = hora da última alteração (ms). Entrada com sets vazio = dia apagado. */

// Junta dois conjuntos de registos sem perder nada: por exercício+dia ganha a alteração
// mais recente (u); em empate ganha o 2.º argumento (o do Drive).
export function mergeLogsU(local, remote) {
  const out = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  for (const k of keys) {
    const byDate = new Map();
    for (const e of (local && local[k]) || []) byDate.set(e.date, e);
    for (const e of (remote && remote[k]) || []) {
      const cur = byDate.get(e.date);
      if (!cur || (e.u || 0) >= (cur.u || 0)) byDate.set(e.date, e);
    }
    out[k] = [...byDate.values()].sort((a, b) => cmp(a.date, b.date));
  }
  return out;
}

// O que a interface mostra: sem os "dias apagados"
export function liveLogs(logs) {
  const out = {};
  for (const [k, entries] of Object.entries(logs || {})) {
    const live = (entries || []).filter((e) => e.sets && e.sets.length > 0);
    if (live.length) out[k] = live;
  }
  return out;
}

// Guarda (ou apaga, se sets estiver vazio) o registo de um exercício num dia.
export function setDayEntry(logs, key, date, sets, meta = {}, now = Date.now()) {
  const list = logs[key] || [];
  const prev = list.find((e) => e.date === date);
  const entry = { date, sets: sets || [], u: Math.max(now, prev && prev.u ? prev.u + 1 : 0) };
  if (entry.sets.length && meta.p) entry.p = meta.p;
  if (entry.sets.length && meta.c) entry.c = meta.c;
  return { ...logs, [key]: [...list.filter((e) => e.date !== date), entry] };
}

export function loadLocal(storage) {
  try {
    const st = storage || globalThis.localStorage;
    const raw = st.getItem(LOCAL_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { logs: p.logs || {}, names: p.names || {} };
    }
  } catch (_) { /* cai para vazio */ }
  return { logs: {}, names: {} };
}

export function saveLocal(data, storage) {
  try {
    const st = storage || globalThis.localStorage;
    st.setItem(LOCAL_KEY, JSON.stringify({ v: 2, logs: data.logs, names: data.names }));
    return true;
  } catch (e) {
    console.error("Falha ao guardar localmente:", e);
    return false;
  }
}

// Conta Google que o utilizador confirmou como "a minha" (só essa pode receber os registos)
export function loadAccount(storage) {
  try { return ((storage || globalThis.localStorage).getItem(ACCOUNT_KEY) || "").trim().toLowerCase(); } catch (_) { return ""; }
}
export function saveAccount(email, storage) {
  try { (storage || globalThis.localStorage).setItem(ACCOUNT_KEY, String(email).trim().toLowerCase()); } catch (_) { /* ignora */ }
}
export function clearAccount(storage) {
  try { (storage || globalThis.localStorage).removeItem(ACCOUNT_KEY); } catch (_) { /* ignora */ }
}

/* ---------- Google Drive (API REST) ---------- */

export function createDrive({ getToken, onBadToken, fetchFn }) {
  const doFetch = (...a) => (fetchFn || globalThis.fetch)(...a);
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function api(url, opts = {}, retried = false) {
    const token = await getToken();
    const res = await doFetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token } });
    if (res.status === 401 && !retried) {
      await onBadToken(token);          // limpa o token rejeitado e pede outro, sem ecrãs
      return api(url, opts, true);
    }
    return res;
  }

  async function fail(res, what) {
    let t = "";
    try { t = (await res.text()).slice(0, 160); } catch (_) { /* ignora */ }
    const e = new Error(`${what} (${res.status})${t ? ": " + t : ""}`);
    e.status = res.status;
    return e;
  }

  async function list(q, extra = "") {
    const url = `${FILES}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name,createdTime)")}&spaces=drive&pageSize=100${extra}`;
    const res = await api(url);
    if (!res.ok) throw await fail(res, "Erro ao procurar no Drive");
    return (await res.json()).files || [];
  }

  return {
    async about() {
      const res = await api(`${ABOUT}?fields=${encodeURIComponent("user(emailAddress,displayName)")}`);
      if (!res.ok) throw await fail(res, "Erro ao identificar a conta Google");
      const u = (await res.json()).user || {};
      return { email: String(u.emailAddress || "").trim().toLowerCase(), name: u.displayName || "" };
    },
    async ensureFolder(name, parentId) {
      const found = await list(`name='${esc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parentId}' in parents`);
      if (found[0]) return found[0].id;
      const meta = { name, mimeType: FOLDER_MIME };
      if (parentId && parentId !== "root") meta.parents = [parentId];   // sem "parents" fica na raiz do Drive
      const res = await api(`${FILES}?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      if (!res.ok) throw await fail(res, "Erro ao criar pasta no Drive");
      return (await res.json()).id;
    },
    async findFile(name, parentId) {
      const found = await list(`name='${esc(name)}' and trashed=false and '${parentId}' in parents`, "&orderBy=createdTime");
      return found[0] || null;
    },
    async listIn(parentId) {
      return list(`trashed=false and '${parentId}' in parents`);
    },
    async download(id) {
      const res = await api(`${FILES}/${id}?alt=media`);
      if (!res.ok) throw await fail(res, "Erro ao ler o ficheiro do Drive");
      return res.text();
    },
    async create(name, parentId, text) {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name, parents: [parentId], mimeType: "text/csv" })], { type: "application/json" }));
      form.append("file", new Blob([text], { type: "text/csv;charset=utf-8" }));
      const res = await api(`${UPLOAD}?uploadType=multipart&fields=id,name`, { method: "POST", body: form });
      if (!res.ok) throw await fail(res, "Erro ao criar o ficheiro no Drive");
      return res.json();
    },
    async update(id, text) {
      const res = await api(`${UPLOAD}/${id}?uploadType=media&fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "text/csv; charset=UTF-8" },
        body: text,
      });
      if (!res.ok) throw await fail(res, "Erro ao atualizar o ficheiro no Drive");
      return res.json();
    },
    async copy(id, name, parentId) {
      const res = await api(`${FILES}/${id}/copy?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parents: [parentId] }),
      });
      if (!res.ok) throw await fail(res, "Erro ao copiar o ficheiro no Drive");
      return res.json();
    },
    async remove(id) {
      const res = await api(`${FILES}/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw await fail(res, "Erro ao apagar no Drive");
    },
  };
}

/* ---------- estados e erros ---------- */

export function classifyError(e) {
  const code = e && e.code ? String(e.code) : "";
  const msg = (e && e.message) || String(e);
  if (code === "needs_consent" || code === "cancelled") return { state: "login" };
  if (code === "confirm_account") return { state: "confirm", account: e.account };
  if (code === "wrong_account") return { state: "wrong_account", account: e.account, expected: e.expected };
  if (code === "api_10" || /\bapi_10\b/.test(msg)) {
    return { state: "error", message: "Google Cloud: o cliente Android (pacote/SHA-1) não corresponde a esta APK." };
  }
  if (code === "api_7" || (e && e.name === "TypeError") || /failed to fetch|network|fetch failed|timeout/i.test(msg)) {
    return { state: "offline" };
  }
  return { state: "error", message: msg.slice(0, 160) };
}

/* ---------- sincronização ----------
   Regra de ouro: nunca se perde nada. Lê o Drive, JUNTA com o que está no telemóvel
   (ganha a alteração mais recente por exercício+dia), e só depois escreve.
   Antes da 1.ª alteração de cada dia guarda uma cópia em GymTrack/Backups (últimas 30). */

export function createSync({ drive, getLocal, applyRemote, setStatus, kv, today, getAccount }) {
  const todayStr = today || (() => localISO());
  let running = null;
  let again = false;
  let timer = null;
  let version = 0;
  let syncedVersion = 0;
  let lastState = "idle";
  let who = null;                        // conta ligada (pergunta-se ao Google 1 vez por sessão)

  const emit = (s) => {
    lastState = s.state;
    setStatus({ ...s, dirty: version !== syncedVersion });
  };

  async function backupOnce(fileId, folderId) {
    const day = todayStr();
    if (kv.get("gymtrack-last-backup") === day) return;
    try {
      const bf = await drive.ensureFolder(BACKUP_FOLDER_NAME, folderId);
      await drive.copy(fileId, `gymtrack-registos-${day}.csv`, bf);
      kv.set("gymtrack-last-backup", day);
      const all = (await drive.listIn(bf)).sort((a, b) => cmp(b.name, a.name));
      for (const f of all.slice(BACKUP_KEEP)) await drive.remove(f.id);
    } catch (e) {
      console.warn("Cópia diária falhou (a sincronização continua):", e);
    }
  }

  // Só avança se a conta ligada for a que o utilizador confirmou. Nada é lido nem escrito antes disto.
  async function checkAccount() {
    if (!getAccount) return "";
    if (!who) {
      who = await drive.about();
      if (!who.email) { who = null; throw new Error("Não foi possível confirmar qual é a conta Google ligada."); }
    }
    const expected = String(getAccount() || "").trim().toLowerCase();
    if (!expected) throw Object.assign(new Error("Confirma a conta Google."), { code: "confirm_account", account: who.email });
    if (who.email !== expected) {
      throw Object.assign(new Error(`Conta ligada: ${who.email}. Esta app só usa ${expected}.`), { code: "wrong_account", account: who.email, expected });
    }
    return who.email;
  }

  async function once() {
    const startVersion = version;
    emit({ state: "syncing" });
    const account = await checkAccount();
    const folderId = await drive.ensureFolder(FOLDER_NAME, "root");
    const file = await drive.findFile(CSV_NAME, folderId);
    let remote = { logs: {}, names: {}, skipped: 0 };
    let remoteNorm = null;
    if (file) {
      remote = parseCsv(await drive.download(file.id));          // lança erro se o formato for inesperado
      remoteNorm = logsToCsv(remote.logs, remote.names);
    }
    const local = getLocal();
    const logs = mergeLogsU(local.logs, remote.logs);
    const names = { ...remote.names, ...local.names };
    const csv = logsToCsv(logs, names);
    if (csv !== remoteNorm) {
      if (!file) await drive.create(CSV_NAME, folderId, csv);
      else {
        await backupOnce(file.id, folderId);
        await drive.update(file.id, csv);
      }
    }
    applyRemote({ logs, names });
    syncedVersion = startVersion;
    emit({ state: "ok", at: Date.now(), account });
  }

  function syncNow() {
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        try {
          await once();
        } catch (e) {
          emit(classifyError(e));
          again = false;
        }
      } while (again);
    })().finally(() => { running = null; });
    return running;
  }

  function schedule(ms = 1500) {
    clearTimeout(timer);
    timer = setTimeout(() => { syncNow(); }, ms);
    if (timer && typeof timer.unref === "function") timer.unref();   // só em Node (testes)
  }

  return {
    syncNow,
    schedule,
    markDirty() { version++; schedule(); },
    isDirty: () => version !== syncedVersion,
    resetAccount() { who = null; },
    retryIfNeeded() {
      if (running || lastState === "login") return undefined;
      if (lastState === "offline" || lastState === "error" || version !== syncedVersion) return syncNow();
      return undefined;
    },
  };
}
