// Saúde › Sono: deitei/levantei, qualidade, despertares, cochilos (à parte) e indicadores.
import { reactive, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as S from '../servicos/sono-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';

export default {
  components: { Modal },
  setup() {
    const noites = vivo(() => db.sSono.toArray(), []), cochilos = vivo(() => db.sCochilos.toArray(), []);
    const meta = vivo(() => S.lerMeta(), S.META_PADRAO);
    const A = computed(() => S.analisar(noites.value, cochilos.value, meta.value));
    const ed = reactive({ aberto: false, v: {} });
    async function dormir() { await S.dormirAgora(); avisar('Boa noite! Ao acordar, toque em “Acordei”.'); }
    function acordei() { const n = A.value.aberta; Object.assign(ed, { aberto: true, v: { id: n.id, deitou: n.deitou, levantou: S.agoraLocal(), qualidade: 0, despertares: '0', obs: '' } }); }
    function nova() { const h = hojeStr(); Object.assign(ed, { aberto: true, v: { deitou: `${new Date(Date.now() - 864e5).toLocaleDateString('sv-SE')}T23:00`, levantou: `${h}T07:00`, qualidade: 0, despertares: '0', obs: '' } }); }
    function editar(n) { Object.assign(ed, { aberto: true, v: { id: n.id, deitou: n.deitou, levantou: n.levantou || '', qualidade: n.qualidade || 0, despertares: String(n.despertares ?? ''), obs: n.obs || '' } }); }
    const durEd = computed(() => ed.v.deitou && ed.v.levantou ? S.minutosEntre(ed.v.deitou, ed.v.levantou) : null);
    async function salvar() {
      const v = ed.v;
      if (!v.deitou || !v.levantou) return avisar('Informe quando deitou e quando levantou');
      const d = S.minutosEntre(v.deitou, v.levantou);
      if (!(d > 0) || d > 20 * 60) return avisar('Horários inválidos (o sono deve ter entre 1 min e 20 h)');
      await S.salvarNoite({ ...v, despertares: v.despertares === '' ? null : Math.max(0, parseInt(v.despertares, 10) || 0) });
      ed.aberto = false; avisar(`Noite salva: ${S.fmtDur(d)}`);
    }
    async function excluir() { if (!confirm('Excluir este registro de sono?')) return; await S.excluirNoite(ed.v.id); ed.aberto = false; }
    const cc = reactive({ aberto: false, v: {} });
    const novoCochilo = () => Object.assign(cc, { aberto: true, v: { data: hojeStr(), inicio: '13:30', fim: '14:00' } });
    const editarCochilo = (c) => Object.assign(cc, { aberto: true, v: { ...c } });
    async function salvarCochilo() { if (!cc.v.inicio || !cc.v.fim || cc.v.fim <= cc.v.inicio) return avisar('Horários inválidos'); await S.salvarCochilo(cc.v); cc.aberto = false; avisar('Cochilo salvo'); }
    async function excluirCochilo() { await S.excluirCochilo(cc.v.id); cc.aberto = false; }
    const listaCochilos = computed(() => cochilos.value.filter((c) => !c.excluido).sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio)).slice(0, 10));
    const me = reactive({ aberto: false, h: '' });
    const abrirMeta = () => Object.assign(me, { aberto: true, h: `${Math.floor(meta.value / 60)}:${String(meta.value % 60).padStart(2, '0')}` });
    async function salvarMeta() { const [h, m] = me.h.split(':').map(Number); const t = h * 60 + (m || 0); if (!(t >= 240 && t <= 720)) return avisar('Meta entre 4h e 12h'); await S.salvarMeta(t); me.aberto = false; }
    const maxG = computed(() => Math.max(meta.value + 60, ...A.value.grafico.map((g) => g.dur)));
    const fdh = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const hm = (iso) => iso ? iso.slice(11, 16) : '';
    const regTxt = (r) => r == null ? '—' : r <= 30 ? `regular (±${Math.round(r)} min)` : r <= 60 ? `razoável (±${Math.round(r)} min)` : `irregular (±${Math.round(r)} min)`;
    return { A, meta, dormir, acordei, nova, editar, ed, durEd, salvar, excluir, cc, novoCochilo, editarCochilo, salvarCochilo, excluirCochilo, listaCochilos, me, abrirMeta, salvarMeta, maxG, fdh, hm, regTxt, fmtDur: S.fmtDur };
  },
  template: `
  <div class="pilha sono">
    <div class="sono-acao">
      <template v-if="A.aberta"><span>Dormindo desde <b>{{ fdh(A.aberta.deitou) }}</b></span><button class="btn primario largo" @click="acordei">☀ Acordei</button></template>
      <template v-else><button class="btn primario largo" @click="dormir">🌙 Vou dormir agora</button></template>
      <div class="grade-2"><button class="btn" @click="nova">+ Registrar noite</button><button class="btn" @click="novoCochilo">+ Cochilo</button></div>
    </div>
    <div v-if="A.ultima" class="caixa pilha">
      <div class="entre"><span class="rotulo sem-margem">Última noite</span><button class="btn mini" @click="editar(A.ultima)">Editar</button></div>
      <div class="entre"><b class="num sono-grande">{{ fmtDur(A.ultima.dur) }}</b><span class="suave">{{ hm(A.ultima.deitou) }} → {{ hm(A.ultima.levantou) }}</span></div>
      <span class="suave">{{ A.ultima.qualidade ? 'Qualidade ' + '★'.repeat(A.ultima.qualidade) : 'sem nota' }}{{ A.ultima.despertares != null ? ' · acordou ' + A.ultima.despertares + 'x' : '' }} · meta {{ fmtDur(meta) }} <button class="btn-link" @click="abrirMeta">alterar</button></span>
    </div>
    <div class="bx-resumo">
      <div class="mini-cartao"><small>Média 7 noites</small><b class="num">{{ fmtDur(A.media7) }}</b><small class="suave">{{ A.n7 }} registros</small></div>
      <div class="mini-cartao"><small>Média 30 noites</small><b class="num">{{ fmtDur(A.media30) }}</b><small class="suave">{{ A.noMeta != null ? A.noMeta + '% na meta' : '' }}</small></div>
      <div class="mini-cartao"><small>Débito da semana</small><b class="num" :class="A.deficit7 > 0 ? 'neg' : 'pos'">{{ A.n7 ? (A.deficit7 > 0 ? '−' : '+') + fmtDur(Math.abs(A.deficit7)) : '—' }}</b><small class="suave">vs meta</small></div>
      <div class="mini-cartao"><small>Qualidade média</small><b class="num">{{ A.qualidade ? A.qualidade.toFixed(1) + ' ★' : '—' }}</b><small class="suave">{{ A.despertares != null ? 'acorda ' + A.despertares.toFixed(1) + 'x/noite' : '' }}</small></div>
      <div class="mini-cartao"><small>Deita / levanta (média)</small><b class="num">{{ A.deitarMedio || '—' }} · {{ A.acordarMedio || '—' }}</b><small class="suave">horário {{ regTxt(A.regularidade) }}</small></div>
      <div class="mini-cartao"><small>Cochilos (7 dias)</small><b class="num">{{ A.cochilos.n }}</b><small class="suave">{{ A.cochilos.n ? 'total ' + fmtDur(A.cochilos.total) : 'fora das horas de sono' }}</small></div>
    </div>
    <h3 class="rotulo">Últimas 14 noites</h3>
    <div class="sono-graf" aria-hidden="true">
      <i class="sono-meta" :style="{ bottom: (meta / maxG * 100) + '%' }"></i>
      <div v-for="g in A.grafico" :key="g.d" class="sono-col"><span class="sono-bar" :class="'q' + (g.q || 0)" :style="{ height: (g.dur / maxG * 100) + '%' }"></span><small>{{ g.d.slice(8) }}</small></div>
    </div>
    <p class="dica">Linha tracejada = meta. Cor da barra = qualidade (mais clara = melhor).</p>
    <div v-if="A.insights.length" class="pilha"><h3 class="rotulo">Observações</h3><p v-for="t in A.insights" :key="t" class="dica sono-ins">• {{ t }}</p></div>
    <p v-if="A.melhor && A.pior && A.n30 >= 5" class="dica">Melhor noite (30 dias): {{ fdh(A.melhor.levantou) }} · {{ fmtDur(A.melhor.dur) }} · pior: {{ fdh(A.pior.levantou) }} · {{ fmtDur(A.pior.dur) }}</p>
    <h3 class="rotulo">Registros</h3>
    <button v-for="n in A.fechadas.slice(0, 14)" :key="n.id" class="linha bx-item" @click="editar(n)"><div class="linha-info"><strong>{{ fdh(n.deitou) }} → {{ hm(n.levantou) }}</strong><span class="suave">{{ n.qualidade ? '★'.repeat(n.qualidade) : 'sem nota' }}{{ n.despertares != null ? ' · ' + n.despertares + ' despertar(es)' : '' }}</span></div><b class="num">{{ fmtDur(n.dur) }}</b></button>
    <p v-if="!A.fechadas.length" class="vazio">Nenhuma noite registrada. Use “Vou dormir agora” ou “+ Registrar noite”.</p>
    <template v-if="listaCochilos.length"><h3 class="rotulo">Cochilos</h3>
      <button v-for="c in listaCochilos" :key="c.id" class="linha bx-item" @click="editarCochilo(c)"><div class="linha-info"><strong>{{ c.data.split('-').reverse().join('/') }}</strong><span class="suave">{{ c.inicio }} → {{ c.fim }}</span></div></button></template>

    <Modal v-if="ed.aberto" :titulo="ed.v.id && ed.v.levantou ? 'Noite de sono' : 'Registrar noite'" @fechar="ed.aberto=false">
      <div class="grade-2">
        <label class="campo">Deitei <input type="datetime-local" v-model="ed.v.deitou"></label>
        <label class="campo">Levantei <input type="datetime-local" v-model="ed.v.levantou"></label>
      </div>
      <p class="dica">Duração: <b>{{ fmtDur(durEd) }}</b></p>
      <div class="campo"><span>Qualidade ao acordar</span><div class="estrelas-ed"><button v-for="n in 5" :key="n" :class="{ on: n <= ed.v.qualidade }" :aria-label="n + ' estrelas'" @click="ed.v.qualidade = ed.v.qualidade===n ? 0 : n">★</button></div></div>
      <label class="campo">Acordei durante a noite (vezes) <input v-model="ed.v.despertares" inputmode="numeric"></label>
      <label class="campo">Observação (opcional) <input v-model="ed.v.obs" placeholder="ex.: café tarde, treino, estresse"></label>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
    <Modal v-if="cc.aberto" titulo="Cochilo" @fechar="cc.aberto=false">
      <label class="campo">Dia <input type="date" v-model="cc.v.data"></label>
      <div class="grade-2"><label class="campo">Início <input type="time" v-model="cc.v.inicio"></label><label class="campo">Fim <input type="time" v-model="cc.v.fim"></label></div>
      <p class="dica">Cochilos ficam à parte: não entram nas horas de sono.</p>
      <div class="acoes"><button v-if="cc.v.id" class="btn perigo" @click="excluirCochilo">Excluir</button><span class="espaco"></span><button class="btn" @click="cc.aberto=false">Cancelar</button><button class="btn primario" @click="salvarCochilo">Salvar</button></div>
    </Modal>
    <Modal v-if="me.aberto" titulo="Meta de sono" @fechar="me.aberto=false">
      <label class="campo">Horas por noite <input type="time" v-model="me.h"></label>
      <div class="acoes"><button class="btn" @click="me.aberto=false">Cancelar</button><button class="btn primario" @click="salvarMeta">Salvar</button></div>
    </Modal>
  </div>`
};
