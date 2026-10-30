// Prepara a pasta que é publicada:
//   npm run build:web  ->  www/   (empacotada dentro da APK pelo Capacitor)
//   npm run build:pwa  ->  site/  (PWA para o iPhone, publicada no GitHub Pages)
// Em ambas: app.js + app.css (React + a app, tudo embutido; fontes incluídas, sem CDN) e index.html (casca mínima).
// A PWA leva ainda manifest, ícones e service worker (a app abre sem rede).
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const PWA = process.argv.includes('--pwa');
const OUT = PWA ? 'site' : 'www';
const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();

if (PWA) {
  if (!CLIENT_ID) throw new Error('Falta o GOOGLE_CLIENT_ID (GitHub: Settings → Secrets and variables → Actions → separador Variables).');
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(CLIENT_ID)) throw new Error('GOOGLE_CLIENT_ID inválido: tem de terminar em .apps.googleusercontent.com');
  if (!existsSync('pwa/sw.js') || !existsSync('pwa/icons')) throw new Error('Faltam os ficheiros da pasta pwa/ (sw.js e icons/).');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  jsx: 'automatic',
  outdir: OUT,
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

const pwaHead = PWA
  ? `<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="GymTrack">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<script>window.__GYMTRACK__ = ${JSON.stringify({ googleClientId: CLIENT_ID })};</script>
`
  : '';
const pwaBody = PWA
  ? `<script>if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });</script>
`
  : '';

const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0E0F11">
${pwaHead}<title>GymTrack</title>
<link rel="stylesheet" href="app.css">
<style>
  :root {
    --sat: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px));
    --sab: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px));
  }
  html, body { margin: 0; background: #0E0F11; }
  body { padding-top: var(--sat); padding-bottom: var(--sab); -webkit-tap-highlight-color: transparent; }
</style>
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
${pwaBody}</body>
</html>
`;
writeFileSync(join(OUT, 'index.html'), html);

if (PWA) {
  writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify({
    id: './',
    name: 'GymTrack',
    short_name: 'GymTrack',
    description: 'Registo de treino com os dados no teu Google Drive',
    lang: 'pt-PT',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E0F11',
    theme_color: '#0E0F11',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }, null, 2) + '\n');

  mkdirSync(join(OUT, 'icons'), { recursive: true });
  for (const f of readdirSync('pwa/icons')) copyFileSync(join('pwa/icons', f), join(OUT, 'icons', f));

  // Service worker: guarda uma cópia de tudo o que a app precisa (menos as fontes .woff, que o iPhone não usa)
  const files = walk(OUT)
    .map((f) => relative(OUT, f).split('\\').join('/'))
    .filter((f) => f !== 'sw.js' && !f.endsWith('.woff'));
  const buildId = (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) + '-' : '') + Date.now().toString(36);
  const sw = readFileSync('pwa/sw.js', 'utf8')
    .replace('__BUILD_ID__', () => buildId)
    .replace('__PRECACHE__', () => JSON.stringify(['./', ...files]));
  writeFileSync(join(OUT, 'sw.js'), sw);
}

console.log(`${OUT}/ pronto.`);
