# GymTrack — APK com os registos no teu Google Drive pessoal

> **Pessoal, não Luvio.** Tudo abaixo usa a tua conta Google pessoal e a tua conta GitHub pessoal.
> Não uses o projeto Google Cloud, o repositório nem os segredos das APKs da Luvio.

Precisas de: conta Google pessoal (a do Drive onde queres os registos) e conta GitHub pessoal.
Para criar uma conta GitHub nova: github.com → Sign up, com o email pessoal.

---

## 1. Google Cloud — projeto NOVO na conta pessoal

Entra em https://console.cloud.google.com **com a conta Google pessoal** (confirma o avatar no canto superior direito).

1. **Projeto:** seletor de projetos (topo) → *Novo projeto* → nome `GymTrack` → Criar → seleciona-o.
2. **Ativar o Drive:** menu → *APIs e serviços* → *Biblioteca* → «Google Drive API» → **Ativar**.
3. **Ecrã de consentimento:** menu → *Google Auth Platform* → *Começar* (Get started).
   Nome da app `GymTrack` · email de apoio = o teu · Público = **Externo** (External) · email de contacto = o teu → Concluir.
4. **Âmbito (scope):** *Google Auth Platform* → *Acesso a dados* (Data Access) → *Adicionar ou remover âmbitos* →
   marca `.../auth/drive.file` (ver e gerir apenas os ficheiros que esta app criar) → Atualizar → **Guardar**.
5. **Publicar:** *Google Auth Platform* → *Público* (Audience) → **Publicar app** (passar a «Em produção»).
   Em modo de teste a Google obriga a autorizar de novo de 7 em 7 dias. O âmbito `drive.file` não é sensível
   nem restrito: não precisa de verificação.
6. **Cliente Android:** *Google Auth Platform* → *Clientes* → *Criar cliente* (https://console.cloud.google.com/auth/clients/create)
   - Tipo de aplicação: **Android**
   - Nome: `GymTrack APK`
   - Nome do pacote: `pt.pedrogoncalves.gymtrack`
   - Impressão digital do certificado SHA-1: `58:DD:03:4E:35:72:7C:34:E2:DD:CF:31:A8:53:DD:FE:EB:5B:4B:F7`
   → **Criar**. Não há IDs para copiar: o código não usa o ID do cliente.

## 2. GitHub — repositório NOVO na conta pessoal

1. Novo repositório, por exemplo `gymtrack`, **sem** README inicial.
   Público: descarregas a APK no telemóvel sem iniciar sessão. Privado: também funciona, mas tens de ter sessão iniciada no GitHub no telemóvel.
2. *uploading an existing file* → arrasta **todo o conteúdo** desta pasta (inclui as pastas `.github`, `src`, `native`, `scripts`, `test`)
   → Commit. Confirma que existe `.github/workflows/build-apk.yml` (as pastas que começam por ponto às vezes ficam ocultas ao arrastar).
3. *Settings → Secrets and variables → Actions → New repository secret*: cria os **4 segredos** com os valores do ficheiro
   `SEGREDOS-GITHUB.txt` (nomes exatos): `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
   Estes segredos são **deste repositório** — não aproveitam os de nenhum outro.
4. O workflow arranca sozinho quando carregas os ficheiros; se foi antes de criares os segredos, falha com «Falta o segredo…».
   Depois dos segredos: *Actions → Compilar APK → Run workflow*.
5. Espera ~5–8 min. A APK fica em **Releases → apk-latest → `GymTrack.apk`**.

## 3. Instalar e ligar à conta certa

1. No telemóvel abre a página da release, descarrega `GymTrack.apk` e instala (se pedir, permite «instalar de fontes desconhecidas» ao browser).
2. Abre a app → toca em **Ligar ao Google Drive** → no ecrã da Google **escolhe a conta pessoal** → autoriza.
3. A app mostra *«Ligado ao Google como … É a tua conta pessoal?»* → **Sim, usar esta**.
   Até confirmares, a app não lê nem escreve nada no Drive.
4. Fica `Drive ✓` no ecrã inicial, com a conta por baixo. No Drive aparece a pasta `GymTrack` com `gymtrack-registos.csv`.

**Conta errada?** Toca em *Não, mudar* (ou em *Mudar de conta*, por baixo do indicador do Drive). Se voltar a aparecer a
mesma conta, remove o acesso do GymTrack em https://myaccount.google.com/connections e toca em *Ligar* outra vez.
Depois de confirmada, se a Google ligar outra conta a app mostra «Conta Google errada» e não escreve nada.

---

## 4. Montar o plano e usar o temporizador

- **Primeira vez:** depois de ligares o Drive, a app pergunta «Monta o teu plano»: *Começar em branco* ou *Usar o «Programa de Adaptação»* (modelo com os teus exercícios atuais).
- **Ciclo → Editar:** ▲ ▼ ordenam; *Retirar do ciclo* (toca duas vezes) tira o exercício só desse ciclo; o campo de texto muda a linha por baixo do nome do ciclo. *Concluir* sai da edição.
- **+ Adicionar exercício:** mostra os exercícios **com histórico** que não estão neste ciclo (os retirados aparecem como «Retirado») ou deixa criar um novo só com o nome.
  Ao voltar a acrescentar um exercício retirado, o histórico está todo lá, porque está ligado ao nome.
- **Temporizador:** barra no fundo de cada ciclo. Toca num tempo (30s, 45s, 1min, 90s, 2min, 3min) para começar; −15/+15 ajustam; Pausa/Continuar; ↺ repõe.
  O alarme é do Android: toca com o ecrã bloqueado, durante 8 s, com vibração, no volume de **alarme** do telemóvel. «Parar alarme» silencia.
  **Testa uma vez:** inicia 30s, bloqueia o ecrã e espera. Se não tocar, confirma o volume de alarme e que a app não está «forçada a parar».

## 5. Partilhar a APK com a Edite (ou outra pessoa)

Cada pessoa usa o **seu Gmail** e os dados ficam no **Drive dela** (pasta `GymTrack`, criada pela app; ela não precisa de abrir o Drive).
Não há nada a configurar na Google Cloud por pessoa, **desde que a app esteja publicada** (passo 1.5). Em modo de teste teria de ser adicionada como utilizadora de teste e a autorização caducaria de 7 em 7 dias.

1. Envia-lhe o `GymTrack.apk` (o link da release, se o repositório for público, ou o ficheiro por WhatsApp/email). Ela instala-o (permitir «fontes desconhecidas»).
2. Ela abre a app → **Ligar ao Google Drive** → escolhe **o Gmail dela** → **Sim, usar esta**.
3. **Começar em branco** e monta o plano dela. Nada do teu plano aparece no telemóvel dela e nada dos dados dela vai para o teu Drive.
4. Se quiseres ver os registos dela: ela partilha contigo a pasta `GymTrack` (Drive → Partilhar).

## Onde ficam os dados
- `GymTrack/gymtrack-registos.csv` no teu Drive: uma linha por série
  `data;plano;ciclo;exercicio;serie;peso_kg;reps;atualizado`. Abre no Excel (separador `;`, vírgula decimal).
- `GymTrack/gymtrack-plano.csv`: o teu plano (3 ciclos, exercícios e ordem; o ciclo 0 guarda os exercícios retirados com histórico).
  Não o edites à mão: usa a app.
- `GymTrack/Backups/`: uma cópia por dia de cada ficheiro (a anterior à 1.ª alteração do dia), últimas 30 de cada.
- No telemóvel há sempre uma cópia local: sem rede continuas a registar e a app envia quando houver rede.
- O CSV serve para ver, filtrar e fazer gráficos. Para corrigir um registo antigo, pede-me ajuda em vez de editar à mão.

## Atualizar a app
Carrega os ficheiros novos no GitHub → o workflow compila sozinho → instala a nova APK por cima da antiga.
Os registos mantêm-se (estão no Drive). A chave de assinatura tem de ser sempre a mesma.

## Se algo correr mal
| Mensagem | O que fazer |
|---|---|
| «Google Cloud: o cliente Android (pacote/SHA-1) não corresponde a esta APK» | Confirma no passo 1.6 o pacote `pt.pedrogoncalves.gymtrack` e o SHA-1 (sem espaços). |
| «Drive API has not been used…» / «Access Not Configured» | Passo 1.2: ativar a Google Drive API **neste** projeto. |
| «Falta o segredo …» no GitHub | Passo 2.3: os 4 segredos, com os nomes exatos. |
| «Erro de acesso / app bloqueada» ao autorizar | Passos 1.3–1.5: ecrã de consentimento concluído, âmbito `drive.file` e app publicada. |
| «Conta Google errada» | Ver «Conta errada?» no passo 3. |
| «Sem rede · guardado no telemóvel» | Normal sem rede: nada se perde; envia sozinho quando houver rede. |
| O alarme do temporizador não toca | Volume de **alarme** do telemóvel; app não «forçada a parar»; modo «Não incomodar» a bloquear alarmes. |
| Reinstalei e pede o plano | Normal só se o Drive ainda não tem o plano. Se já tinha, a app mostra «A procurar o teu plano no Drive…» e recupera-o. |
| «O ficheiro … não tem o formato esperado» | O CSV do Drive foi alterado fora da app. A app não lhe toca; manda-me o ficheiro. |
