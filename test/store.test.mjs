// Testes do núcleo de dados (corre com: npm test). Usa um Google Drive simulado.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_NAME, FOLDER_NAME, BACKUP_FOLDER_NAME,
  exerciseKey, logsToCsv, parseCsv, mergeLogsU, liveLogs, setDayEntry,
  createDrive, createSync, classifyError, loadLocal, saveLocal, loadAccount, saveAccount, clearAccount,
} from "../src/store.mjs";

import { FakeDrive } from "./fake-drive.mjs";

function makeApp(drive, init = {}) {
  const kv = { m: new Map(), get(k) { return this.m.get(k); }, set(k, v) { this.m.set(k, v); } };
  const app = { state: { logs: init.logs || {}, names: init.names || {} }, statuses: [], kv, day: init.day || "2026-10-21", account: init.account === undefined ? "pedro@gmail.com" : init.account };
  let tok = init.token || "good";
  app.sync = createSync({
    drive: createDrive({
      getToken: async () => { if (init.getToken) return init.getToken(); return tok; },
      onBadToken: async () => { tok = "good"; },
      fetchFn: drive.fetch,
    }),
    getLocal: () => app.state,
    applyRemote: ({ logs, names }) => {
      app.state.logs = mergeLogsU(app.state.logs, logs);
      app.state.names = { ...names, ...app.state.names };
    },
    setStatus: (s) => app.statuses.push(s),
    kv,
    today: () => app.day,
    getAccount: () => app.account,
  });
  app.last = () => app.statuses[app.statuses.length - 1];
  return app;
}

const S = (w, r) => ({ weight: String(w), reps: String(r) });
const AIR = exerciseKey("Air Bike");
const GEM = exerciseKey("Gémeos Máquina Sentado");

/* ---------- CSV ---------- */
test("CSV: ida e volta sem perder nada (acentos, ; e aspas, vírgula decimal, dia apagado)", () => {
  const odd = 'Peck "Fly"; especial';
  const logs = {
    [GEM]: [{ date: "2026-10-20", sets: [S(40, 12), S("42.5", 10)], p: "Junho – Julho 2026", c: "Ciclo 3", u: 1760000000000 }],
    [AIR]: [{ date: "2026-10-19", sets: [S(5, 30)], u: 1759900000000 }, { date: "2026-10-21", sets: [], u: 1760100000000 }],
    [exerciseKey(odd)]: [{ date: "2026-10-19", sets: [S(30, 8)], u: 5 }],
  };
  const names = { [GEM]: "Gémeos Máquina Sentado", [AIR]: "Air Bike", [exerciseKey(odd)]: odd };
  const csv = logsToCsv(logs, names);
  assert.ok(csv.startsWith("\uFEFFdata;plano;ciclo;exercicio;serie;peso_kg;reps;atualizado\r\n"));
  assert.ok(csv.includes("42,5"), "peso com vírgula decimal");
  assert.ok(csv.includes('"Peck ""Fly""; especial"'), "aspas e ; escapados");
  const back = parseCsv(csv);
  assert.deepEqual(back.logs, logs);
  assert.deepEqual(back.names, names);
  assert.equal(back.skipped, 0);
});

test("CSV: saída determinística (mesma ordem, independentemente de como os dados foram construídos)", () => {
  const a = { [AIR]: [{ date: "2026-10-02", sets: [S(1, 1)], u: 1 }, { date: "2026-10-01", sets: [S(2, 2)], u: 1 }], [GEM]: [{ date: "2026-10-01", sets: [S(3, 3)], u: 1 }] };
  const b = { [GEM]: [{ date: "2026-10-01", sets: [S(3, 3)], u: 1 }], [AIR]: [{ date: "2026-10-01", sets: [S(2, 2)], u: 1 }, { date: "2026-10-02", sets: [S(1, 1)], u: 1 }] };
  const names = { [AIR]: "Air Bike", [GEM]: "Gémeos Máquina Sentado" };
  assert.equal(logsToCsv(a, names), logsToCsv(b, names));
});

test("CSV: aceita o que o Excel/Folhas do Google podem devolver (vírgulas, D/M/AAAA, sem plano)", () => {
  const txt = 'Data,Exercício,Série,Peso,Reps\n21/10/2026,Air Bike,1,"22,5",10\n21/10/2026,Air Bike,2,25,8\n\n';
  const r = parseCsv(txt);
  assert.deepEqual(r.logs, { [AIR]: [{ date: "2026-10-21", sets: [S("22.5", 10), S(25, 8)] }] });
});

test("CSV: ficheiro com formato inesperado dá erro (nunca é tratado como 'vazio')", () => {
  assert.throws(() => parseCsv("foo,bar\n1,2"), /formato esperado/);
  assert.deepEqual(parseCsv("").logs, {});
  assert.deepEqual(parseCsv("\uFEFFdata;plano;ciclo;exercicio;serie;peso_kg;reps;atualizado\r\n").logs, {});
});

test("CSV: linhas com data inválida são contadas (não rebentam)", () => {
  const r = parseCsv("data;exercicio;serie;peso_kg;reps\nontem;Air Bike;1;5;5\n2026-10-01;Air Bike;1;5;5\n");
  assert.equal(r.skipped, 1);
  assert.equal(r.logs[AIR].length, 1);
});

/* ---------- registos em memória ---------- */
test("mergeLogsU: ganha o mais recente; empate ganha o Drive; junta o que só existe de um lado", () => {
  const A = { x: [{ date: "d1", sets: [S(1, 1)], u: 10 }, { date: "d2", sets: [S(2, 2)], u: 10 }, { date: "d4", sets: [S(4, 4)], u: 10 }] };
  const B = { x: [{ date: "d1", sets: [S(9, 9)], u: 20 }, { date: "d2", sets: [], u: 5 }, { date: "d4", sets: [S(8, 8)], u: 10 }], y: [{ date: "d3", sets: [S(3, 3)], u: 1 }] };
  const M = mergeLogsU(A, B);
  assert.equal(M.x.find((e) => e.date === "d1").sets[0].weight, "9");   // mais recente
  assert.equal(M.x.find((e) => e.date === "d2").sets[0].weight, "2");   // apagado mais antigo não ganha
  assert.equal(M.x.find((e) => e.date === "d4").sets[0].weight, "8");   // empate: Drive
  assert.equal(M.y.length, 1);
  const C = mergeLogsU(A, { x: [{ date: "d2", sets: [], u: 30 }] });
  assert.equal(C.x.find((e) => e.date === "d2").sets.length, 0);        // apagado mais recente ganha
});

test("liveLogs esconde dias apagados; setDayEntry guarda, atualiza e apaga", () => {
  let logs = setDayEntry({}, AIR, "2026-10-21", [S(5, 5)], { p: "Plano", c: "Ciclo 1" }, 1000);
  assert.deepEqual(logs[AIR][0], { date: "2026-10-21", sets: [S(5, 5)], u: 1000, p: "Plano", c: "Ciclo 1" });
  logs = setDayEntry(logs, AIR, "2026-10-21", [S(6, 6)], {}, 1000);      // mesmo ms: u tem de subir
  assert.ok(logs[AIR][0].u > 1000);
  assert.equal(logs[AIR].length, 1);
  logs = setDayEntry(logs, AIR, "2026-10-21", [], {}, 5000);
  assert.deepEqual(liveLogs(logs), {});
  assert.equal(logs[AIR][0].sets.length, 0);                             // continua lá como "apagado"
});

test("armazenamento local: guarda e lê; lixo no armazenamento não rebenta", () => {
  const st = { m: new Map(), getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { this.m.set(k, v); } };
  assert.deepEqual(loadLocal(st), { logs: {}, names: {} });
  assert.equal(saveLocal({ logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 1 }] }, names: { [AIR]: "Air Bike" } }, st), true);
  assert.equal(loadLocal(st).names[AIR], "Air Bike");
  st.m.set("gymtrack-data", "{isto não é json");
  assert.deepEqual(loadLocal(st), { logs: {}, names: {} });
});

/* ---------- sincronização ---------- */
test("1.ª sincronização cria a pasta GymTrack e o ficheiro com os registos do telemóvel", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { logs: { [AIR]: [{ date: "2026-10-20", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(d.live(FOLDER_NAME).length, 1);
  const f = d.live(CSV_NAME);
  assert.equal(f.length, 1);
  assert.deepEqual(parseCsv(f[0].content).logs, app.state.logs);
  assert.equal(app.last().state, "ok");
  assert.equal(app.last().dirty, false);
});

test("telemóvel novo/reinstalado (vazio) recebe tudo do Drive e não altera o ficheiro", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { logs: { [AIR]: [{ date: "2026-10-20", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await a.sync.syncNow();
  const b = makeApp(d);
  await b.sync.syncNow();
  assert.deepEqual(b.state.logs, a.state.logs);
  assert.equal(b.state.names[AIR], "Air Bike");
  assert.equal(d.updates, 0);
});

test("alterações em dois aparelhos juntam-se sem perder nenhuma", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { names: { [AIR]: "Air Bike", [GEM]: "Gémeos Máquina Sentado" } });
  const b = makeApp(d, { names: { [AIR]: "Air Bike", [GEM]: "Gémeos Máquina Sentado" } });
  await a.sync.syncNow();
  await b.sync.syncNow();
  a.state.logs = setDayEntry(a.state.logs, AIR, "2026-10-20", [S(5, 5)], {}, 100);
  b.state.logs = setDayEntry(b.state.logs, GEM, "2026-10-21", [S(40, 12)], {}, 200);
  await a.sync.syncNow();
  await b.sync.syncNow();
  await a.sync.syncNow();
  for (const x of [a, b]) {
    assert.equal(liveLogs(x.state.logs)[AIR][0].sets[0].weight, "5");
    assert.equal(liveLogs(x.state.logs)[GEM][0].sets[0].weight, "40");
  }
  const remote = parseCsv(d.live(CSV_NAME)[0].content);
  assert.equal(Object.keys(liveLogs(remote.logs)).length, 2);
});

test("apagar um dia chega ao Drive e não 'ressuscita' no outro aparelho", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { names: { [AIR]: "Air Bike" } });
  const b = makeApp(d, { names: { [AIR]: "Air Bike" } });
  a.state.logs = setDayEntry({}, AIR, "2026-10-21", [S(5, 5)], {}, 100);
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal(liveLogs(b.state.logs)[AIR].length, 1);
  a.state.logs = setDayEntry(a.state.logs, AIR, "2026-10-21", [], {}, 300);
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.deepEqual(liveLogs(b.state.logs), {});
  await a.sync.syncNow();
  assert.deepEqual(liveLogs(a.state.logs), {});
});

test("cópia diária: 1 por dia, em GymTrack/Backups, e só ficam as últimas 30", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { names: { [AIR]: "Air Bike" } });
  a.state.logs = setDayEntry({}, AIR, "2026-10-21", [S(5, 5)], {}, 100);
  await a.sync.syncNow();                                               // cria (ainda não há o que guardar)
  a.state.logs = setDayEntry(a.state.logs, AIR, "2026-10-21", [S(6, 6)], {}, 200);
  await a.sync.syncNow();                                               // 1.ª alteração do dia -> cópia
  const folder = d.live(BACKUP_FOLDER_NAME)[0];
  assert.ok(folder, "pasta Backups criada");
  assert.deepEqual(d.inFolder(folder.id).map((f) => f.name), ["gymtrack-registos-2026-10-21.csv"]);
  a.state.logs = setDayEntry(a.state.logs, AIR, "2026-10-21", [S(7, 7)], {}, 300);
  await a.sync.syncNow();                                               // mesmo dia -> sem 2.ª cópia
  assert.equal(d.inFolder(folder.id).length, 1);
  for (let i = 1; i <= 34; i++) d.add({ name: `gymtrack-registos-2026-09-${String(i).padStart(2, "0")}.csv`, parents: [folder.id] });
  a.day = "2026-10-22";
  a.state.logs = setDayEntry(a.state.logs, AIR, "2026-10-22", [S(8, 8)], {}, 400);
  await a.sync.syncNow();
  const names = d.inFolder(folder.id).map((f) => f.name).sort();
  assert.equal(names.length, 30);
  assert.ok(names.includes("gymtrack-registos-2026-10-22.csv") && names.includes("gymtrack-registos-2026-10-21.csv"));
});

test("ficheiro do Drive com formato estranho NÃO é sobrescrito (erro visível)", async () => {
  const d = new FakeDrive();
  const folder = d.add({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  const file = d.add({ name: CSV_NAME, parents: [folder], content: "isto não é um ficheiro de registos\n1,2,3" });
  const app = makeApp(d, { logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "error");
  assert.match(app.last().message, /formato esperado/);
  assert.equal(d.files.get(file).content, "isto não é um ficheiro de registos\n1,2,3");
  assert.equal(d.updates, 0);
});

test("token rejeitado (401): limpa, pede outro e repete sem incomodar", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { token: "stale", logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "ok");
  assert.equal(d.live(CSV_NAME).length, 1);
});

test("sem rede: fica 'offline' com alterações por enviar; quando volta, envia e fica em dia", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  app.state.logs = setDayEntry(app.state.logs, AIR, "2026-10-21", [S(5, 5)], {}, 100);
  app.sync.markDirty();
  d.fail = "network";
  await app.sync.syncNow();
  assert.equal(app.last().state, "offline");
  assert.equal(app.last().dirty, true);
  assert.equal(parseCsv(d.live(CSV_NAME)[0].content).logs[AIR], undefined);
  await app.sync.retryIfNeeded();
  assert.equal(app.last().state, "ok");
  assert.equal(app.last().dirty, false);
  assert.equal(parseCsv(d.live(CSV_NAME)[0].content).logs[AIR].length, 1);
});

test("login necessário (sem autorização): estado 'login', sem rebentar", async () => {
  const d = new FakeDrive();
  const err = Object.assign(new Error("É necessário autorizar o acesso ao Google Drive."), { code: "needs_consent" });
  const app = makeApp(d, { getToken: async () => { throw err; } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "login");
  assert.equal(d.log.length, 0);
});

test("pedidos de sincronização em simultâneo juntam-se (no máximo 1 repetição)", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { names: { [AIR]: "Air Bike" } });
  await Promise.all([app.sync.syncNow(), app.sync.syncNow(), app.sync.syncNow()]);
  assert.ok(d.log.filter((l) => l.includes("alt=media")).length <= 1);   // 1.º run cria; 2.º lê
  assert.equal(d.live(CSV_NAME).length, 1);
});

test("alteração feita DURANTE a sincronização não se perde e fica por enviar", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { names: { [AIR]: "Air Bike" }, logs: { [AIR]: [{ date: "2026-10-20", sets: [S(5, 5)], u: 10 }] } });
  await app.sync.syncNow();
  app.state.logs = setDayEntry(app.state.logs, AIR, "2026-10-20", [S(6, 6)], {}, 100);
  app.sync.markDirty();
  d.onWrite = () => {                                                    // o utilizador escreve a meio do envio
    d.onWrite = null;
    app.state.logs = setDayEntry(app.state.logs, AIR, "2026-10-22", [S(9, 9)], {}, 99999999999999);
    app.sync.markDirty();
  };
  await app.sync.syncNow();
  assert.equal(liveLogs(app.state.logs)[AIR].length, 2, "a escrita a meio mantém-se no telemóvel");
  assert.equal(app.last().dirty, true);
  await app.sync.syncNow();
  assert.equal(app.last().dirty, false);
  assert.equal(parseCsv(d.live(CSV_NAME)[0].content).logs[AIR].length, 2);
});

test("classifyError: rede, login, configuração Google e resto", () => {
  assert.equal(classifyError(new TypeError("Failed to fetch")).state, "offline");
  assert.equal(classifyError(Object.assign(new Error("x"), { code: "needs_consent" })).state, "login");
  assert.equal(classifyError(Object.assign(new Error("x"), { code: "api_10" })).state, "error");
  assert.match(classifyError(Object.assign(new Error("x"), { code: "api_10" })).message, /SHA-1/);
  assert.equal(classifyError(Object.assign(new Error("x"), { code: "api_7" })).state, "offline");
  assert.equal(classifyError(new Error("Erro ao procurar no Drive (403)")).state, "error");
});

/* ---------- conta Google (os registos só vão para a conta pessoal confirmada) ---------- */
test("conta: sem conta confirmada pede confirmação e NÃO lê nem escreve nada no Drive", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { account: "", logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "confirm");
  assert.equal(app.last().account, "pedro@gmail.com");
  assert.equal(d.files.size, 0);
  assert.ok(d.log.every((l) => l.includes("/about")), "só perguntou quem é a conta");
});

test("conta: conta ligada diferente da confirmada -> 'conta errada' e nada é lido nem escrito", async () => {
  const d = new FakeDrive();
  d.email = "pedro@outra-empresa.pt";
  const app = makeApp(d, { account: "pedro@gmail.com", logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 10 }] }, names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "wrong_account");
  assert.equal(app.last().account, "pedro@outra-empresa.pt");
  assert.equal(app.last().expected, "pedro@gmail.com");
  assert.equal(d.files.size, 0);
});

test("conta: sem distinguir maiúsculas; o estado 'ok' diz a conta; pergunta ao Google 1 vez por sessão", async () => {
  const d = new FakeDrive();
  d.email = "Pedro@Gmail.com";
  const app = makeApp(d, { account: "PEDRO@gmail.com", names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  await app.sync.syncNow();
  assert.equal(app.last().state, "ok");
  assert.equal(app.last().account, "pedro@gmail.com");
  assert.equal(d.log.filter((l) => l.includes("/drive/v3/about")).length, 1);
  app.sync.resetAccount();                                               // "mudar de conta"
  await app.sync.syncNow();
  assert.equal(d.log.filter((l) => l.includes("/drive/v3/about")).length, 2);
});

test("conta: se o Google não deixar identificar a conta, falha em segurança (sem escrever)", async () => {
  const d = new FakeDrive();
  d.aboutFail = 403;
  const app = makeApp(d, { names: { [AIR]: "Air Bike" } });
  await app.sync.syncNow();
  assert.equal(app.last().state, "error");
  assert.equal(d.files.size, 0);
});

test("conta confirmada: guardar, ler (em minúsculas) e limpar", () => {
  const st = { m: new Map(), getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { this.m.set(k, v); }, removeItem(k) { this.m.delete(k); } };
  assert.equal(loadAccount(st), "");
  saveAccount("  Pedro@Gmail.com ", st);
  assert.equal(loadAccount(st), "pedro@gmail.com");
  clearAccount(st);
  assert.equal(loadAccount(st), "");
});
