# Organizador Pessoal — v0.11.3 (Rotina, Desenvolvimento, Finanças, Compras + Compras online)

## Publicar no GitHub Pages (sem instalar nada)
1. Crie uma conta em github.com (gratuita).
2. Clique em **New repository** → nome: `organizador` → **Public** → Create.
3. Na página do repositório: **Add file → Upload files** → arraste TODO o conteúdo desta pasta
   (index.html, sw.js, manifest.json e as pastas css, js, lib, icones) → **Commit changes**.
4. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
5. Em 1–2 minutos o app estará em: `https://SEU-USUARIO.github.io/organizador/`

## Instalar
- Android (Chrome): abra o endereço → menu ⋮ → **Adicionar à tela inicial / Instalar app**.
- PC (Chrome/Edge): ícone de instalar na barra de endereço.

## Atualizar o app depois
Repita o passo 3 arrastando TUDO de novo (arquivos + as 4 pastas); o GitHub substitui o que mudou. Não é preciso mudar versão em lugar nenhum:
quando o aparelho estiver online, ele baixa a versão nova sozinho.
Obs.: na PRIMEIRA atualização a partir da v0.2.0 pode levar até ~10 min (cache do GitHub). Feche e abra o app de novo. Das próximas em diante, é imediato.
Seus dados NUNCA são apagados ao atualizar: eles ficam no navegador, separados do código.

## Onde mexer
| Quero mudar…                     | Arquivo                              |
|----------------------------------|--------------------------------------|
| Cores do tema                    | css/estilo.css (bloco `:root`)       |
| Regras de estoque/lista          | js/servicos/estoque-servico.js       |
| Tela do estoque                  | js/modulos/estoque.js                |
| Tela da lista de compras         | js/modulos/compras.js                |
| Menu / incluir módulo novo       | js/app.js (objeto `MODULOS`)         |
| Unidades sugeridas               | js/modulos/estoque.js (`UNIDADES`)   |
| Regras da Rotina/Água (%, falhas)| js/servicos/rotina-servico.js        |
| Tela Semana                      | js/modulos/rotina-semana.js          |
| Tela Histórico                   | js/modulos/rotina-historico.js       |
| Tela Falhas                      | js/modulos/rotina-falhas.js          |
| Tela Água                        | js/modulos/agua.js                   |
| Cadastro de atividade            | js/modulos/rotina-form.js            |
| Lista de atividades / sugestões  | js/modulos/rotina-atividades.js      |
| Viagem                           | js/modulos/rotina-viagem.js          |
| Categorias do estoque            | js/modulos/estoque-categorias.js     |
| Regras de Estudos (plano, notas) | js/servicos/estudos-servico.js       |
| Tela da Pós / curso / cronômetro | js/modulos/estudos-curso.js          |
| Tela da disciplina (aulas/notas) | js/modulos/estudos-disciplina.js     |
| Duolingo                         | js/modulos/duolingo.js               |
| Cursos e certificações           | js/modulos/estudos-cursos.js         |
| Unidades de medida               | js/modulos/unidades.js               |
| Sincronização Google Drive       | js/sync.js (CLIENT_ID_PADRAO no topo)|

## Observações
- Abrir o index.html com duplo clique NÃO funciona (o navegador bloqueia por segurança). Use o endereço do GitHub Pages.
- Os dados ficam só no navegador de cada aparelho até a sincronização com o Google Drive (próxima entrega).

## Sincronização com o Google Drive (uma vez só)
1. Acesse console.cloud.google.com e crie um projeto (ex.: "Organizador").
2. Menu ☰ → APIs e serviços → Biblioteca → procure "Google Drive API" → Ativar.
3. Menu ☰ → Google Auth Platform → Primeiros passos/Branding: nome do app "Organizador", seu e-mail de suporte → Público: Externo → concluir.
4. Google Auth Platform → Público (Audience) → Usuários de teste → adicione o SEU Gmail.
5. Google Auth Platform → Clientes → Criar cliente → Tipo: Aplicativo da Web →
   Origens JavaScript autorizadas: https://isplutis.github.io  (sem barra e sem /organizador) → Criar.
6. Copie o "ID do cliente" (termina em .apps.googleusercontent.com). Não precisa da chave secreta.
7. No app: Mais → Sincronização → Conectar ao Google (o ID já vem fixo desde a v0.3.1) → escolha sua conta.
   Vai aparecer "O Google não verificou este app": clique em Continuar (o app é seu).
8. No segundo aparelho: mesmo passo 7. Se ele já tiver dados, escolha "Usar só os da nuvem".

## v0.6.0 — Compras online
- Compras › **Online**: Desejos (preço-alvo, histórico, selos No alvo / Menor preço / Indisponível) e Pedidos (status, atraso, devolução, garantia, somar ao Estoque).
- Amazon, Shopee e outras: preço registrado à mão. Mercado Livre: automático 4x/dia depois de configurar o servidor (pasta `servidor-cloudflare`, arquivo GUIA-CLOUDFLARE.md). A pasta `servidor-cloudflare` não precisa ir para o GitHub.

## v0.6.1 — Preços na lista de compras
- Preço sempre por unidade cheia (1 kg, 1 L, 1 un, 1 pct…; itens em g/ml usam preço por kg/L).
- Ao adicionar: preço previsto opcional (sugere o último). Ao marcar comprado: preço pago obrigatório → entra no histórico.
- Toque no item: gráfico, último, média e mínimo. Total estimado no topo. "Lançar gasto" já leva o total comprado hoje.

## v0.6.3 — Backup manual
- ⚙ › Backup manual: baixar arquivo .json com tudo; restaurar (juntar ou substituir). Lembrete no Início a cada 30 dias.

## v0.7.0
- Água: ritmo (acima/abaixo), de quanto em quanto tempo beber e projeção do dia; horários de acordar/dormir no ⚙ da Água.
- Estoque: previsão automática "acaba em ~X dias" (pelas baixas); Lista mostra o que vai acabar em até 3 dias.
- Busca geral (lupa no topo).

## v0.8.0
- Finanças › Assinaturas (mensais/anuais, R$ ou US$, custo mensal/anual, aviso de renovação).
- Estudos › Metas (automáticas ou manuais; ano, trimestre, mês ou livre) e Estudos › Leituras (livros, filmes, séries, cursos, lugares…).

## v0.9.0
- Agenda unificada no Início (Mês ou 14 dias): compromissos (horário, repetição, local, concluir), aniversários com idade, vencimentos e faturas, entregas/devoluções/garantias, viagens, prazos e provas da pós, atividades da Rotina (marcar ali mesmo).
- Leituras: comentário opcional sobre a nota.
- Disciplinas: data da prova.

## v0.10.0 — Google Agenda
- ⚙ › Google Agenda: cria a agenda "Organizador" e envia lembretes (compromissos, aniversários, contas/faturas/assinaturas só com nomes, entregas, devoluções, garantias, provas, prazos, Rotina com horário). Lê as demais agendas e mostra na Agenda do app.
- Antes: no Google Cloud, ative a "Google Calendar API" e adicione os escopos calendar.app.created e calendar.readonly na tela de consentimento.

## v0.11.0
- Revisão da semana no Início (domingo a quarta) + evento no Google Agenda domingo 20h.
- Finanças › Relatório (mês/ano) com "Salvar PDF".

## v0.11.1
- Estudos › Leituras renomeada para Atividades. Agenda sem atividades da Rotina.
- Revisão do período só sob demanda (botão no fim do Início; escolher datas; Salvar PDF). Sem aviso nem evento automático.
- Relatório: modo Período (de mês até mês), patrimônio no fim do mês e câmbio médio.

## v0.11.2
- Google Agenda: atividades da Rotina não são mais enviadas (as já enviadas são removidas na próxima sincronização).

## v0.11.3
- Aba Estudos renomeada para Desenvolvimento; Atividades → Hobbies.
- Água depois da meta: bônus (próximo 0,5 L) com intervalo e próxima dose, sequência de dias, recorde e média de 7 dias.
- Aviso de backup removido do Início (backup continua em ⚙).
