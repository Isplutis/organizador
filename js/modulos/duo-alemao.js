// Duolingo › Alemão: Unidades | Palavras | Treinar | Gramática | Diário | Progresso
import { ref, reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as I from '../servicos/idiomas-servico.js';
import { GRAMATICA_DE } from '../dados/gramatica-de.js';
import { Teclas, Falar, Artigo, EditorItem, CapturaRapida } from './duo-comum.js';
import Treino from './duo-treino.js';

const SUBS = [['unidades', '📚 Unidades'], ['palavras', '🔤 Palavras'], ['treinar', '🎯 Treinar'], ['gramatica', '📐 Gramática'], ['diario', '📔 Diário'], ['progresso', '📈 Progresso']];

export default {
  components: { Modal, Teclas, Falar, Artigo, EditorItem, CapturaRapida, Treino },
  setup() {
    const idi = inject('idi');
    const sub = idi.subAlemao;
    const irSub = (k) => { sub.value = k; sessionStorage.setItem('alemaoSub', k); };
    // editores
    const ed = reactive({ item: null }); const cap = ref(false);
    const novo = (tipo = 'palavra', extra = {}) => { ed.item = { tipo, ...extra }; };
    // ---------- unidades ----------
    const uEd = reactive({ aberto: false, v: {} });
    const novaUnidade = () => { const u = idi.unidadeAtual.value; Object.assign(uEd, { aberto: true, v: { secao: u?.secao || 1, numero: u ? u.numero + 1 : 1, titulo: '', notas: '' } }); };
    const editarUnidade = (u) => Object.assign(uEd, { aberto: true, v: { ...u } });
    async function salvarUnidade() {
      if (!(+uEd.v.numero >= 0)) return avisar('Número da unidade inválido');
      if (idi.unidades.value.some((u) => !u.excluido && u.id !== uEd.v.id && +u.secao === +uEd.v.secao && +u.numero === +uEd.v.numero)) return avisar('Essa unidade já existe');
      await I.salvarUnidade(uEd.v); uEd.aberto = false;
    }
    async function excluirUnidade() { if (!confirm('Excluir a unidade? As palavras dela ficam “sem unidade”.')) return; await I.excluirUnidade(uEd.v.id); uEd.aberto = false; uAberta.value = ''; }
    const uAberta = ref('');
    async function concluirU(u) { const f = u.status !== 'concluida'; await I.concluirUnidade(u, f); if (f) avisar('Unidade concluída! 🏁'); }
    const estatU = computed(() => Object.fromEntries(idi.est.value.porUnidade.map((p) => [p.u.id, p])));
    const itensDaU = (id) => idi.itens.value.filter((i) => !i.excluido && (id === '__sem' ? !i.unidadeId : i.unidadeId === id));
    const semUnidade = computed(() => itensDaU('__sem').length);
    // ---------- palavras ----------
    const f = reactive({ texto: '', tipo: 'todos' });
    const lista = computed(() => {
      const t = I.norm(f.texto);
      return idi.itens.value.filter((i) => !i.excluido)
        .filter((i) => f.tipo === 'todos' || (f.tipo === 'completar' ? !i.completo || (i.tipo !== 'erro' && !i.traducao) : f.tipo === 'dominados' ? I.dominado(i) : i.tipo === f.tipo))
        .filter((i) => !t || [i.termo, i.traducao, i.plural, i.errado, i.certo, i.notas].some((x) => I.norm(x).includes(t)))
        .sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    });
    const contaTipo = computed(() => { const v = idi.itens.value.filter((i) => !i.excluido); return { todos: v.length, palavra: v.filter((i) => i.tipo === 'palavra').length, frase: v.filter((i) => i.tipo === 'frase').length, erro: v.filter((i) => i.tipo === 'erro').length, completar: v.filter((i) => !i.completo || (i.tipo !== 'erro' && !i.traducao)).length, dominados: v.filter(I.dominado).length }; });
    const bolinhas = (it) => Math.round(I.nivel(it));
    const temXadrez = computed(() => idi.unidades.value.some((u) => !u.excluido && u.titulo === 'Extra: xadrez em alemão'));
    async function baralhoXadrez() { await I.criarBaralhoXadrez(); avisar('Baralho de xadrez em alemão criado (unidade Extra)'); }
    // ---------- gramática ----------
    const gAberta = ref('');
    const nota = reactive({});
    const liberadas = computed(() => new Set(idi.gram.value.liberadas || []));
    async function liberar(id) { await I.salvarGram({ liberadas: [...liberadas.value, id] }); gAberta.value = id; }
    async function esconder(id) { await I.salvarGram({ liberadas: [...liberadas.value].filter((x) => x !== id) }); gAberta.value = ''; }
    function abrirG(id) { gAberta.value = gAberta.value === id ? '' : id; if (nota[id] == null) nota[id] = idi.gram.value.notas?.[id] || ''; }
    async function salvarNota(id) { await I.salvarGram({ notas: { ...(idi.gram.value.notas || {}), [id]: nota[id] } }); avisar('Anotação salva'); }
    const livre = reactive({ aberto: false, v: {} });
    const novaLivre = () => Object.assign(livre, { aberto: true, v: { id: 'l' + Date.now().toString(36), titulo: '', texto: '' } });
    const editarLivre = (l) => Object.assign(livre, { aberto: true, v: { ...l } });
    async function salvarLivre() { if (!livre.v.titulo.trim()) return avisar('Dê um título'); const ls = (idi.gram.value.livres || []).filter((x) => x.id !== livre.v.id); await I.salvarGram({ livres: [...ls, { ...livre.v, titulo: livre.v.titulo.trim() }] }); livre.aberto = false; }
    async function excluirLivre() { await I.salvarGram({ livres: (idi.gram.value.livres || []).filter((x) => x.id !== livre.v.id) }); livre.aberto = false; }
    // ---------- diário ----------
    const di = reactive({ id: null, texto: '', traducao: '', data: idi.hoje.value });
    const diarioHoje = computed(() => idi.diario.value.find((e) => !e.excluido && e.data === di.data));
    function carregarDia() { const e = diarioHoje.value; Object.assign(di, { id: e?.id || null, texto: e?.texto || '', traducao: e?.traducao || '' }); }
    carregarDia();
    async function salvarDiario() { if (!di.texto.trim()) return avisar('Escreva pelo menos uma frase'); di.id = await I.salvarDiario({ ...di }); avisar('Diário salvo'); }
    const previaDia = computed(() => I.marcarTexto(di.texto, idi.itens.value));
    const diarioLista = computed(() => idi.diario.value.filter((e) => !e.excluido && e.data !== di.data).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30).map((e) => ({ e, m: I.marcarTexto(e.texto, idi.itens.value) })));
    // ---------- progresso ----------
    const metas = reactive({ aberto: false, novas: 20, rev: 20 });
    const abrirMetas = () => Object.assign(metas, { aberto: true, novas: idi.cfg.value.metaNovas, rev: idi.cfg.value.metaRevisoes });
    async function salvarMetas() { await I.salvarCfg({ metaNovas: Math.max(1, +metas.novas || 1), metaRevisoes: Math.max(1, +metas.rev || 1) }); metas.aberto = false; }
    const fd = (d) => d.split('-').reverse().slice(0, 2).join('/');
    return { concluirU, idi, SUBS, sub, irSub, ed, cap, novo, uEd, novaUnidade, editarUnidade, salvarUnidade, excluirUnidade, uAberta, estatU, itensDaU, semUnidade, f, lista, contaTipo, bolinhas, temXadrez, baralhoXadrez,
      GRAMATICA_DE, gAberta, nota, liberadas, liberar, esconder, abrirG, salvarNota, livre, novaLivre, editarLivre, salvarLivre, excluirLivre,
      di, carregarDia, salvarDiario, previaDia, diarioLista, metas, abrirMetas, salvarMetas, fd, nomeU: I.nomeUnidade, dominado: I.dominado, modosDe: I.modosDe };
  },
  template: `
  <div class="pilha alemao">
    <div class="sub-abas"><button v-for="s in SUBS" :key="s[0]" class="chip" :class="{ ativo: sub===s[0] }" @click="irSub(s[0])">{{ s[1] }}</button></div>

    <!-- UNIDADES -->
    <template v-if="sub==='unidades'">
      <div class="entre"><span class="suave">Siga a ordem do Duolingo: crie a unidade quando chegar nela.</span><button class="btn mini primario" @click="novaUnidade">+ Unidade</button></div>
      <div v-for="p in idi.est.value.porUnidade" :key="p.u.id" class="caixa pilha uni" :class="{ concluida: p.u.status==='concluida' }">
        <button class="entre btn-sem" @click="uAberta = uAberta===p.u.id ? '' : p.u.id">
          <div class="pilha-p"><b>{{ p.u.status==='concluida' ? '✅' : '📖' }} Seção {{ p.u.secao }} · Unidade {{ p.u.numero }}</b><small class="suave">{{ p.u.titulo || 'sem título' }} · {{ p.n }} itens</small></div>
          <span class="num">{{ p.pct }}%</span></button>
        <div class="barra-prog"><i :style="{ width: p.pct + '%' }"></i></div>
        <template v-if="uAberta===p.u.id">
          <p v-if="p.u.notas" class="dica">{{ p.u.notas }}</p>
          <div class="chips"><button class="chip" @click="novo('palavra', { unidadeId: p.u.id })">+ Palavra</button><button class="chip" @click="novo('frase', { unidadeId: p.u.id })">+ Frase</button><button class="chip" @click="novo('erro', { unidadeId: p.u.id })">+ Erro</button></div>
          <button v-for="it in itensDaU(p.u.id)" :key="it.id" class="linha bx-item" @click="ed.item = it">
            <div class="linha-info"><strong><Artigo :a="it.artigo"></Artigo> {{ it.termo || it.errado }}</strong><span class="suave">{{ it.traducao || it.certo || '— a completar' }}</span></div><span class="nivel" :title="'nível ' + bolinhas(it)"><i v-for="n in 5" :key="n" :class="{ on: n <= bolinhas(it) }"></i></span></button>
          <div class="acoes"><button class="btn mini" @click="editarUnidade(p.u)">Editar</button><button class="btn mini" @click="idi.irTreino('revisao', p.u.id)">Treinar</button>
            <button class="btn mini" :class="p.u.status==='concluida' ? '' : 'primario'" @click="concluirU(p.u)">{{ p.u.status==='concluida' ? 'Reabrir' : 'Concluir unidade' }}</button></div>
        </template>
      </div>
      <button v-if="semUnidade" class="linha bx-item" @click="irSub('palavras')"><div class="linha-info"><strong>Sem unidade</strong><span class="suave">{{ semUnidade }} itens</span></div></button>
      <p v-if="!idi.est.value.porUnidade.length" class="vazio">Crie a unidade em que você está no Duolingo e vá adicionando as palavras.</p>
    </template>

    <!-- PALAVRAS -->
    <template v-if="sub==='palavras'">
      <div class="grade-2"><button class="btn primario" @click="novo()">+ Adicionar</button><button class="btn" @click="cap = true">⚡ Anotar rápido</button></div>
      <input v-model="f.texto" placeholder="🔎 Buscar em alemão ou português" lang="de">
      <div class="sub-abas"><button v-for="t in [['todos','Todos'],['palavra','Palavras'],['frase','Frases'],['erro','Erros'],['completar','A completar'],['dominados','Dominados']]" :key="t[0]" class="chip" :class="{ ativo: f.tipo===t[0] }" @click="f.tipo=t[0]">{{ t[1] }} <small>{{ contaTipo[t[0]] }}</small></button></div>
      <button v-for="it in lista" :key="it.id" class="linha bx-item" @click="ed.item = it">
        <div class="linha-info"><strong><Artigo :a="it.artigo"></Artigo> {{ it.tipo==='erro' ? it.certo : it.termo }}<small v-if="it.plural && it.plural!=='-'" class="suave"> · pl. {{ it.plural }}</small></strong>
          <span class="suave">{{ it.tipo==='erro' ? '✗ ' + it.errado : (it.traducao || '— falta tradução') }}{{ it.falsoAmigo ? ' · ⚠️ falso amigo' : '' }}{{ !it.completo && it.tipo==='palavra' ? ' · completar' : '' }}</span></div>
        <Falar :texto="it.tipo==='erro' ? it.certo : ((it.artigo ? it.artigo + ' ' : '') + it.termo)"></Falar><span class="nivel"><i v-for="n in 5" :key="n" :class="{ on: n <= bolinhas(it) }"></i></span></button>
      <p v-if="!lista.length" class="vazio">{{ f.texto || f.tipo!=='todos' ? 'Nada com esse filtro.' : 'Seu vocabulário começa aqui: adicione as palavras da unidade atual do Duolingo.' }}</p>
      <button v-if="!temXadrez" class="btn" @click="baralhoXadrez">♟️ Criar baralho “xadrez em alemão” (opcional)</button>
    </template>

    <!-- TREINAR -->
    <Treino v-if="sub==='treinar'" :key="idi.treinoChave.value" :inicial="idi.treinoInicial.value"></Treino>

    <!-- GRAMÁTICA -->
    <template v-if="sub==='gramatica'">
      <p class="dica">As tabelas ficam escondidas. Libere cada uma quando chegar no tema no Duolingo.</p>
      <div v-for="g in GRAMATICA_DE" :key="g.id" class="caixa pilha gram" :class="{ bloqueada: !liberadas.has(g.id) }">
        <div class="entre"><button class="btn-sem pilha-p" @click="liberadas.has(g.id) && abrirG(g.id)"><b>{{ liberadas.has(g.id) ? '📐' : '🔒' }} {{ g.titulo }}</b><small class="suave">nível {{ g.nivel }}{{ idi.gram.value.notas?.[g.id] ? ' · tem anotação' : '' }}</small></button>
          <button v-if="!liberadas.has(g.id)" class="btn mini" @click="liberar(g.id)">Liberar</button></div>
        <template v-if="gAberta===g.id">
          <p v-if="g.intro" class="dica">{{ g.intro }}</p>
          <div v-for="(t, ti) in g.tabelas" :key="ti" class="pilha-p"><b v-if="t.titulo" class="rotulo">{{ t.titulo }}</b>
            <div class="tab-rol"><table class="tab-gram"><thead><tr><th v-for="c in t.cab" :key="c">{{ c }}</th></tr></thead><tbody><tr v-for="(l, li) in t.linhas" :key="li"><td v-for="(c, ci) in l" :key="ci" :class="ci && ['der','die','das'].includes(c) ? 'art-' + c : ''">{{ c }}</td></tr></tbody></table></div></div>
          <p v-for="d in g.dicas" :key="d" class="dica">💡 {{ d }}</p>
          <label class="campo">Minha anotação <textarea v-model="nota[g.id]" rows="3" lang="de"></textarea></label>
          <div class="acoes"><button class="btn mini" @click="esconder(g.id)">Esconder de novo</button><button class="btn mini primario" @click="salvarNota(g.id)">Salvar anotação</button></div>
        </template>
      </div>
      <div class="entre"><h3 class="rotulo">Minhas anotações</h3><button class="btn mini" @click="novaLivre">+ Tema</button></div>
      <button v-for="l in idi.gram.value.livres || []" :key="l.id" class="linha bx-item" @click="editarLivre(l)"><div class="linha-info"><strong>✏️ {{ l.titulo }}</strong><span class="suave">{{ l.texto.slice(0, 80) }}</span></div></button>
    </template>

    <!-- DIÁRIO -->
    <template v-if="sub==='diario'">
      <div class="caixa pilha">
        <div class="entre"><b>📔 {{ di.data===idi.hoje.value ? 'Hoje' : fd(di.data) }}</b><input type="date" v-model="di.data" @change="carregarDia" class="mini-data"></div>
        <p class="dica">1 a 3 frases sobre o seu dia, em alemão. As palavras do seu vocabulário ficam destacadas.</p>
        <Teclas></Teclas>
        <textarea v-model="di.texto" rows="4" lang="de" placeholder="Heute habe ich…"></textarea>
        <input v-model="di.traducao" placeholder="Tradução (opcional)">
        <p v-if="di.texto" class="diario-txt"><template v-for="(p, i) in previaDia.partes" :key="i"><mark v-if="p.it" :data-tip="p.it.traducao">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></p>
        <div class="entre"><small class="suave">{{ previaDia.usados }} palavra(s) do seu vocabulário</small><button class="btn primario" @click="salvarDiario">Salvar</button></div>
      </div>
      <div v-for="x in diarioLista" :key="x.e.id" class="caixa pilha-p"><small class="suave">{{ fd(x.e.data) }} · {{ x.m.usados }} do vocabulário</small>
        <p class="diario-txt"><template v-for="(p, i) in x.m.partes" :key="i"><mark v-if="p.it" :data-tip="p.it.traducao">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></p>
        <small v-if="x.e.traducao" class="suave">{{ x.e.traducao }}</small></div>
    </template>

    <!-- PROGRESSO -->
    <template v-if="sub==='progresso'">
      <div class="bx-resumo">
        <div class="mini-cartao"><small>Palavras</small><b class="num">{{ idi.est.value.palavras }}</b><small class="suave">{{ idi.est.value.frases }} frases · {{ idi.est.value.erros }} erros</small></div>
        <div class="mini-cartao"><small>Dominados</small><b class="num">{{ idi.est.value.dominados }}</b><small class="suave">todas as cartas na caixa 5</small></div>
        <div class="mini-cartao"><small>Acerto (30 dias)</small><b class="num">{{ idi.est.value.taxa30 != null ? idi.est.value.taxa30 + '%' : '—' }}</b><small class="suave">{{ idi.est.value.rev30 }} respostas</small></div>
        <div class="mini-cartao"><small>Revisando seguido</small><b class="num">{{ idi.est.value.seq }} 🔥</b><small class="suave">recorde {{ idi.est.value.recorde }}</small></div>
      </div>
      <div class="caixa pilha">
        <div class="entre"><b>Metas</b><button class="btn-link" @click="abrirMetas">alterar</button></div>
        <div class="meta-l"><span>Novas na semana</span><div class="barra-prog"><i :style="{ width: Math.min(100, idi.est.value.novasSemana / idi.cfg.value.metaNovas * 100) + '%' }"></i></div><b class="num">{{ idi.est.value.novasSemana }}/{{ idi.cfg.value.metaNovas }}</b></div>
        <div class="meta-l"><span>Revisões hoje</span><div class="barra-prog"><i :style="{ width: Math.min(100, idi.est.value.revHoje / idi.cfg.value.metaRevisoes * 100) + '%' }"></i></div><b class="num">{{ idi.est.value.revHoje }}/{{ idi.cfg.value.metaRevisoes }}</b></div>
      </div>
      <h3 class="rotulo">Calendário (Duolingo + revisões)</h3>
      <div class="cal-estudo"><i v-for="c in idi.est.value.cal" :key="c.d" :class="['n' + c.n, { futuro: c.futuro, hoje: c.d===idi.hoje.value }]" :data-tip="fd(c.d) + (c.duo ? ' · Duolingo ✓' : '') + (c.rev ? ' · ' + c.rev + ' revisões' : '') + (!c.duo && !c.rev && !c.futuro ? ' · sem estudo' : '')"></i></div>
      <p class="dica">Mais escuro = mais estudo (Duolingo feito, revisou, bateu a meta de revisões).</p>
      <h3 class="rotulo">Por unidade</h3>
      <div v-for="p in idi.est.value.porUnidade" :key="p.u.id" class="meta-l"><span>S{{ p.u.secao }}·U{{ p.u.numero }}</span><div class="barra-prog"><i :style="{ width: p.pct + '%' }"></i></div><b class="num">{{ p.dom }}/{{ p.n }}</b></div>
      <template v-if="idi.est.value.erradas.length"><h3 class="rotulo">Mais difíceis para você</h3>
        <button v-for="x in idi.est.value.erradas" :key="x.it.id" class="linha bx-item" @click="ed.item = x.it"><div class="linha-info"><strong><Artigo :a="x.it.artigo"></Artigo> {{ x.it.termo || x.it.certo }}</strong><span class="suave">{{ x.it.traducao }}</span></div><b class="num neg">{{ x.er }}/{{ x.tot }}</b></button></template>
      <h3 class="rotulo">Conquistas</h3>
      <div class="conq-grade"><div v-for="c in idi.est.value.conquistas" :key="c.id" class="conq" :class="{ ok: c.ok }"><span>{{ c.emoji }}</span><small>{{ c.nome }}</small><small class="suave" v-if="!c.ok">{{ c.val }}/{{ c.alvo }}</small></div></div>
    </template>

    <EditorItem v-if="ed.item" :item="ed.item" @fechar="ed.item = null"></EditorItem>
    <CapturaRapida v-if="cap" @fechar="cap = false"></CapturaRapida>
    <Modal v-if="uEd.aberto" :titulo="uEd.v.id ? 'Editar unidade' : 'Nova unidade'" @fechar="uEd.aberto=false">
      <div class="grade-2"><label class="campo">Seção <input v-model="uEd.v.secao" inputmode="numeric"></label><label class="campo">Unidade <input v-model="uEd.v.numero" inputmode="numeric"></label></div>
      <label class="campo">Título (como no Duolingo) <input v-model="uEd.v.titulo" placeholder="ex.: Pedir comida"></label>
      <label class="campo">Anotações <input v-model="uEd.v.notas"></label>
      <div class="acoes"><button v-if="uEd.v.id" class="btn perigo" @click="excluirUnidade">Excluir</button><span class="espaco"></span><button class="btn" @click="uEd.aberto=false">Cancelar</button><button class="btn primario" @click="salvarUnidade">Salvar</button></div>
    </Modal>
    <Modal v-if="livre.aberto" titulo="Anotação de gramática" @fechar="livre.aberto=false">
      <label class="campo">Tema <input v-model="livre.v.titulo"></label><Teclas></Teclas>
      <label class="campo">Texto <textarea v-model="livre.v.texto" rows="6" lang="de"></textarea></label>
      <div class="acoes"><button class="btn perigo" @click="excluirLivre">Excluir</button><span class="espaco"></span><button class="btn primario" @click="salvarLivre">Salvar</button></div>
    </Modal>
    <Modal v-if="metas.aberto" titulo="Metas do alemão" @fechar="metas.aberto=false">
      <div class="grade-2"><label class="campo">Novas por semana <input v-model="metas.novas" inputmode="numeric"></label><label class="campo">Revisões por dia <input v-model="metas.rev" inputmode="numeric"></label></div>
      <div class="acoes"><button class="btn" @click="metas.aberto=false">Cancelar</button><button class="btn primario" @click="salvarMetas">Salvar</button></div>
    </Modal>
  </div>`
};
