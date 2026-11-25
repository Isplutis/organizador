// Módulo Lista de compras: itens automáticos + manuais, comprar, exportar texto.
import { computed, reactive } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum, lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as S from '../servicos/estoque-servico.js';
import { UNIDADES } from './estoque.js';

export default {
  components: { Modal },
  setup() {
    const brutos = vivo(() => db.lista.where('status').equals('pendente').filter((l) => !l.excluido).toArray(), []);
    const cats = vivo(() => db.categorias.filter((c) => !c.excluido).toArray(), []);

    // Esconde duplicatas do mesmo item (podem surgir na sincronização entre aparelhos).
    const lista = computed(() => {
      const vistos = new Set();
      return brutos.value
        .sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm))
        .filter((l) => !l.itemId || (!vistos.has(l.itemId) && vistos.add(l.itemId)))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });

    const novo = reactive({ nome: '', qtd: '1', unidade: 'un' });
    async function adicionar() {
      const qtd = lerNumero(novo.qtd);
      if (!novo.nome.trim()) return;
      if (!(qtd > 0)) return avisar('Quantidade inválida');
      const r = await S.addManual(novo.nome, qtd, novo.unidade);
      if (r.duplicado) return avisar('Esse item já está na lista');
      if (r.vinculado) avisar('Vinculado ao item do estoque');
      Object.assign(novo, { nome: '', qtd: '1', unidade: 'un' });
    }

    async function mudarQtd(l, txt) {
      const v = lerNumero(txt);
      if (v > 0) await S.editarEntrada(l.id, { qtd: v });
      else avisar('Quantidade inválida');
    }
    async function remover(l) { await S.editarEntrada(l.id, { excluido: true }); }

    // Comprar: item do estoque repõe direto; item manual pergunta se cadastra.
    const perg = reactive({ aberto: false, l: null, categoriaId: '', unidade: '' });
    async function comprar(l) {
      const r = await S.comprar(l.id);
      if (r.precisaCadastro) Object.assign(perg, { aberto: true, l, categoriaId: '', unidade: l.unidade });
      else avisar(`${l.nome}: +${fmtNum(l.qtd)} ${l.unidade} no estoque`);
    }
    async function responder(sim) {
      if (sim && !perg.unidade.trim()) return avisar('Informe a unidade');
      await S.resolverManual(perg.l.id, sim, { categoriaId: perg.categoriaId || null, unidade: perg.unidade.trim() });
      avisar(sim ? `${perg.l.nome} cadastrado no estoque` : `${perg.l.nome} saiu da lista`);
      perg.aberto = false;
    }

    // Exportação em texto simples (WhatsApp)
    const texto = computed(() => 'Lista de compras – ' + new Date().toLocaleDateString('pt-BR') + '\n' +
      lista.value.map((l) => `- ${l.nome}: ${fmtNum(l.qtd)} ${l.unidade}`).join('\n'));
    async function compartilhar() {
      if (!lista.value.length) return avisar('A lista está vazia');
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try { await navigator.share({ text: texto.value }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(texto.value); avisar('Lista copiada. Cole no WhatsApp.'); }
      catch { avisar('Não foi possível copiar'); }
    }

    return { lista, cats, novo, adicionar, mudarQtd, remover, comprar, perg, responder, compartilhar, fmtNum, UNIDADES };
  },
  template: `
  <section class="pilha">
    <form class="linha-form" @submit.prevent="adicionar">
      <input v-model="novo.nome" placeholder="Adicionar item" aria-label="Nome do item" class="cresce">
      <input v-model="novo.qtd" inputmode="decimal" aria-label="Quantidade" class="curto">
      <input v-model="novo.unidade" list="unidades-c" aria-label="Unidade" class="curto">
      <button class="btn primario" type="submit">Adicionar</button>
    </form>
    <datalist id="unidades-c"><option v-for="u in UNIDADES" :value="u"></option></datalist>

    <p v-if="!lista.length" class="vazio">Lista vazia.</p>
    <div v-for="l in lista" :key="l.id" class="linha">
      <button class="check" @click="comprar(l)" :aria-label="'Marcar ' + l.nome + ' como comprado'"></button>
      <div class="linha-info">
        <strong>{{ l.nome }}</strong>
        <span class="suave">{{ l.itemId ? 'Do estoque' : 'Manual' }}</span>
      </div>
      <input class="qtd" :value="fmtNum(l.qtd)" inputmode="decimal" :aria-label="'Quantidade de ' + l.nome"
        @change="mudarQtd(l, $event.target.value)">
      <span class="suave un">{{ l.unidade }}</span>
      <button class="btn-x" @click="remover(l)" :aria-label="'Remover ' + l.nome">×</button>
    </div>

    <button class="btn primario largo" @click="compartilhar">Compartilhar no WhatsApp</button>

    <Modal v-if="perg.aberto" :titulo="'“' + perg.l.nome + '” não está no estoque'" @fechar="perg.aberto=false">
      <p class="suave">Quer cadastrar no estoque com {{ fmtNum(perg.l.qtd) }}?</p>
      <div class="grade-2">
        <label class="campo">Categoria
          <select v-model="perg.categoriaId">
            <option value="">Sem categoria</option>
            <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <label class="campo">Unidade <input v-model="perg.unidade" list="unidades-c"></label>
      </div>
      <div class="acoes">
        <button class="btn" @click="responder(false)">Não, só tirar da lista</button>
        <button class="btn primario" @click="responder(true)">Cadastrar</button>
      </div>
    </Modal>
  </section>`
};
