# Organizador Pessoal — v0.1.0 (Base + Estoque + Compras)

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
Repita o passo 3 com os arquivos alterados. Não é preciso mudar versão em lugar nenhum:
quando o aparelho estiver online, ele baixa a versão nova sozinho.

## Onde mexer
| Quero mudar…                     | Arquivo                              |
|----------------------------------|--------------------------------------|
| Cores do tema                    | css/estilo.css (bloco `:root`)       |
| Regras de estoque/lista          | js/servicos/estoque-servico.js       |
| Tela do estoque                  | js/modulos/estoque.js                |
| Tela da lista de compras         | js/modulos/compras.js                |
| Menu / incluir módulo novo       | js/app.js (objeto `MODULOS`)         |
| Unidades sugeridas               | js/modulos/estoque.js (`UNIDADES`)   |

## Observações
- Abrir o index.html com duplo clique NÃO funciona (o navegador bloqueia por segurança). Use o endereço do GitHub Pages.
- Os dados ficam só no navegador de cada aparelho até a sincronização com o Google Drive (próxima entrega).
