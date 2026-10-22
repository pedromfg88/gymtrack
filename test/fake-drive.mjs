// Google Drive simulado (usado pelos testes). Só implementa o que a app usa.
/* ---------- Drive simulado ---------- */
export const res = (status, json, text) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  text: async () => (text !== undefined ? text : JSON.stringify(json)),
});

export class FakeDrive {
  constructor() {
    this.files = new Map();
    this.seq = 0;
    this.validTokens = new Set(["good"]);
    this.fail = null;
    this.updates = 0;
    this.log = [];
    this.onWrite = null;
    this.email = "pedro@gmail.com";
    this.aboutFail = null;
  }
  add(f) {
    const id = "id" + ++this.seq;
    this.files.set(id, { id, trashed: false, createdTime: new Date(1.7e12 + this.seq * 1000).toISOString(), parents: [], mimeType: "text/plain", content: "", ...f });
    return id;
  }
  live(name) { return [...this.files.values()].filter((f) => f.name === name && !f.trashed); }
  inFolder(folderId) { return [...this.files.values()].filter((f) => !f.trashed && f.parents.includes(folderId)); }
  fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    const auth = ((opts.headers && opts.headers.Authorization) || "").replace("Bearer ", "");
    this.log.push(method + " " + url.replace("https://www.googleapis.com", "").slice(0, 90));
    if (this.fail === "network") { this.fail = null; throw new TypeError("fetch failed"); }
    if (!this.validTokens.has(auth)) return res(401, {});
    const u = new URL(url);
    const p = u.pathname;
    let m;
    if (method === "GET" && p === "/drive/v3/about") {
      if (this.aboutFail) return res(this.aboutFail, { error: "sem permissão" });
      return res(200, { user: { emailAddress: this.email, displayName: "Pedro" } });
    }
    if (method === "GET" && p === "/drive/v3/files") {
      const q = u.searchParams.get("q") || "";
      let items = [...this.files.values()].filter((f) => !f.trashed);
      const nm = q.match(/name='((?:[^'\\]|\\.)*)'/);
      if (nm) { const n = nm[1].replace(/\\(.)/g, "$1"); items = items.filter((f) => f.name === n); }
      const mt = q.match(/mimeType='([^']+)'/);
      if (mt) items = items.filter((f) => f.mimeType === mt[1]);
      const pa = q.match(/'([^']+)' in parents/);
      if (pa) items = items.filter((f) => f.parents.includes(pa[1]));
      if (u.searchParams.get("orderBy") === "createdTime") items.sort((a, b) => (a.createdTime < b.createdTime ? -1 : 1));
      return res(200, { files: items.map(({ id, name, createdTime }) => ({ id, name, createdTime })) });
    }
    if (method === "GET" && (m = p.match(/^\/drive\/v3\/files\/([^/]+)$/)) && u.searchParams.get("alt") === "media") {
      const f = this.files.get(m[1]);
      return f ? res(200, null, f.content) : res(404, {});
    }
    if (method === "POST" && p === "/drive/v3/files") {
      const b = JSON.parse(opts.body);
      return res(200, { id: this.add({ name: b.name, mimeType: b.mimeType, parents: b.parents || ["root"] }) });
    }
    if (method === "POST" && p === "/upload/drive/v3/files") {
      const meta = JSON.parse(await opts.body.get("metadata").text());
      const content = await opts.body.get("file").text();
      if (this.onWrite) this.onWrite();
      return res(200, { id: this.add({ name: meta.name, parents: meta.parents, mimeType: meta.mimeType, content }), name: meta.name });
    }
    if (method === "PATCH" && (m = p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/))) {
      const f = this.files.get(m[1]);
      if (!f) return res(404, {});
      f.content = String(opts.body);
      this.updates++;
      if (this.onWrite) this.onWrite();
      return res(200, { id: f.id });
    }
    if (method === "POST" && (m = p.match(/^\/drive\/v3\/files\/([^/]+)\/copy$/))) {
      const f = this.files.get(m[1]);
      const b = JSON.parse(opts.body);
      return res(200, { id: this.add({ name: b.name, parents: b.parents, content: f.content, mimeType: f.mimeType }) });
    }
    if (method === "DELETE" && (m = p.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
      const f = this.files.get(m[1]);
      if (f) f.trashed = true;
      return res(204, null, "");
    }
    return res(400, {}, "rota desconhecida: " + method + " " + p);
  };
}

