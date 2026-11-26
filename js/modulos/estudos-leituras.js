// Estudos › Leituras: lista pessoal (livros, filmes, séries, cursos, lugares, outros) com status, progresso e nota.
import { reactive, ref, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as P from '../servicos/pessoal-servico.js';

export default {
  components: { Modal },
  setup() {
    const itens = vivo(() => db.pLeituras.toArray(), []);
    const tipo = ref(sessionStorage.getItem('leitTipo') || ''), status = ref(sessionStorage.getItem('leitStatus') || 'andamento');
    const irTipo = (k) => { tipo.value = k; sessionStorage.setItem('leitTipo', k); };
    const irStatus = (k) => { status.value = k; sessionStorage.setItem('leitStatus', k); };
    const vivos = computed(() => itens.value.filter((l) => !l.excluido));
    const contagem = computed(() => Object.fromEntries(Object.keys(P.STATUS_LEIT).map((s) => [s, vivos.value.filter((l) => l.status === s && (!tipo.value || l.tipo === tipo.value)).length])));
    const lista = computed(() => vivos.value.filter((l) => l.status === status.value && (!tipo.value || l.tipo === tipo.value))
      .sort((a, b) => status.value === 'concluido' ? (b.fim || '').localeCompare(a.fim || '') : (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')));
    const ed = reactive({ aberto: false, v: {} });
    function novo() { Object.assign(ed, { aberto: true, v: { titulo: '', tipo: tipo.value || 'livro', status: status.value === 'concluido' ? 'concluido' : status.value, detalhe: '', link: '', paginas: '', paginaAtual: '', nota: 0, comentario: '' } }); }
    function editar(l) { Object.assign(ed, { aberto: true, v: { id: l.id, titulo: l.titulo, tipo: l.tipo, status: l.status, detalhe: l.detalhe || '', link: l.link || '', paginas: l.paginas ? String(l.paginas) : '', paginaAtual: l.paginaAtual ? String(l.paginaAtual) : '', nota: l.nota || 0, comentario: l.comentario || '' } }); }
    async function salvar() {
      const v = ed.v;
      if (!v.titulo.trim()) return avisar('Informe o título');
      const paginas = v.paginas ? parseInt(v.paginas, 10) : null, paginaAtual = v.paginaAtual ? parseInt(v.paginaAtual, 10) : 0;
      if (v.tipo === 'livro' && paginas && paginaAtual > paginas) return avisar('Página atual maior que o total');
      await P.salvarLeitura({ ...v, paginas, paginaAtual }); ed.aberto = false; avisar('Salvo');
    }
    async function excluir() { if (!confirm(`Excluir "${ed.v.titulo}"?`)) return; await P.excluirLeitura(ed.v.id); ed.aberto = false; avisar('Excluído'); }
    const pg = reactive({ aberto: false, l: null, valor: '' });
    const abrirPag = (l) => Object.assign(pg, { aberto: true, l, valor: String(l.paginaAtual || 0) });
    async function salvarPag() {
      const n = parseInt(pg.valor, 10);
      if (!(n >= 0)) return avisar('Página inválida');
      const fim = await P.avancarPaginas(pg.l, n - (pg.l.paginaAtual || 0)); pg.aberto = false;
      if (fim) { avisar('Última página! Marque como concluído e dê sua nota.'); editar({ ...pg.l, paginaAtual: n, status: 'concluido' }); ed.v.status = 'concluido'; }
    }
    const fd = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
    const abrirLink = (u) => window.open(u, '_blank', 'noopener');
    return { tipo, status, irTipo, irStatus, contagem, lista, ed, novo, editar, salvar, excluir, pg, abrirPag, salvarPag, fd, abrirLink, TIPOS: P.TIPOS_LEIT, STATUS: P.STATUS_LEIT };
  },
  template: `
  <div class="pilha">
    <div class="chips on-filtros"><button class="chip" :class="{ ativo: !tipo }" @click="irTipo('')">Todos</button><button v-for="(n,k) in TIPOS" :key="k" class="chip" :class="{ ativo: tipo===k }" @click="irTipo(k)">{{ n }}</button></div>
    <div class="seg-visao leit-status"><button v-for="(n,k) in STATUS" :key="k" :class="{ ativo: status===k }" @click="irStatus(k)">{{ n }} <small>{{ contagem[k] }}</small></button></div>
    <p v-if="!lista.length" class="vazio">Nada aqui. Toque em “+ Adicionar”.</p>
    <div v-for="l in lista" :key="l.id" class="caixa pilha leit">
      <div class="entre"><button class="linha-info" @click="editar(l)"><strong>{{ l.titulo }}</strong><span class="suave">{{ TIPOS[l.tipo] }}{{ l.detalhe ? ' · ' + l.detalhe : '' }}</span></button>
        <span v-if="l.nota" class="estrelas" :aria-label="l.nota + ' de 5'">{{ '★'.repeat(l.nota) }}<i>{{ '★'.repeat(5 - l.nota) }}</i></span></div>
      <template v-if="l.tipo==='livro' && l.paginas && l.status!=='concluido'">
        <span class="barra"><i :style="{ width: Math.round((l.paginaAtual||0) / l.paginas * 100) + '%' }"></i></span>
        <div class="entre"><span class="dica">pág. {{ l.paginaAtual || 0 }} de {{ l.paginas }} · {{ Math.round((l.paginaAtual||0) / l.paginas * 100) }}%</span><button class="btn mini" @click="abrirPag(l)">Atualizar página</button></div>
      </template>
      <p v-if="l.comentario" class="leit-coment">“{{ l.comentario }}”</p>
      <span v-if="l.status==='concluido' && l.fim" class="dica">Concluído em {{ fd(l.fim) }}{{ l.inicio ? ' · começou ' + fd(l.inicio) : '' }}</span>
      <button v-if="l.link" class="btn mini esq" @click="abrirLink(l.link)">Abrir link</button>
    </div>
    <button class="btn-tracejado" @click="novo">+ Adicionar</button>

    <Modal v-if="ed.aberto" :titulo="ed.v.id ? 'Editar' : 'Adicionar'" @fechar="ed.aberto=false">
      <label class="campo">Título <input v-model="ed.v.titulo"></label>
      <div class="grade-2">
        <label class="campo">Tipo <select v-model="ed.v.tipo"><option v-for="(n,k) in TIPOS" :key="k" :value="k">{{ n }}</option></select></label>
        <label class="campo">Status <select v-model="ed.v.status"><option v-for="(n,k) in STATUS" :key="k" :value="k">{{ n }}</option></select></label>
      </div>
      <label class="campo">{{ ed.v.tipo==='livro' ? 'Autor' : ed.v.tipo==='lugar' ? 'Cidade / país' : 'Detalhe (opcional)' }} <input v-model="ed.v.detalhe"></label>
      <div v-if="ed.v.tipo==='livro'" class="grade-2">
        <label class="campo">Total de páginas <input v-model="ed.v.paginas" inputmode="numeric"></label>
        <label v-if="ed.v.status!=='concluido'" class="campo">Página atual <input v-model="ed.v.paginaAtual" inputmode="numeric"></label>
      </div>
      <div v-if="ed.v.status==='concluido'" class="campo"><span>Nota</span><div class="estrelas-ed"><button v-for="n in 5" :key="n" :class="{ on: n <= ed.v.nota }" :aria-label="n + ' estrelas'" @click="ed.v.nota = ed.v.nota===n ? 0 : n">★</button></div></div>
      <label v-if="ed.v.status==='concluido'" class="campo">Por que essa nota? (opcional) <textarea v-model="ed.v.comentario" maxlength="280" rows="3" placeholder="Uma frase curta sobre o que achou"></textarea><small class="suave">{{ (ed.v.comentario || '').length }}/280</small></label>
      <label class="campo">Link (opcional) <input v-model="ed.v.link" inputmode="url"></label>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
    <Modal v-if="pg.aberto" :titulo="pg.l.titulo" @fechar="pg.aberto=false">
      <label class="campo">Estou na página (de {{ pg.l.paginas }}) <input v-model="pg.valor" inputmode="numeric" autofocus @keyup.enter="salvarPag"></label>
      <div class="acoes"><button class="btn" @click="pg.aberto=false">Cancelar</button><button class="btn primario" @click="salvarPag">Salvar</button></div>
    </Modal>
  </div>`
};
