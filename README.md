# GymTrack — APK (conta pessoal)

Registo de treino por ciclos (peso × reps, progresso semanal). Os registos ficam **no telemóvel** e num
**CSV no teu Google Drive pessoal** (`GymTrack/gymtrack-registos.csv`, abre no Excel). Se mudares de
telemóvel ou reinstalares, a app recupera tudo do Drive.

Tudo é pessoal e separado da Luvio: projeto Google Cloud próprio, repositório GitHub próprio, chave de
assinatura própria — e a app só escreve na conta Google que confirmares.

Instruções passo a passo: **LEIA-ME-APK.md**.

## Como funciona
- A app guarda primeiro no telemóvel (funciona sem rede) e envia para o Drive 1–2 s depois.
- Ao abrir, ao voltar à app e quando a rede volta, junta o Drive com o telemóvel: por exercício + dia
  ganha a alteração mais recente. Nunca substitui às cegas e nunca apaga o que só existe de um lado.
- Antes de qualquer escrita confirma qual é a conta Google ligada; se não for a que confirmaste, não lê nem escreve nada.
- Antes da 1.ª alteração de cada dia guarda uma cópia em `GymTrack/Backups` (últimas 30).
- Se o ficheiro do Drive tiver um formato inesperado, a app **não lhe toca** e mostra o erro.

## Estrutura
| Pasta | Conteúdo |
|---|---|
| `src/GymTrack.jsx` | interface (planos, ciclos, séries, histórico, arquivo) |
| `src/store.mjs` | CSV, fusão sem perdas, cliente do Drive, sincronização (testado em Node) |
| `src/native.js` | ponte para o Android (login Google nativo, botão voltar) |
| `native/` | código Java (login Google, âmbito `drive.file`) e ícones |
| `scripts/` | build da app web, preparação do projeto Android, gerador de ícones |
| `test/` | testes automáticos (`npm test`) com um Drive simulado |
| `.github/workflows/build-apk.yml` | compila a APK assinada e publica em Releases |

## Editar o plano de treino
Os planos estão em `DEFAULT_PLANS` no início de `src/GymTrack.jsx`. Para um plano novo: marca o antigo com
`active: false` (passa a Arquivo) e acrescenta o novo com `active: true`. O histórico fica sempre ligado ao
**nome do exercício**: se o nome mudar, é um exercício novo com histórico novo.

## Comandos (só se quiseres compilar no teu computador)
`npm ci` · `npm test` · `npm run build:web` · `npm run android:prepare`
