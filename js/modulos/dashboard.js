// Início (Dashboard): cartões por módulo (detalhamento na etapa própria).
import { ref, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum } from '../db.js';
import { avisar } from '../ui.js';
import Agenda from './agenda.js';
import Revisao from './revisao.js';
import { mapaSaldos } from '../servicos/estoque-servico.js';
import { criarCalc, hojeStr, lerCfgAgua, beber, ritmoAgua } from '../servicos/rotina-servico.js';
import { diasDeEstudo, calcCurso, ofensiva, duoIdioma, hm } from '../servicos/estudos-servico.js';
import { fixasDeHoje, assinaturas } from '../servicos/fin-servico.js';
import { precisaBackup } from '../servicos/backup-servico.js';
import { montar as montarOnline, vistos as avisosVistos } from '../servicos/online-servico.js';

export default {
  components: { Agenda, Revisao },
  emits: ['ir'],
  setup() {
    const itens = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const saldos = vivo(() => mapaSaldos(), {});
    const nLista = vivo(() => db.lista.where('status').equals('pendente').filter((l) => !l.excluido).count(), 0);
    const nZerados = computed(() => itens.value.filter((i) => (saldos.value[i.id] || 0) <= 0).length);
    const atividades = vivo(() => db.atividades.toArray(), []);
    const marcacoes = vivo(() => db.marcacoes.toArray(), []);
    const agua = vivo(() => db.agua.toArray(), []);
    const cfg = vivo(() => lerCfgAgua(), null);
    const viagens = vivo(() => db.viagens.toArray(), []);
    const sessoes = vivo(() => db.sessoes.toArray(), []);
    const inicioCont = vivo(() => db.meta.get('inicioContagem'), null);
    const metasEstudo = vivo(async () => Object.fromEntries((await db.meta.filter((m) => m.chave.startsWith('estudoMeta-')).toArray()).map((m) => [m.chave, m.minutos])), {});
    const est = vivo(async () => ({ curso: await db.cursos.get('pos-puc'), disciplinas: await db.disciplinas.toArray(), unidades: await db.unidades.toArray(), secoes: await db.secoes.toArray(), aulas: await db.aulas.toArray() }), null);
    const duoBase = vivo(() => db.meta.get('duoBase'), null);
    const hoje = hojeStr();
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje, viagens: viagens.value, estudoDias: diasDeEstudo(sessoes.value, metasEstudo.value), inicio: inicioCont.value?.data || '' }));
    const pos = computed(() => est.value?.curso ? calcCurso({ ...est.value, sessoes: sessoes.value, hoje }) : null);
    const duoFeitos = computed(() => new Set(marcacoes.value.filter((m) => m.atividadeId === 'duolingo' && (m.valor === 'f' || m.valor === 'o')).map((m) => m.data)));
    const duo = computed(() => ({ ofensiva: ofensiva(duoBase.value, duoFeitos.value, hoje), idioma: duoIdioma(hoje), feito: duoFeitos.value.has(hoje) }));
    const rotina = computed(() => { const d = calc.value?.dia(hoje); if (d?.viagem) return { pct: '–', txt: 'dia de viagem' }; if (d?.antes) { const t = calc.value.ocorrencias(hoje), f = t.filter((o) => calc.value.feito(calc.value.status(o, hoje))).length; return { pct: t.length ? Math.round(f / t.length * 100) : '–', txt: 'teste · conta a partir de ' + calc.value.inicio.split('-').reverse().join('/') }; } return d && d.t ? { pct: Math.round(d.f / d.t * 100), txt: `${d.f} de ${d.t} feitas` } : { pct: '–', txt: 'sem atividades' }; });
    const litros = computed(() => calc.value?.litros(hoje) || 0);
    const meta = computed(() => calc.value?.cfgEm(hoje).meta || 3);
    const garrafa = computed(() => cfg.value?.recipientes?.[0]);
    const ritmo = computed(() => {
      if (!cfg.value || !calc.value) return null;
      const d = new Date(), regs = agua.value.filter((x) => x.data === hoje && !x.excluido).sort((a, b) => (b.hora || '').localeCompare(a.hora || ''));
      const r = ritmoAgua({ total: litros.value, meta: meta.value, acorda: cfg.value.acorda || '06:00', dorme: cfg.value.dorme || '22:00', agoraMin: d.getHours() * 60 + d.getMinutes(), ultimaHora: regs[0]?.hora ?? null, ml: garrafa.value?.ml || 500 });
      return r.estado === 'meta' ? (r.fim ? 'meta batida ✓' : 'meta batida ✓ · bônus ' + String(r.bonus).replace('.', ',') + ' L · próxima ' + r.proxima) : r.estado === 'acima' ? 'acima do ritmo · próxima ' + r.proxima : r.estado === 'abaixo' ? 'abaixo do ritmo · beba agora' : r.estado === 'ritmo' ? 'no ritmo · próxima ' + r.proxima : '';
    });
    async function addGarrafa() { if (!garrafa.value) return; await beber(garrafa.value.ml); avisar(`+${garrafa.value.ml} ml (${garrafa.value.nome})`); }
    const irRotina = (aba) => { sessionStorage.setItem('rotinaAba', aba); };
    const dataTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const irEstudos = (aba) => sessionStorage.setItem('estudosAba', aba);
    const irEstoque = (aba) => sessionStorage.setItem('estoqueAba', aba);
    const fixasFin = vivo(() => db.fFixas.toArray(), []), lancsFin = vivo(() => db.fLanc.toArray(), []);
    const contasHoje = computed(() => fixasDeHoje(fixasFin.value, lancsFin.value, hoje).length);
    const renovam = computed(() => assinaturas(fixasFin.value, lancsFin.value, 5.3, hoje).lista.filter((a) => a.aviso).length);
    const oDes = vivo(() => db.oDesejos.toArray(), []), oPre = vivo(() => db.oPrecos.toArray(), []), oPed = vivo(() => db.oPedidos.toArray(), []);
    const online = computed(() => { const m = montarOnline({ desejos: oDes.value, precos: oPre.value, pedidos: oPed.value, hoje }); const v = avisosVistos(); return { avisos: m.avisos.filter((a) => !v.has(a.chave)).length, caminho: m.nCaminho + m.nAtraso, alvo: m.nAlvo }; });
    const lembrarBackup = precisaBackup();
    const irBackup = () => { location.hash = 'mais'; };
    const revisao = ref(false);
    const irSaude = () => sessionStorage.setItem('saudeAba', 'agua');
    return { irSaude, revisao, calc, renovam, ritmo, lembrarBackup, irBackup, online, contasHoje, pos, duo, hm, irEstudos, irEstoque, nZerados, nLista, rotina, litros, meta, garrafa, addGarrafa, irRotina, dataTxt, fmtNum };
  },
  template: `
  <section class="pilha">
    <Revisao v-if="revisao" :calc="calc" @fechar="revisao=false"></Revisao>
    <template v-else>
    <p class="suave">{{ dataTxt }}</p>
    <div class="cartoes">
      <button class="cartao" @click="irRotina('semana'); $emit('ir','rotina')"><span class="suave">Rotina hoje</span><b>{{ rotina.pct }}{{ rotina.pct === '–' ? '' : '%' }}</b><span class="suave">{{ rotina.txt }}</span></button>
      <div class="cartao clicavel" role="button" tabindex="0" @click="irSaude(); $emit('ir','saude')" @keyup.enter="irSaude(); $emit('ir','saude')">
        <span class="suave">Água hoje ›</span><b>{{ fmtNum(litros) }} L</b><span v-if="ritmo" class="suave">{{ ritmo }}</span>
        <span class="barra"><i :style="{ width: Math.min(100, litros / meta * 100) + '%' }"></i></span>
        <button v-if="garrafa" class="btn primario" @click.stop="addGarrafa">+ {{ garrafa.nome }}</button>
      </div>
      <button class="cartao" @click="irEstoque('itens'); $emit('ir','compras')"><span class="suave">Estoque zerado</span><b class="alerta">{{ nZerados }}</b><span class="suave">itens</span></button>
      <button class="cartao" @click="$emit('ir','financas')"><span class="suave">Finanças 🔒</span><b>{{ contasHoje }}</b><span class="suave">{{ contasHoje === 1 ? 'conta vence hoje' : 'contas vencem hoje' }}<template v-if="renovam"> · {{ renovam }} {{ renovam === 1 ? 'assinatura renova' : 'assinaturas renovam' }} em breve</template></span></button>
      <button class="cartao" @click="irEstoque('online'); $emit('ir','compras')"><span class="suave">Compras online</span><b :class="{ alerta: online.avisos }">{{ online.avisos }}</b><span class="suave">{{ online.avisos === 1 ? 'aviso' : 'avisos' }} · {{ online.caminho }} a caminho · {{ online.alvo }} no alvo</span></button>
      <button class="cartao" @click="irEstoque('compras'); $emit('ir','compras')"><span class="suave">Lista de compras</span><b>{{ nLista }}</b><span class="suave">pendentes</span></button>
      <button v-if="pos" class="cartao" @click="irEstudos('pos'); $emit('ir','estudos')"><span class="suave">Pós · semana</span><b>{{ hm(pos.semMin) }}</b><span class="suave">meta {{ pos.plano ? hm(pos.plano.metaSem) : '' }} · {{ pos.diasSem }}/5 dias</span></button>
      <button class="cartao" @click="irEstudos('duo'); $emit('ir','estudos')"><span class="suave">Duolingo</span><b class="ofensiva">{{ duo.ofensiva }}</b><span class="suave">{{ duo.feito ? 'feito hoje ✓' : 'hoje: ' + duo.idioma }}</span></button>
    </div>
    <Agenda v-if="calc" :calc="calc" @ir="$emit('ir', $event)"></Agenda>
    <button class="btn largo" @click="revisao=true">📄 Revisão do período (escolher datas e exportar)</button>
    </template>
  </section>`
};
