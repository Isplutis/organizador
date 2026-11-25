# Organizador Pessoal — v0.2.2 (Base + Estoque + Compras + Rotina + Água)

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

## Observações
- Abrir o index.html com duplo clique NÃO funciona (o navegador bloqueia por segurança). Use o endereço do GitHub Pages.
- Os dados ficam só no navegador de cada aparelho até a sincronização com o Google Drive (próxima entrega).
