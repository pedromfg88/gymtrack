# GymTrack — notas para o Claude

Registo de treino em React 18 (um só componente grande, `src/GymTrack.jsx`), empacotado com esbuild.
Duas distribuições do mesmo código: **APK Android** (Capacitor 8) e **PWA para iPhone** (GitHub Pages).
Dados no telemóvel e num CSV no Google Drive pessoal de cada utilizador (`GymTrack/…`).

## Regras

- **Push para `main`/`master` publica**: a APK em Releases (mantém as 2 últimas) e a PWA no GitHub Pages.
  Trabalha sempre num ramo `claude/…`; quem funde é o Pedro. Um hook em `.claude/` bloqueia estes pushes.
- **Nunca perder dados do utilizador.** A fusão Drive ↔ telemóvel (`src/store.mjs`) é por exercício + dia, ganha
  a alteração mais recente e nunca apaga o que só existe de um lado. Se o CSV do Drive tiver formato
  inesperado, a app não lhe toca. Qualquer alteração ao formato do CSV tem de manter a leitura dos ficheiros antigos.
- O histórico está ligado ao **nome do exercício**: mudar o nome cria um exercício novo.
- A pasta `android/` é gerada (`npm run android:prepare`) e não vai no repositório; alterações nativas vão para
  `native/` (Java) e `scripts/patch-android.mjs`.
- Textos da interface, comentários e mensagens de commit em **português de Portugal**.

## Estrutura

| Ficheiro | Papel |
|---|---|
| `src/GymTrack.jsx` | interface |
| `src/store.mjs` | CSV, plano, fusão, cliente do Drive, sincronização (testado em Node) |
| `src/native.js` | ponte Android (login nativo, botão voltar) |
| `src/webauth.mjs`, `src/webalarm.mjs`, `pwa/sw.js` | login, alarme e service worker da PWA |
| `test/` | `store.test.mjs` e `web.test.mjs` com um Drive simulado (`fake-drive.mjs`) |

## Verificar antes de dar por terminado

```bash
npm test            # rápido (<1 s); o hook corre-o depois de cada edição em src/ ou test/
npm run build:web   # confirma que o esbuild compila o JSX
```
