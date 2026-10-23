// Testes do núcleo de dados (corre com: npm test). Usa um Google Drive simulado.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_NAME, FOLDER_NAME, BACKUP_FOLDER_NAME,
  exerciseKey, logsToCsv, parseCsv, mergeLogsU, liveLogs, setDayEntry,
  createDrive, createSync, classifyError, loadLocal, saveLocal, loadAccount, saveAccount, clearAccount,
  PLAN_NAME, guessType, emptyPlan, planFromTemplate, addExerciseToCycle, removeExerciseFromCycle, moveExercise,
  setCycleFocus, setPlanLabel, planNames, historyExercises, mergePlan, planToCsv, parsePlanCsv,
} from "../src/store.mjs";

import { FakeDrive } from "./fake-drive.mjs";

function makeApp(drive, init = {}) {
  const kv = { m: new Map(), get(k) { return this.m.get(k); }, set(k, v) { this.m.set(k, v); } };
  const app = { state: { logs: init.logs || {}, names: init.names || {}, plan: init.plan || null }, statuses: [], kv, day: init.day || "2026-10-21", account: init.account === undefined ? "pedro@gmail.com" : init.account };
  let tok = init.token || "good";
  app.sync = createSync({
    drive: createDrive({
      getToken: async () => { if (init.getToken) return init.getToken(); return tok; },
      onBadToken: async () => { tok = "good"; },
      fetchFn: drive.fetch,
    }),
    getLocal: () => app.state,
    applyRemote: ({ logs, names, plan }) => {
      app.state.logs = mergeLogsU(app.state.logs, logs);
      app.state.names = { ...names, ...app.state.names };
      app.state.plan = mergePlan(app.state.plan, plan);
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
  assert.deepEqual(loadLocal(st), { logs: {}, names: {}, plan: null });
  assert.equal(saveLocal({ logs: { [AIR]: [{ date: "2026-10-21", sets: [S(5, 5)], u: 1 }] }, names: { [AIR]: "Air Bike" } }, st), true);
  assert.equal(loadLocal(st).names[AIR], "Air Bike");
  st.m.set("gymtrack-data", "{isto não é json");
  assert.deepEqual(loadLocal(st), { logs: {}, names: {}, plan: null });
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

/* ---------- plano de treino editável ---------- */
const TPL = {
  label: "Programa de Adaptação",
  workouts: {
    1: { name: "Ciclo 1", focus: "Pernas", color: "#C8FF3D", exercises: [{ name: "Air Bike", type: "cardio" }, { name: "Hack Squat", type: "legs_push" }] },
    2: { name: "Ciclo 2", focus: "Costas", color: "#3DD9FF", exercises: [{ name: "Air Bike", type: "cardio" }, { name: "Remada Baixa", type: "pull" }] },
    3: { name: "Ciclo 3", focus: "", color: "#FF8A3D", exercises: [] },
  },
};

test("ícone sugerido pelo nome (só estético; sem correspondência fica 'core')", () => {
  const casos = {
    "Passadeira": "cardio", "Chest press máquina": "press_chest", "Peck Fly": "fly", "Biceps 21": "curl", "Leg Curl": "legs_curl",
    "Leg Extension": "legs_extend", "Triceps Unilateral na polia": "press_shoulder", "Seated Row máquina": "pull",
    "Gémeos Máquina Sentado": "calf", "Agachamento com KB": "legs_push", "Puxada Frontal": "pull_down", "Elevações laterais": "raise",
    "Biceps Barra na Polia": "curl", "Máquina Glúteos pés no step": "hinge", "Coisa Estranha": "core",
  };
  for (const [nome, tipo] of Object.entries(casos)) assert.equal(guessType(nome), tipo, nome);
});

test("plano: em branco tem 3 ciclos vazios; modelo copia os ciclos e exercícios", () => {
  const p = emptyPlan("O meu plano", 100);
  assert.deepEqual(Object.keys(p.cycles), ["1", "2", "3"]);
  assert.ok(Object.values(p.cycles).every((c) => c.exercises.length === 0));
  const t = planFromTemplate(TPL, "Programa de Adaptação", 100);
  assert.equal(t.cycles[1].exercises.length, 2);
  assert.equal(t.cycles[3].exercises.length, 0);
  t.cycles[1].exercises.push({ name: "X", type: "core" });
  assert.equal(TPL.workouts[1].exercises.length, 2, "o modelo não pode ser alterado");
});

test("plano: adicionar (nome limpo, ícone sugerido, sem duplicados no ciclo, mas pode estar noutro ciclo)", () => {
  let p = emptyPlan("P", 100);
  let r = addExerciseToCycle(p, "1", { name: "  Leg   Curl  " }, 200);
  assert.deepEqual(r.plan.cycles[1].exercises, [{ name: "Leg Curl", type: "legs_curl" }]);
  assert.ok(r.plan.u > p.u);
  p = r.plan;
  assert.match(addExerciseToCycle(p, "1", { name: "leg curl" }, 300).error, /já está/i);
  assert.match(addExerciseToCycle(p, "1", { name: "   " }, 300).error, /nome/i);
  r = addExerciseToCycle(p, "2", { name: "Leg Curl" }, 300);
  assert.equal(r.plan.cycles[2].exercises.length, 1);
  assert.equal(r.plan.cycles[1].exercises.length, 1);
});

test("plano: retirar mantém a biblioteca (ícone) só se houver histórico e só se já não estiver noutro ciclo", () => {
  let p = planFromTemplate(TPL, "P", 100);
  const comHist = removeExerciseFromCycle(p, "1", exerciseKey("Hack Squat"), true, 200);
  assert.deepEqual(comHist.cycles[1].exercises.map((e) => e.name), ["Air Bike"]);
  assert.deepEqual(comHist.library, [{ name: "Hack Squat", type: "legs_push" }]);
  const semHist = removeExerciseFromCycle(p, "2", exerciseKey("Remada Baixa"), false, 200);
  assert.deepEqual(semHist.library, []);
  const noutroCiclo = removeExerciseFromCycle(p, "1", exerciseKey("Air Bike"), true, 200);   // continua no ciclo 2
  assert.deepEqual(noutroCiclo.library, []);
  const volta = addExerciseToCycle(comHist, "3", { name: "Hack Squat" }, 300);                // volta com o mesmo ícone
  assert.equal(volta.plan.cycles[3].exercises[0].type, "legs_push");
  assert.deepEqual(volta.plan.library, []);
  assert.equal(removeExerciseFromCycle(p, "1", "nao_existe", true, 200), p);
});

test("plano: mudar a ordem, o texto do ciclo e o nome do plano", () => {
  let p = planFromTemplate(TPL, "P", 100);
  p = moveExercise(p, "1", exerciseKey("Hack Squat"), -1, 200);
  assert.deepEqual(p.cycles[1].exercises.map((e) => e.name), ["Hack Squat", "Air Bike"]);
  assert.equal(moveExercise(p, "1", exerciseKey("Hack Squat"), -1, 300), p, "no limite não faz nada");
  p = setCycleFocus(p, "3", "  Braços e   ombros ", 300);
  assert.equal(p.cycles[3].focus, "Braços e ombros");
  p = setPlanLabel(p, "Novo plano", 400);
  assert.equal(p.label, "Novo plano");
  assert.equal(setPlanLabel(p, "   ", 500), p);
});

test("CSV do plano: ida e volta (ciclo vazio, biblioteca, acentos, ; e aspas, ordem)", () => {
  let p = planFromTemplate(TPL, 'Plano "A"; Out', 1760000000000);
  p = addExerciseToCycle(p, "1", { name: 'Rosca "21"; Direta' }, 1760000001000).plan;
  p = removeExerciseFromCycle(p, "1", exerciseKey("Hack Squat"), true, 1760000002000);
  const csv = planToCsv(p);
  assert.ok(csv.startsWith("\uFEFFplano;ciclo;nome_ciclo;foco;cor;ordem;exercicio;tipo;atualizado\r\n"));
  const back = parsePlanCsv(csv);
  assert.deepEqual(back, p);
  assert.equal(back.cycles[3].exercises.length, 0, "ciclo vazio continua a existir");
});

test("CSV do plano: formato estranho dá erro; vazio ou só cabeçalho dá 'sem plano'", () => {
  assert.throws(() => parsePlanCsv("foo;bar\n1;2"), /formato esperado/);
  assert.equal(parsePlanCsv(""), null);
  assert.equal(parsePlanCsv("\uFEFFplano;ciclo;nome_ciclo;foco;cor;ordem;exercicio;tipo;atualizado\r\n"), null);
});

test("plano: o mais recente ganha; empate ganha o Drive; um lado vazio devolve o outro", () => {
  const a = { ...emptyPlan("A", 10) };
  const b = { ...emptyPlan("B", 20) };
  assert.equal(mergePlan(a, b).label, "B");
  assert.equal(mergePlan(b, a).label, "B");
  assert.equal(mergePlan({ ...a, u: 20 }, b).label, "B");
  assert.equal(mergePlan(null, b), b);
  assert.equal(mergePlan(a, null), a);
  assert.equal(mergePlan(null, null), null);
});

test("lista para acrescentar: só exercícios com histórico, fora do ciclo, mais recentes primeiro", () => {
  const hack = exerciseKey("Hack Squat"), remada = exerciseKey("Remada Baixa"), antigo = exerciseKey("Prensa Horizontal"), fantasma = exerciseKey("Fantasma");
  let p = planFromTemplate(TPL, "P", 100);
  p = removeExerciseFromCycle(p, "1", hack, true, 200);                    // retirado do ciclo 1 (tem histórico)
  const logs = {
    [hack]: [{ date: "2026-10-10", sets: [S(100, 8)], u: 1 }],
    [remada]: [{ date: "2026-10-12", sets: [S(40, 10)], u: 1 }, { date: "2026-10-05", sets: [S(35, 10)], u: 1 }],
    [antigo]: [{ date: "2026-09-01", sets: [S(80, 12)], u: 1 }],
    [fantasma]: [{ date: "2026-10-20", sets: [], u: 1 }],                  // dia apagado: não conta
    [AIR]: [{ date: "2026-10-15", sets: [S(5, 5)], u: 1 }],
  };
  const names = { [hack]: "Hack Squat", [remada]: "Remada Baixa", [antigo]: "Prensa Horizontal", [AIR]: "Air Bike" };
  const lista = historyExercises({ logs, names, plan: p }, "1");
  assert.deepEqual(lista.map((x) => x.name), ["Remada Baixa", "Hack Squat", "Prensa Horizontal"]);   // Air Bike já está no ciclo 1
  assert.deepEqual(lista[0].inCycles, ["2"]);
  assert.deepEqual(lista[1].inCycles, []);
  assert.equal(lista[1].type, "legs_push");
  assert.equal(lista[0].sessions, 2);
  assert.equal(lista[2].type, "legs_push", "sem plano: ícone sugerido pelo nome");
  assert.equal(planNames(p)[hack], "Hack Squat");
});

/* ---------- plano no Drive ---------- */
const planoComAirBike = () => addExerciseToCycle(emptyPlan("Plano da Edite", 100), "1", { name: "Air Bike" }, 200).plan;

test("sync: o plano vai para gymtrack-plano.csv e um aparelho novo recebe-o", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { plan: planoComAirBike() });
  await a.sync.syncNow();
  const f = d.live(PLAN_NAME);
  assert.equal(f.length, 1);
  assert.deepEqual(parsePlanCsv(f[0].content), a.state.plan);
  const b = makeApp(d);
  await b.sync.syncNow();
  assert.deepEqual(b.state.plan, a.state.plan);
  assert.equal(d.updates, 0);
});

test("sync: sem plano local nem no Drive não cria ficheiro do plano", async () => {
  const d = new FakeDrive();
  const a = makeApp(d);
  await a.sync.syncNow();
  assert.equal(d.live(PLAN_NAME).length, 0);
  assert.equal(a.state.plan, null);
});

test("sync: alterações ao plano propagam-se e o plano mais antigo nunca apaga o mais recente", async () => {
  const d = new FakeDrive();
  const a = makeApp(d, { plan: planoComAirBike() });
  const b = makeApp(d);
  await a.sync.syncNow();
  await b.sync.syncNow();
  b.state.plan = addExerciseToCycle(b.state.plan, "2", { name: "Leg Curl" }, 5000).plan;
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.equal(a.state.plan.cycles[2].exercises[0].name, "Leg Curl");
  const velho = emptyPlan("Antigo", 50);                                   // aparelho com plano velho
  const c = makeApp(d, { plan: velho });
  await c.sync.syncNow();
  assert.equal(c.state.plan.cycles[2].exercises[0].name, "Leg Curl", "ganha o do Drive");
  assert.equal(parsePlanCsv(d.live(PLAN_NAME)[0].content).cycles[2].exercises.length, 1);
});

test("sync: ficheiro do plano com formato estranho NÃO é sobrescrito", async () => {
  const d = new FakeDrive();
  const folder = d.add({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  const f = d.add({ name: PLAN_NAME, parents: [folder], content: "isto não é um plano\n1,2,3" });
  const app = makeApp(d, { plan: planoComAirBike() });
  await app.sync.syncNow();
  assert.equal(app.last().state, "error");
  assert.equal(d.files.get(f).content, "isto não é um plano\n1,2,3");
  assert.equal(d.updates, 0);
});

test("sync: cópia diária do plano (1 por dia) ao lado da dos registos", async () => {
  const d = new FakeDrive();
  const app = makeApp(d, { plan: planoComAirBike(), names: { [AIR]: "Air Bike" } });
  app.state.logs = setDayEntry({}, AIR, "2026-10-21", [S(5, 5)], {}, 100);
  await app.sync.syncNow();                                                // cria os dois ficheiros
  app.state.plan = addExerciseToCycle(app.state.plan, "1", { name: "Leg Curl" }, 9000).plan;
  app.state.logs = setDayEntry(app.state.logs, AIR, "2026-10-21", [S(6, 6)], {}, 200);
  await app.sync.syncNow();
  const bf = d.live("Backups")[0];
  assert.deepEqual(d.inFolder(bf.id).map((x) => x.name).sort(), ["gymtrack-plano-2026-10-21.csv", "gymtrack-registos-2026-10-21.csv"]);
  app.state.plan = addExerciseToCycle(app.state.plan, "1", { name: "Remada" }, 9500).plan;
  await app.sync.syncNow();
  assert.equal(d.inFolder(bf.id).length, 2, "no mesmo dia não há 2.ª cópia");
});
