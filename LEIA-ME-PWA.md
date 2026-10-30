# GymTrack — PWA para iPhone (dados no Google Drive)

A PWA é a mesma app da APK, publicada como página no GitHub Pages e instalada no iPhone pelo Safari.
Grava tudo no Google Drive da pessoa (`GymTrack/gymtrack-registos.csv`, `gymtrack-plano.csv` e `Backups/`), com a mesma
lógica da APK. A APK não muda. Só mudam o login Google (agora por redirecionamento) e o aviso do temporizador.

> **Pessoal, não Luvio.** Usa o projeto Google Cloud e o repositório GitHub pessoais do GymTrack.

**Endereço da app** (anota-o, vais precisar dele duas vezes):
`https://O-TEU-UTILIZADOR.github.io/NOME-DO-REPOSITORIO/` — com a barra `/` no fim.

---

## 1. GitHub (repositório do GymTrack)

1. **Repositório público.** *Settings → General → Danger Zone → Change visibility → Make public.*
   O GitHub Pages grátis só funciona em repositórios públicos. Antes, confirma que no repositório **não** está o
   `SEGREDOS-GITHUB.txt` nem o ficheiro da chave (`.keystore`). Os segredos do Actions não ficam visíveis.
2. **Ligar o Pages.** *Settings → Pages → Build and deployment → Source: **GitHub Actions**.*

## 2. Google Cloud (projeto pessoal «GymTrack», o mesmo da APK)

1. https://console.cloud.google.com com a **conta pessoal** → seleciona o projeto `GymTrack`.
2. *Google Auth Platform → Clientes → Criar cliente* (https://console.cloud.google.com/auth/clients/create).
   - Tipo de aplicação: **Aplicação Web**
   - Nome: `GymTrack PWA`
   - Origens JavaScript autorizadas: `https://O-TEU-UTILIZADOR.github.io`
   - URIs de redirecionamento autorizados: o endereço da app, **igual e com a `/` final** (`https://O-TEU-UTILIZADOR.github.io/NOME-DO-REPOSITORIO/`)
3. **Criar** e copia o **ID do cliente** (termina em `.apps.googleusercontent.com`). O segredo não é preciso.
4. *Google Auth Platform → Público (Audience)*: confirma que a app está **Em produção** e que o âmbito é `drive.file`
   (já ficou assim ao fazer a APK). As alterações do cliente podem demorar alguns minutos a ficar ativas.

## 3. Ficheiros e publicação

1. Descompacta `gymtrack-pwa.zip` e arrasta o **conteúdo** para o repositório (*Add file → Upload files*), **mantendo as pastas**.
   Confirma que existe `.github/workflows/deploy-pwa.yml` (as pastas que começam por ponto às vezes ficam ocultas ao arrastar).

   | Ficheiro | O que é |
   |---|---|
   | `src/native.js` | **substitui** o atual (APK e PWA no mesmo ficheiro) |
   | `scripts/build-web.mjs` | **substitui** o atual (`npm run build:pwa` gera a PWA) |
   | `package.json` | **substitui** o atual (novos comandos e testes) |
   | `src/webauth.mjs`, `src/webalarm.mjs` | novos: login Google da PWA e aviso do temporizador |
   | `test/web.test.mjs` | novo: testes automáticos |
   | `pwa/sw.js`, `pwa/icons/*.png` | novos: funcionamento sem rede e ícones |
   | `.github/workflows/deploy-pwa.yml` | novo: compila e publica a PWA |

2. *Settings → Secrets and variables → Actions →* separador **Variables** → *New repository variable*:
   nome `GOOGLE_CLIENT_ID`, valor = o ID do cliente do passo 2.3. (É **Variables**, não Secrets: o ID não é segredo.)
3. *Actions → **Publicar PWA (iPhone)** → Run workflow.* Demora 1–2 min e tem de ficar a verde.
   (Se arrancou sozinho antes de teres a variável, falha com «Falta a variável GOOGLE_CLIENT_ID»: cria-a e volta a correr.)
4. Abre o endereço da app no computador: tem de aparecer o GymTrack.

Nota: como mexeste em `src/`, o GitHub também compila uma nova APK. Não faz mal; instala-a por cima se quiseres.

## 4. No iPhone

1. Abre o endereço da app no **Safari**.
2. *Partilhar → Adicionar ao ecrã principal → Adicionar* (se aparecer a opção de abrir como app, deixa-a ligada).
3. Fecha o Safari e abre o GymTrack **pelo ícone**. Usa sempre o ícone: os dados do Safari e os da app instalada são separados.
4. Toca em **Ligar ao Google Drive** → escolhe o **Gmail da pessoa** → Permitir → volta à app.
5. «Ligado ao Google como… É a tua conta pessoal?» → **Sim, usar esta.** Até confirmares, nada é lido nem escrito no Drive.
6. Escolhe **Começar em branco** ou **Usar o «Programa de Adaptação»**.

## 5. Teste final (se passar nos 8, está a 100%)

1. Regista uma série → **Marcar como feito** → o indicador mostra `Drive ✓ hh:mm`.
2. No Drive da pessoa: pasta `GymTrack` com `gymtrack-registos.csv` e `gymtrack-plano.csv`.
3. Modo avião → regista outra série → «Sem rede · guardado no telemóvel». Desliga o modo avião → passa a `Drive ✓` sozinho (ao voltar à app ou em ≤ 1 min).
4. Fecha a app (arrasta para cima) e abre outra vez: os registos continuam lá.
5. Já com a app aberta uma vez com rede, em modo avião, abre pelo ícone: abre na mesma.
6. Temporizador: toca em 30s e não toques no ecrã. Tem de ficar ligado e tocar no fim (ver limitações).
7. Passada mais de 1 hora aparece «Ligar ao Google Drive»: 1 toque e volta com `Drive ✓`.
8. «Mudar de conta» (por baixo do indicador) volta a mostrar a escolha de conta.

## Limitações do iPhone

- **Temporizador:** o iPhone suspende as páginas em segundo plano. Toca com a app aberta e o ecrã ligado; com o ecrã bloqueado **não toca**.
  A app mantém o ecrã ligado enquanto o descanso corre (iOS 18.4 ou superior); em versões mais antigas o ecrã pode apagar.
  O som segue o interruptor de silêncio e não há vibração no iPhone.
- **Login:** o token da Google dura ~1 h e a PWA não o renova em segundo plano. Os registos ficam sempre guardados no
  telemóvel; depois de 1 h, 1 toque em «Ligar ao Google Drive» envia tudo.
- **Contas:** com o âmbito `drive.file` o Google costuma limitar o acesso aos ficheiros criados pela própria app (cliente OAuth).
  Se testares com uma conta que já usa a APK, a PWA pode não ver esses ficheiros e criar outra pasta `GymTrack`. Testa com a conta
  da pessoa do iPhone; se testares com a tua, apaga depois a pasta nova.

## Atualizar a app

Carrega os ficheiros novos no GitHub → o workflow publica sozinho → no iPhone, fecha e abre a app com rede e já tem a versão nova.
Os registos mantêm-se (estão no Drive e no telemóvel).

## Se algo correr mal

| Mensagem / sintoma | O que fazer |
|---|---|
| Google: «Error 400: redirect_uri_mismatch» | O URI de redirecionamento (passo 2.2) tem de ser igual ao endereço da app, com `https`, sem erros e com a `/` final. Espera uns minutos depois de guardar. |
| Google: «app bloqueada» / «access_denied» | Passo 2.4: app **Em produção** com o âmbito `drive.file`. |
| Workflow: «Falta a variável GOOGLE_CLIENT_ID» | Passo 3.2: variável (separador **Variables**) com o nome exato. |
| Workflow: «Get Pages site failed» / «Ensure GitHub Pages has been enabled» | Passo 1.2: *Pages → Source: GitHub Actions*. Se o repositório é privado, passo 1.1. |
| Mostra a versão antiga | Fecha a app, abre com rede e fecha/abre outra vez. Sem rede mostra a última cópia guardada. |
| Depois do login a app continua em «Ligar ao Google Drive» | Abre pelo ícone do ecrã principal (não pelo Safari) e tenta de novo. Se continuar, usa o endereço no Safari (o login completa-se lá, mas os dados ficam separados da app instalada) e diz-me o que aparece. |
| «Sem rede: não foi possível abrir o login Google» | Sem rede a app não sai para o login (numa app instalada não há botão «voltar»). Liga a rede e toca outra vez. |
| «Conta Google errada» | Toca em «Mudar de conta» e escolhe a conta que confirmaste. |
| «O ficheiro … não tem o formato esperado» | O CSV do Drive foi alterado fora da app. A app não lhe toca; manda-me o ficheiro. |
| Não toca o som do temporizador | Ecrã ligado, app aberta, interruptor de silêncio desligado e volume alto. |
