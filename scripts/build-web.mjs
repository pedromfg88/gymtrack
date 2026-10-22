// Prepara a pasta www/ que o Capacitor empacota dentro da APK:
//   - app.js + app.css (React + a app, tudo embutido; fontes incluídas, sem CDN)
//   - index.html (casca mínima)
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });

await build({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  jsx: 'automatic',
  outdir: 'www',
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0E0F11">
<title>GymTrack</title>
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
</body>
</html>
`;
writeFileSync('www/index.html', html);
console.log('www/ pronto.');
