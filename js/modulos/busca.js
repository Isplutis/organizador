// Busca geral: procura em Estoque, Lista, Compras online, Rotina, Estudos e Finanças (só com o PIN recente).
import { ref, computed, onMounted, nextTick } from '../../lib/vue.esm-browser.prod.js';
import { db } from '../db.js';
import { desbloqueadoRecente, fmtR } from '../servicos/fin-servico.js';
import { capturaRapida } from '../servicos/idiomas-servico.js';
import { avisar } from '../ui.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fd = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';

export default {
  emits: ['fechar', 'ir'],
  setup(_, { emit }) {
    const q = ref(''), dados = ref(null), campo = ref(null);
    const fin = desbloqueadoRecente();
    onMounted(async () => {
      nextTick(() => campo.value?.focus());
      const [leit, metas, itens, lista, desejos, pedidos, atividades, disciplinas, cursos, lanc, cats] = await Promise.all([db.pLeituras.toArray(), db.pMetas.toArray(),
        db.itens.toArray(), db.lista.toArray(), db.oDesejos.toArray(), db.oPedidos.toArray(), db.atividades.toArray(),
        db.disciplinas.toArray(), db.cursos.toArray(), fin ? db.fLanc.toArray() : [], fin ? db.fCategorias.toArray() : []]);
      const lItens = await db.lItens.toArray();
      dados.value = { leit, metas, itens, lista, desejos, pedidos, atividades, disciplinas, cursos, lanc, cats, lItens };
    });
    // termos: palavras + ano (2026) + valor (>200, <50)
    const filtro = computed(() => {
      const f = { palavras: [], ano: null, min: null, max: null };
      for (const t of q.value.trim().split(/\s+/).filter(Boolean)) {
        let m;
        if ((m = t.match(/^(20\d\d)$/))) f.ano = m[1];
        else if ((m = t.match(/^>(\d+(?:[.,]\d+)?)$/))) f.min = +m[1].replace(',', '.');
        else if ((m = t.match(/^<(\d+(?:[.,]\d+)?)$/))) f.max = +m[1].replace(',', '.');
        else f.palavras.push(norm(t));
      }
      return f;
    });
    const resultados = computed(() => {
      const d = dados.value, f = filtro.value;
      if (!d || (!f.palavras.length && !f.ano && f.min == null && f.max == null)) return [];
      const casa = (txt) => f.palavras.every((p) => norm(txt).includes(p));
      const okData = (s) => !f.ano || (s || '').startsWith(f.ano);
      const okValor = (v) => (f.min == null || v > f.min) && (f.max == null || v < f.max);
      const semValor = f.min == null && f.max == null;
      const grupos = [];
      const add = (nome, itens) => { if (itens.length) grupos.push({ nome, itens: itens.slice(0, 30), mais: Math.max(0, itens.length - 30) }); };
      const catPor = Object.fromEntries(d.cats.map((c) => [c.id, c]));
      add('Estoque', semValor && !f.ano ? d.itens.filter((i) => !i.excluido && casa(i.nome)).map((i) => ({ k: 'i' + i.id, t: i.nome, s: i.unidade, ir: () => ir('compras', { estoqueAba: 'itens' }) })) : []);
      add('Lista de compras', semValor && !f.ano ? d.lista.filter((l) => !l.excluido && l.status === 'pendente' && casa(l.nome)).map((l) => ({ k: 'l' + l.id, t: l.nome, s: 'pendente', ir: () => ir('compras', { estoqueAba: 'compras' }) })) : []);
      add('Desejos online', d.desejos.filter((x) => !x.excluido && !x.compradoEm && casa(x.nome) && okData(x.criadoEm) && semValor).map((x) => ({ k: 'd' + x.id, t: x.nome, s: 'alvo ' + fmtR(x.alvo), ir: () => ir('compras', { estoqueAba: 'online', onlineSeg: 'desejos', onlineAbrir: JSON.stringify({ tipo: 'desejo', id: x.id }) }) })));
      add('Pedidos online', d.pedidos.filter((x) => !x.excluido && casa(x.nome) && okData(x.compra) && okValor(x.valor)).sort((a, b) => (b.compra || '').localeCompare(a.compra || '')).map((x) => ({ k: 'p' + x.id, t: x.nome, s: fd(x.compra) + ' · ' + fmtR(x.valor), ir: () => ir('compras', { estoqueAba: 'online', onlineSeg: 'pedidos', onlineAbrir: JSON.stringify({ tipo: 'pedido', id: x.id }) }) })));
      add('Rotina', semValor && !f.ano ? d.atividades.filter((a) => !a.excluido && casa(a.nome)).map((a) => ({ k: 'a' + a.id, t: a.nome, s: a.desativadoEm ? 'desativada' : 'atividade', ir: () => ir('rotina', { rotinaAba: 'atividades' }) })) : []);
      add('Desenvolvimento', semValor && !f.ano ? [...d.cursos.filter((c) => casa(c.nome)).map((c) => ({ k: 'c' + c.id, t: c.nome, s: 'curso' })), ...d.disciplinas.filter((x) => casa(x.nome)).map((x) => ({ k: 'x' + x.id, t: x.nome, s: 'disciplina ' + (x.ordem || '') }))].map((r) => ({ ...r, ir: () => ir('estudos', { estudosAba: 'pos' }) })) : []);
      add('Desenvolvimento › Hobbies', semValor ? d.leit.filter((l) => !l.excluido && casa(l.titulo + ' ' + (l.detalhe || '')) && okData(l.fim || l.criadoEm)).map((l) => ({ k: 'r' + l.id, t: l.titulo, s: (l.detalhe ? l.detalhe + ' · ' : '') + ({ quero: 'quero', andamento: 'em andamento', concluido: 'concluído', abandonado: 'abandonado' })[l.status], ir: () => ir('estudos', { estudosAba: 'leit', leitStatus: l.status, leitTipo: '' }) })) : []);
      add('Alemão', semValor && !f.ano ? d.lItens.filter((i) => !i.excluido && casa([i.termo, i.traducao, i.plural, i.errado, i.certo].join(' '))).map((i) => ({ k: 'de' + i.id, t: (i.artigo ? i.artigo + ' ' : '') + (i.termo || i.certo), s: i.traducao || i.errado || '', ir: () => ir('estudos', { estudosAba: 'duo', duoAba: 'alemao', alemaoSub: 'palavras' }) })) : []);
      add('Metas', semValor ? d.metas.filter((m) => !m.excluido && casa(m.nome) && okData(m.inicio)).map((m) => ({ k: 'm' + m.id, t: m.nome, s: m.inicio.slice(0, 4), ir: () => ir('estudos', { estudosAba: 'metas' }) })) : []);
      if (fin) {
        const ls = d.lanc.filter((l) => !l.excluido && okData(l.data) && okValor(l.valorBRL ?? l.valor) && casa((l.descricao || '') + ' ' + (catPor[l.categoriaId]?.nome || '') + ' ' + (catPor[catPor[l.categoriaId]?.paiId]?.nome || '')))
          .sort((a, b) => b.data.localeCompare(a.data));
        const soma = ls.filter((l) => l.tipo === 'desp').reduce((s, l) => s + (l.valorBRL ?? l.valor), 0);
        add('Finanças' + (ls.length ? ` · ${ls.length} lançamentos${soma ? ', despesas ' + fmtR(soma) : ''}` : ''), ls.map((l) => ({ k: 'f' + l.id, t: l.descricao || catPor[l.categoriaId]?.nome || 'Lançamento', s: fd(l.data) + ' · ' + (l.tipo === 'desp' ? '− ' : l.tipo === 'rec' ? '+ ' : '⇄ ') + fmtR(l.valorBRL ?? l.valor), ir: () => ir('financas', { finAba: 'lanc' }) })));
      }
      return grupos;
    });
    function ir(modulo, sessao) { for (const [k, v] of Object.entries(sessao)) sessionStorage.setItem(k, v); emit('ir', modulo); emit('fechar'); }
    async function anotarAlemao() { await capturaRapida({ termo: q.value.trim(), traducao: '' }); avisar('Anotado no alemão. Complete depois em Alemão › Palavras.'); }
    return { q, campo, resultados, fin, anotarAlemao, carregando: computed(() => !dados.value) };
  },
  template: `
  <div class="busca-fundo" @click.self="$emit('fechar')">
    <div class="busca" role="dialog" aria-modal="true" aria-label="Busca geral">
      <div class="busca-topo"><input ref="campo" v-model="q" type="search" placeholder="Buscar em tudo… (ex.: ração 2026, mercado >200)" aria-label="Buscar"><button class="btn" @click="$emit('fechar')">Fechar</button></div>
      <p v-if="!fin" class="dica">Finanças fica fora da busca: abra Finanças e digite o PIN para incluir (vale 5 min).</p>
      <p v-if="q.trim() && !resultados.length && !carregando" class="vazio">Nada encontrado.</p>
      <button v-if="q.trim() && !carregando && !/[<>]/.test(q)" class="btn largo" @click="anotarAlemao">⚡ Anotar “{{ q.trim() }}” no alemão</button>
      <p v-if="!q.trim()" class="dica">Dicas: um ano (2026) filtra por data; &gt;200 ou &lt;50 filtra por valor (Finanças e pedidos).</p>
      <div v-for="g in resultados" :key="g.nome" class="pilha busca-grupo">
        <h2 class="rotulo">{{ g.nome }}</h2>
        <button v-for="r in g.itens" :key="r.k" class="linha busca-item" @click="r.ir()"><strong>{{ r.t }}</strong><span class="suave">{{ r.s }}</span></button>
        <p v-if="g.mais" class="dica">+ {{ g.mais }} resultados — refine a busca.</p>
      </div>
    </div>
  </div>`
};
