// Módulo Lista de compras: itens automáticos + manuais, comprar, exportar texto.
import { computed, reactive } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum, lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as S from '../servicos/estoque-servico.js';
import { UNIDADES, SeletorUnidade } from './unidades.js';
import * as PR from '../servicos/precos-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';

export default {
  components: { Modal, SeletorUnidade },
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

    const regs = vivo(() => db.precosMercado.toArray(), []);
    const itensEst = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const saldosL = vivo(() => S.mapaSaldos(), {});
    const movsL = vivo(() => db.movimentos.toArray(), []);
    const acabando = computed(() => {
      const p = S.previsoes(movsL.value, saldosL.value), naLista = new Set(lista.value.map((l) => l.itemId));
      return itensEst.value.filter((i) => p[i.id] && (saldosL.value[i.id] || 0) > 0 && p[i.id].dias <= 3 && !naLista.has(i.id))
        .map((i) => ({ ...i, txt: S.textoPrevisao(p[i.id]) }));
    });
    async function adicionarAcabando(i) { await S.addManual(i.nome, i.qtdReposicaoPadrao || 1, i.unidade); avisar(i.nome + ' adicionado à lista'); }
    const hist = (l) => PR.historico(regs.value, l);
    // linha com preço previsto (o digitado ou o último pago) e subtotal em unidade cheia
    const linhas = computed(() => lista.value.map((l) => {
      const h = hist(l), b = PR.base(l.unidade), preco = l.precoEst ?? h?.ult ?? null;
      return { ...l, h, b, preco, sub: preco != null ? l.qtd / b.fator * preco : null };
    }));
    const total = computed(() => ({ v: linhas.value.reduce((s, l) => s + (l.sub || 0), 0), sem: linhas.value.filter((l) => l.sub == null).length }));

    const novo = reactive({ nome: '', qtd: '1', unidade: 'un', preco: '' });
    const novoItem = computed(() => itensEst.value.find((i) => PR.chave(i.nome) === PR.chave(novo.nome)));
    const novoBase = computed(() => PR.base(novoItem.value?.unidade || novo.unidade).base);
    const novoHist = computed(() => novo.nome.trim() ? hist({ itemId: novoItem.value?.id, nome: novo.nome }) : null);
    async function adicionar() {
      const qtd = lerNumero(novo.qtd);
      if (!novo.nome.trim()) return;
      if (!(qtd > 0)) return avisar('Quantidade inválida');
      const p = novo.preco.trim() ? lerNumero(novo.preco) : null;
      if (p != null && !(p > 0)) return avisar('Preço inválido');
      const r = await S.addManual(novo.nome, qtd, novo.unidade, p);
      if (r.duplicado) return avisar('Esse item já está na lista');
      if (r.vinculado) avisar('Vinculado ao item do estoque');
      Object.assign(novo, { nome: '', qtd: '1', unidade: 'un', preco: '' });
    }

    async function mudarQtd(l, txt) {
      const v = lerNumero(txt);
      if (v > 0) await S.editarEntrada(l.id, { qtd: v });
      else avisar('Quantidade inválida');
    }
    async function remover(l) { await S.editarEntrada(l.id, { excluido: true }); }

    // Comprar: item do estoque repõe direto; item manual pergunta se cadastra.
    const perg = reactive({ aberto: false, l: null, categoriaId: '', unidade: '' });
    // Comprei: pede o preço pago por unidade cheia (obrigatório) antes de repor o estoque
    const pc = reactive({ aberto: false, l: null, qtd: '', preco: '' });
    function comprar(l) { Object.assign(pc, { aberto: true, l, qtd: String(l.qtd).replace('.', ','), preco: l.preco != null ? String(l.preco).replace('.', ',') : '' }); }
    const pcSub = computed(() => { const q = lerNumero(pc.qtd), p = lerNumero(pc.preco); return pc.l && q > 0 && p > 0 ? q / pc.l.b.fator * p : null; });
    async function confirmarCompra() {
      const q = lerNumero(pc.qtd), p = lerNumero(pc.preco);
      if (!(q > 0)) return avisar('Quantidade inválida');
      if (!(p > 0)) return avisar('Informe o preço pago por ' + pc.l.b.base);
      const l = pc.l;
      if (q !== l.qtd) await S.editarEntrada(l.id, { qtd: q });
      await PR.registrar({ itemId: l.itemId, nome: l.nome, unidade: l.unidade, qtd: q, valor: p });
      pc.aberto = false;
      await efetivar({ ...l, qtd: q });
    }
    async function efetivar(l) {
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

    const hoje = hojeStr();
    const gastoHoje = computed(() => Math.round(regs.value.filter((r) => !r.excluido && r.data === hoje).reduce((s, r) => s + (r.total || 0), 0) * 100) / 100);
    function lancarGasto() { sessionStorage.setItem('finNovo', JSON.stringify({ tipo: 'desp', descricao: 'Mercado', catNome: 'Mercado', ...(gastoHoje.value > 0 ? { valor: gastoHoje.value } : {}) })); location.hash = 'financas'; }

    // histórico de preços (gráfico, média, mínimo) + preço previsto
    const ph = reactive({ aberto: false, l: null, prev: '' });
    function abrirHist(l) { Object.assign(ph, { aberto: true, l, prev: l.precoEst != null ? String(l.precoEst).replace('.', ',') : '' }); }
    const phH = computed(() => ph.l ? hist(ph.l) : null);
    const grafico = computed(() => {
      const h = phH.value; if (!h) return null;
      const v = h.regs.map((r) => r.valor), lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1, W = 326, H = 110, pad = 10;
      const y = (x) => +(pad + (H - 2 * pad) * (1 - (x - lo) / sp)).toFixed(1);
      const pts = v.map((x, i) => ({ x: v.length === 1 ? W / 2 : +(i * W / (v.length - 1)).toFixed(1), y: y(x) }));
      const linha = pts.map((p) => p.x + ',' + p.y).join(' ');
      return { pts, linha, area: `${pts[0].x},${H} ${linha} ${pts[pts.length - 1].x},${H}`, yMedia: y(h.media) };
    });
    async function salvarPrev() {
      const p = ph.prev.trim() ? lerNumero(ph.prev) : null;
      if (p != null && !(p > 0)) return avisar('Preço inválido');
      await S.editarEntrada(ph.l.id, { precoEst: p }); ph.aberto = false; avisar('Preço previsto salvo');
    }
    async function apagarReg(r) { if (confirm('Apagar este registro de preço?')) await PR.excluir(r.id); }
    const fd = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4);
    return { acabando, adicionarAcabando, linhas, total, novoBase, novoHist, pc, pcSub, confirmarCompra, gastoHoje, ph, abrirHist, phH, grafico, salvarPrev, apagarReg, fd, fmtR: PR.fmtR, lancarGasto, lista, cats, novo, adicionar, mudarQtd, remover, comprar, perg, responder, compartilhar, fmtNum, UNIDADES };
  },
  template: `
  <section class="pilha">
    <form class="linha-form" @submit.prevent="adicionar">
      <input v-model="novo.nome" placeholder="Adicionar item" aria-label="Nome do item" class="cresce">
      <input v-model="novo.qtd" inputmode="decimal" aria-label="Quantidade" class="curto">
      <span class="curto-un"><SeletorUnidade v-model="novo.unidade"></SeletorUnidade></span>
      <input v-model="novo.preco" inputmode="decimal" :placeholder="'Preço R$/' + novoBase + (novoHist ? ' (último ' : ' (opcional)') + (novoHist ? '' + novoHist.ult.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ')' : '')" :aria-label="'Preço previsto por ' + novoBase" class="cresce">
      <button class="btn primario" type="submit">Adicionar</button>
    </form>

    <div v-if="acabando.length" class="caixa pilha acabando">
      <span class="rotulo">Vão acabar em breve</span>
      <div v-for="i in acabando" :key="i.id" class="entre"><span>{{ i.nome }} <small class="suave">· {{ i.txt }}</small></span><button class="btn mini" @click="adicionarAcabando(i)">+ Lista</button></div>
    </div>
    <div v-if="linhas.length" class="total-lista"><span>Total estimado<small v-if="total.sem"> · {{ total.sem }} sem preço</small></span><b class="num">{{ fmtR(total.v) }}</b></div>
    <p v-if="!lista.length" class="vazio">Lista vazia.</p>
    <div v-for="l in linhas" :key="l.id" class="linha">
      <button class="check" @click="comprar(l)" :aria-label="'Marcar ' + l.nome + ' como comprado'"></button>
      <button class="linha-info" @click="abrirHist(l)" :aria-label="'Preços de ' + l.nome">
        <strong>{{ l.nome }}</strong>
        <span class="suave preco-linha"><template v-if="l.preco != null"><b class="num">{{ fmtR(l.preco) }}/{{ l.b.base }}</b>{{ l.precoEst != null ? ' previsto' : '' }}<template v-if="l.h"> · média {{ fmtR(l.h.media) }} · mín {{ fmtR(l.h.min) }}</template></template><template v-else>{{ l.itemId ? 'Do estoque' : 'Manual' }} · sem preço</template></span>
      </button>
      <input class="qtd" :value="fmtNum(l.qtd)" inputmode="decimal" :aria-label="'Quantidade de ' + l.nome"
        @change="mudarQtd(l, $event.target.value)">
      <span class="suave un">{{ l.unidade }}</span>
      <button class="btn-x" @click="remover(l)" :aria-label="'Remover ' + l.nome">×</button>
    </div>

    <button class="btn primario largo" @click="compartilhar">Compartilhar no WhatsApp</button>
    <button class="btn largo" @click="lancarGasto">Lançar gasto da compra em Finanças{{ gastoHoje > 0 ? ' (' + fmtR(gastoHoje) + ' hoje)' : '' }}</button>

    <Modal v-if="pc.aberto" :titulo="'Comprei: ' + pc.l.nome" @fechar="pc.aberto=false">
      <div class="grade-2">
        <label class="campo">Quantidade ({{ pc.l.unidade }}) <input v-model="pc.qtd" inputmode="decimal"></label>
        <label class="campo">Preço por {{ pc.l.b.base }} (R$) <input v-model="pc.preco" inputmode="decimal" autofocus></label>
      </div>
      <p class="dica">Preço sempre por unidade cheia (1 {{ pc.l.b.base }}).<template v-if="pc.l.h"> Último: {{ fmtR(pc.l.h.ult) }} · média {{ fmtR(pc.l.h.media) }} · mín {{ fmtR(pc.l.h.min) }}</template></p>
      <p v-if="pcSub != null" class="suave">Subtotal: <b class="num">{{ fmtR(pcSub) }}</b></p>
      <div class="acoes"><button class="btn" @click="pc.aberto=false">Cancelar</button><button class="btn primario" @click="confirmarCompra">Confirmar</button></div>
    </Modal>

    <Modal v-if="ph.aberto" :titulo="ph.l.nome" @fechar="ph.aberto=false">
      <template v-if="phH">
        <div class="on-stats"><div><span>Último</span><b class="num">{{ fmtR(phH.ult) }}</b></div><div><span>Média</span><b class="num">{{ fmtR(phH.media) }}</b></div><div><span>Mínimo</span><b class="num">{{ fmtR(phH.min) }}</b></div></div>
        <p class="dica">Valores por 1 {{ phH.base }}. Linha tracejada = média.</p>
        <svg v-if="grafico" viewBox="0 0 326 110" class="on-big" aria-hidden="true"><line x1="0" :y1="grafico.yMedia" x2="326" :y2="grafico.yMedia" class="alvo"/><polygon :points="grafico.area" class="ar"/><polyline :points="grafico.linha" class="ln"/><circle v-for="(p,i) in grafico.pts" :key="i" :cx="p.x" :cy="p.y" r="3" class="pt"/></svg>
        <div class="on-regs"><div v-for="r in phH.regs.slice().reverse()" :key="r.id"><span class="suave">{{ fd(r.data) }} · {{ fmtNum(r.qtdBase) }} {{ r.unidadeBase }}</span><b class="num">{{ fmtR(r.valor) }}</b><button class="btn-x" aria-label="Apagar registro" @click="apagarReg(r)">×</button></div></div>
      </template>
      <p v-else class="suave">Ainda sem compras registradas. O preço entra no histórico quando você marca o item como comprado.</p>
      <label class="campo">Preço previsto para esta compra (por {{ ph.l.b.base }}) <input v-model="ph.prev" inputmode="decimal" placeholder="opcional"></label>
      <div class="acoes"><button class="btn" @click="ph.aberto=false">Fechar</button><button class="btn primario" @click="salvarPrev">Salvar</button></div>
    </Modal>

    <Modal v-if="perg.aberto" :titulo="'“' + perg.l.nome + '” não está no estoque'" @fechar="perg.aberto=false">
      <p class="suave">Quer cadastrar no estoque com {{ fmtNum(perg.l.qtd) }}?</p>
      <div class="grade-2">
        <label class="campo">Categoria
          <select v-model="perg.categoriaId">
            <option value="">Sem categoria</option>
            <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <label class="campo">Unidade <SeletorUnidade v-model="perg.unidade"></SeletorUnidade></label>
      </div>
      <div class="acoes">
        <button class="btn" @click="responder(false)">Não, só tirar da lista</button>
        <button class="btn primario" @click="responder(true)">Cadastrar</button>
      </div>
    </Modal>
  </section>`
};
