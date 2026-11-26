// Módulo Estoque: lista por categoria, baixa/reposição, cadastro e edição de itens.
import { ref, computed, reactive } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum, lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as S from '../servicos/estoque-servico.js';
import Categorias from './estoque-categorias.js';
import Compras from './compras.js';
import Online from './online.js';

import { UNIDADES, SeletorUnidade } from './unidades.js';
export { UNIDADES, SeletorUnidade };

export default {
  components: { Modal, Categorias, SeletorUnidade, Compras, Online },
  setup() {
    const itens = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const cats = vivo(() => db.categorias.filter((c) => !c.excluido).toArray(), []);
    const saldos = vivo(() => S.mapaSaldos(), {});
    const movs = vivo(() => db.movimentos.toArray(), []);
    const prev = computed(() => S.previsoes(movs.value, saldos.value));

    // Agrupa por categoria (A–Z); dentro dela, zerados primeiro e depois A–Z.
    const grupos = computed(() => {
      const nomes = Object.fromEntries(cats.value.map((c) => [c.id, c.nome]));
      const mapa = {};
      for (const it of itens.value) {
        const cat = nomes[it.categoriaId] || 'Sem categoria';
        const saldo = saldos.value[it.id] || 0;
        const p = prev.value[it.id];
        (mapa[cat] ||= []).push({ ...it, saldo, zerado: saldo <= 0, prev: saldo > 0 ? p : null, prevTxt: saldo > 0 ? S.textoPrevisao(p) : '' });
      }
      return Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((cat) => ({
        cat,
        itens: mapa[cat].sort((a, b) => (b.zerado - a.zerado) || a.nome.localeCompare(b.nome, 'pt-BR'))
      }));
    });

    // Toque curto = passo de baixa; toque longo (0,5 s) = digitar quantidade.
    let timer = null, longo = false;
    const iniciar = (it, acao) => {
      longo = false;
      clearTimeout(timer);
      timer = setTimeout(() => { longo = true; abrirQtd(it, acao); }, 500);
    };
    const cancelar = () => clearTimeout(timer);
    const clique = async (it, acao) => {
      clearTimeout(timer);
      if (longo) { longo = false; return; }
      await executar(it, acao, it.passoBaixa || 1);
    };
    async function executar(it, acao, qtd) {
      if (acao === 'baixa') {
        if (it.saldo <= 0) return avisar(`${it.nome} já está zerado`);
        const r = await S.darBaixa(it.id, qtd);
        if (r.baixado < qtd) avisar(`Baixa limitada ao saldo: ${fmtNum(r.baixado)} ${it.unidade}`);
        if (r.zerou) avisar(`${it.nome} zerou → foi para a lista de compras`);
      } else {
        const r = await S.repor(it.id, qtd);
        if (r.saiuDaLista) avisar(`${it.nome} reposto → saiu da lista`);
      }
    }

    // Diálogo de quantidade personalizada
    const dq = reactive({ aberto: false, it: null, acao: '', valor: '' });
    function abrirQtd(it, acao) { Object.assign(dq, { aberto: true, it, acao, valor: '' }); }
    async function confirmarQtd() {
      const v = lerNumero(dq.valor);
      if (!(v > 0)) return avisar('Informe uma quantidade maior que zero');
      dq.aberto = false;
      await executar(dq.it, dq.acao, v);
    }

    // Formulário de item
    const form = reactive({ aberto: false, id: null, nome: '', categoriaId: '', novaCat: '', unidade: 'un', saldo: '0', repo: '1', passo: '1' });
    function novo() {
      Object.assign(form, { aberto: true, id: null, nome: '', categoriaId: '', novaCat: '', unidade: 'un', saldo: '0', repo: '1', passo: '1' });
    }
    function editar(it) {
      Object.assign(form, {
        aberto: true, id: it.id, nome: it.nome, categoriaId: it.categoriaId || '', novaCat: '', unidade: it.unidade,
        saldo: fmtNum(it.saldo), repo: fmtNum(it.qtdReposicaoPadrao || 1), passo: fmtNum(it.passoBaixa || 1)
      });
    }
    async function salvar() {
      const saldo = lerNumero(form.saldo), repo = lerNumero(form.repo), passo = lerNumero(form.passo);
      if (!form.nome.trim()) return avisar('Informe o nome');
      if (!form.unidade.trim()) return avisar('Informe a unidade');
      if (!(saldo >= 0)) return avisar('Saldo inválido');
      if (!(repo > 0) || !(passo > 0)) return avisar('Reposição e passo devem ser maiores que zero');
      const duplicado = itens.value.some((i) => i.id !== form.id && i.nome.toLowerCase() === form.nome.trim().toLowerCase());
      if (duplicado) return avisar('Já existe um item com esse nome');
      let categoriaId = form.categoriaId || null;
      if (form.categoriaId === '__nova') {
        if (!form.novaCat.trim()) return avisar('Informe o nome da nova categoria');
        await S.salvarCategoria(null, form.novaCat);
        categoriaId = (await db.categorias.filter((c) => !c.excluido && c.nome === form.novaCat.trim()).first())?.id || null;
      }
      await S.salvarItem({ id: form.id, nome: form.nome, categoriaId, unidade: form.unidade, saldo, qtdReposicaoPadrao: repo, passoBaixa: passo });
      form.aberto = false;
      avisar('Item salvo');
    }
    async function excluir() {
      if (!confirm(`Excluir "${form.nome}" do estoque?`)) return;
      await S.excluirItem(form.id);
      form.aberto = false;
      avisar('Item excluído');
    }

    const aba = ref(sessionStorage.getItem('estoqueAba') || 'itens');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('estoqueAba', k); };
    return { aba, irAba, grupos, cats, fmtNum, iniciar, cancelar, clique, dq, confirmarQtd, form, novo, editar, salvar, excluir, UNIDADES };
  },
  template: `
  <section class="pilha">
    <div class="abas-seg"><button :class="{ ativo: aba==='itens' }" @click="irAba('itens')">Estoque</button><button :class="{ ativo: aba==='compras' }" @click="irAba('compras')">Lista</button><button :class="{ ativo: aba==='online' }" @click="irAba('online')">Online</button><button :class="{ ativo: aba==='categorias' }" @click="irAba('categorias')">Categorias</button></div>
    <Categorias v-if="aba==='categorias'"></Categorias>
    <Compras v-else-if="aba==='compras'"></Compras>
    <Online v-else-if="aba==='online'"></Online>
    <template v-else>
    <p v-if="!grupos.length" class="vazio">Nenhum item cadastrado. Toque em “+ Novo item”.</p>
    <div v-for="g in grupos" :key="g.cat" class="pilha">
      <h2 class="rotulo">{{ g.cat }}</h2>
      <div v-for="it in g.itens" :key="it.id" class="linha" :class="{ zerado: it.zerado }">
        <button class="linha-info" @click="editar(it)" :aria-label="'Editar ' + it.nome">
          <strong>{{ it.nome }}</strong>
          <span :class="it.zerado ? 'alerta' : 'suave'">{{ it.zerado ? 'Zerado' : fmtNum(it.saldo) + ' ' + it.unidade }}<template v-if="it.prevTxt"> · <span :class="it.prev.dias <= 3 ? 'prev-curta' : ''">{{ it.prevTxt }}</span></template></span>
        </button>
        <button class="btn-qtd" aria-label="Dar baixa (segure para digitar)"
          @pointerdown="iniciar(it,'baixa')" @pointerleave="cancelar" @pointercancel="cancelar"
          @click="clique(it,'baixa')" @contextmenu.prevent>−</button>
        <button class="btn-qtd" aria-label="Repor (segure para digitar)"
          @pointerdown="iniciar(it,'repor')" @pointerleave="cancelar" @pointercancel="cancelar"
          @click="clique(it,'repor')" @contextmenu.prevent>+</button>
      </div>
    </div>
    <button class="btn-tracejado" @click="novo">+ Novo item</button>
    <p class="dica">Toque no − / + para mover o passo do item. Segure para digitar a quantidade.</p>
    </template>

    <Modal v-if="dq.aberto" :titulo="(dq.acao === 'baixa' ? 'Baixa de ' : 'Repor ') + dq.it.nome" @fechar="dq.aberto=false">
      <label class="campo">Quantidade ({{ dq.it.unidade }})
        <input v-model="dq.valor" inputmode="decimal" autofocus @keyup.enter="confirmarQtd">
      </label>
      <div class="acoes"><button class="btn" @click="dq.aberto=false">Cancelar</button><button class="btn primario" @click="confirmarQtd">Confirmar</button></div>
    </Modal>

    <Modal v-if="form.aberto" :titulo="form.id ? 'Editar item' : 'Novo item'" @fechar="form.aberto=false">
      <label class="campo">Nome <input v-model="form.nome" autofocus></label>
      <label class="campo">Categoria
        <select v-model="form.categoriaId">
          <option value="">Sem categoria</option>
          <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.nome }}</option>
          <option value="__nova">+ Nova categoria…</option>
        </select>
      </label>
      <label v-if="form.categoriaId==='__nova'" class="campo">Nome da nova categoria <input v-model="form.novaCat"></label>
      <div class="grade-2">
        <label class="campo">Unidade <SeletorUnidade v-model="form.unidade"></SeletorUnidade></label>
        <label class="campo">Saldo atual <input v-model="form.saldo" inputmode="decimal"></label>
        <label class="campo">Reposição padrão <input v-model="form.repo" inputmode="decimal"></label>
        <label class="campo">Passo de baixa <input v-model="form.passo" inputmode="decimal"></label>
      </div>
      <div class="acoes">
        <button v-if="form.id" class="btn perigo" @click="excluir">Excluir</button>
        <span class="espaco"></span>
        <button class="btn" @click="form.aberto=false">Cancelar</button>
        <button class="btn primario" @click="salvar">Salvar</button>
      </div>
    </Modal>
  </section>`
};
