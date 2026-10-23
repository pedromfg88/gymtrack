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

## Plano editável (sem precisares de mim)
- 3 ciclos. Em cada ciclo: **Editar** → ▲ ▼ para ordenar, **Retirar do ciclo** (pede confirmação) e o texto por baixo do nome do ciclo.
- Retirar só tira o exercício **desse ciclo**: o histórico fica guardado (está ligado ao nome do exercício).
- **+ Adicionar exercício**: escolhes um exercício **com histórico** (os retirados ou os de outros ciclos) ou crias um novo só com o nome (o ícone é sugerido pelo nome).
- O plano grava-se em `GymTrack/gymtrack-plano.csv` e sincroniza como os registos. Na 1.ª vez: «Começar em branco» ou o modelo «Programa de Adaptação».
- Mudar o nome do plano: ecrã inicial → «Mudar nome».

## Temporizador de descanso
Barra fixa no fundo do ecrã de cada ciclo: atalhos 30s · 45s · 1min · 90s · 2min · 3min (um toque inicia), −15 / +15, pausa/continuar e repor.
Na APK o alarme é do Android (`AlarmManager.setAlarmClock`): toca à hora certa com o ecrã bloqueado ou a app em segundo plano,
durante 8 s, com vibração, no volume de **alarme** do telemóvel. «Parar alarme» silencia.

## Várias pessoas (ex.: a Edite)
Cada pessoa entra com o **seu** Gmail e os dados ficam no **seu** Drive (`GymTrack/…`), com o plano que montar. Não é preciso configurar nada
na Google Cloud por pessoa. O CSV não tem coluna «pessoa» porque cada pessoa tem o seu ficheiro.

## Estrutura
| Pasta | Conteúdo |
|---|---|
| `src/GymTrack.jsx` | interface (planos, ciclos, séries, histórico, arquivo) |
| `src/store.mjs` | CSV de registos e do plano, operações do plano, fusão sem perdas, cliente do Drive, sincronização (testado em Node) |
| `src/native.js` | ponte para o Android (login Google nativo, botão voltar) |
| `native/` | Java: login Google (`drive.file`) e alarme do temporizador; ícones |
| `scripts/` | build da app web, preparação do projeto Android, gerador de ícones |
| `test/` | testes automáticos (`npm test`) com um Drive simulado |
| `.github/workflows/build-apk.yml` | compila a APK assinada e publica em Releases |

## Notas
- `DEFAULT_PLANS` (início de `src/GymTrack.jsx`) é só o **modelo** «Programa de Adaptação» oferecido na 1.ª vez; o plano real vive nos dados.
- O histórico fica sempre ligado ao **nome do exercício**: se o nome mudar, é um exercício novo com histórico novo.
- O ecrã «Arquivo» do sistema antigo de planos já não aparece (um só plano editável); o código ainda lá está, sem uso.

## Comandos (só se quiseres compilar no teu computador)
`npm ci` · `npm test` · `npm run build:web` · `npm run android:prepare`
