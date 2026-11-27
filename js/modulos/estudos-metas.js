// Estudos › Metas: metas pessoais automáticas (dados do app) ou manuais, com prazo anual, trimestral, mensal ou livre.
import { reactive, ref, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, lerNumero, fmtNum } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { criarCalc, hojeStr, lerCfgAgua } from '../servicos/rotina-servico.js';
import { diasDeEstudo } from '../servicos/estudos-servico.js';
import * as F from '../servicos/fin-servico.js';
import * as P from '../servicos/pessoal-servico.js';

const PERIODOS = { ano: 'Ano', trimestre: 'Trimestre', mes: 'Mês', livre: 'Livre' };
export default {
  components: { Modal },
  setup() {
    const hoje = hojeStr();
    const metas = vivo(() => db.pMetas.toArray(), []);
    const leituras = vivo(() => db.pLeituras.toArray(), []);
    const sessoes = vivo(() => db.sessoes.toArray(), []);
    const atividades = vivo(() => db.atividades.toArray(), []), marcacoes = vivo(() => db.marcacoes.toArray(), []), agua = vivo(() => db.agua.toArray(), []);
    const viagens = vivo(() => db.viagens.toArray(), []), cfg = vivo(() => lerCfgAgua(), null), inicioCont = vivo(() => db.meta.get('inicioContagem'), null);
    const metasEstudo = vivo(async () => Object.fromEntries((await db.meta.filter((m) => m.chave.startsWith('estudoMeta-')).toArray()).map((m) => [m.chave, m.minutos])), {});
    const finLiberado = F.desbloqueadoRecente();
    const finRaw = vivo(async () => finLiberado ? { contas: await db.fContas.toArray(), cartoes: await db.fCartoes.toArray(), categorias: await db.fCategorias.toArray(), caixinhas: await db.fCaixinhas.toArray(), fixas: await db.fFixas.toArray(), lancs: await db.fLanc.toArray(), inicio: await db.meta.get('finInicio') } : null, null);
    const caixas = computed(() => {
      const r = finRaw.value; if (!r) return null;
      const f = F.criarFin({ ...r, cotacao: 5.3, hoje, inicio: r.inicio?.data || '' }, 'tudo');
      return Object.fromEntries(f.metas.map((x) => [x.id, { saldo: x.saldo, nome: x.nome }]));
    });
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje, viagens: viagens.value, estudoDias: diasDeEstudo(sessoes.value, metasEstudo.value), inicio: inicioCont.value?.data || '' }));
    const duoDias = computed(() => new Set(marcacoes.value.filter((m) => m.atividadeId === 'duolingo' && (m.valor === 'f' || m.valor === 'o')).map((m) => m.data)));
    const lista = computed(() => {
      const c = calc.value;
      return P.calcularMetas(metas.value, { hoje, sessoes: sessoes.value, leituras: leituras.value, duoDias: duoDias.value, caixinhas: caixas.value,
        aguaDia: (s) => c ? c.litros(s) >= c.cfgEm(s).limiar : false,
        rotinaDia: (s) => { const d = c?.dia(s); return d && !d.viagem && !d.antes ? d : null; } });
    });
    const filtro = ref('ativas');
    const visiveis = computed(() => lista.value.filter((m) => filtro.value === 'todas' ? true : filtro.value === 'concluidas' ? m.estado === 'concluida' : m.estado !== 'concluida' && m.estado !== 'encerrada')
      .sort((a, b) => a.fim.localeCompare(b.fim)));

    const ed = reactive({ aberto: false, v: {} });
    const anoAtual = hoje.slice(0, 4), triAtual = String(Math.floor((+hoje.slice(5, 7) - 1) / 3) + 1);
    function nova() { Object.assign(ed, { aberto: true, v: { nome: '', tipo: 'auto', fonte: 'estudo', caixinhaId: '', filtroTipo: '', alvo: '', unidade: '', periodo: 'ano', ano: anoAtual, tri: triAtual, mes: hoje.slice(0, 7), inicio: hoje, fim: '' } }); }
    function editar(m) { Object.assign(ed, { aberto: true, v: { id: m.id, nome: m.nome, tipo: m.tipo, fonte: m.fonte || 'estudo', caixinhaId: m.caixinhaId || '', filtroTipo: m.filtroTipo || '', alvo: String(m.alvo).replace('.', ','), unidade: m.unidade, periodo: m.periodo, ano: m.inicio.slice(0, 4), tri: String(Math.floor((+m.inicio.slice(5, 7) - 1) / 3) + 1), mes: m.inicio.slice(0, 7), inicio: m.inicio, fim: m.fim } }); }
    async function salvar() {
      const v = ed.v, alvo = lerNumero(v.alvo);
      if (!v.nome.trim()) return avisar('Informe o nome');
      if (!(alvo > 0)) return avisar('Informe o alvo');
      if (v.tipo === 'auto' && v.fonte === 'caixinha' && !v.caixinhaId) return avisar(finLiberado ? 'Escolha a caixinha' : 'Abra Finanças (senha) para escolher a caixinha');
      if (v.periodo === 'livre' && (!v.inicio || !v.fim || v.fim < v.inicio)) return avisar('Datas inválidas');
      await P.salvarMeta({ ...v, alvo }); ed.aberto = false; avisar('Meta salva');
    }
    async function excluir() { if (!confirm(`Excluir a meta "${ed.v.nome}"?`)) return; await P.excluirMeta(ed.v.id); ed.aberto = false; avisar('Meta excluída'); }
    const pm = reactive({ aberto: false, m: null, valor: '' });
    const abrirProgresso = (m) => Object.assign(pm, { aberto: true, m, valor: String(m.atual).replace('.', ',') });
    async function somar(n) { await P.progressoManual(pm.m.id, (pm.m.atual || 0) + n); pm.aberto = false; avisar('Progresso atualizado'); }
    async function definir() { const v = lerNumero(pm.valor); if (!(v >= 0)) return avisar('Valor inválido'); await P.progressoManual(pm.m.id, v); pm.aberto = false; avisar('Progresso atualizado'); }

    const fmtV = (m, x) => m.unidade === 'R$' ? F.fmtR(x) : fmtNum(Math.round(x * 10) / 10) + (m.unidade ? ' ' + m.unidade : '');
    const fd = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4);
    const perTxt = (m) => m.periodo === 'ano' ? 'Ano ' + m.inicio.slice(0, 4) : m.periodo === 'trimestre' ? `${Math.floor((+m.inicio.slice(5, 7) - 1) / 3) + 1}º tri ${m.inicio.slice(0, 4)}` : m.periodo === 'mes' ? new Date(m.inicio + 'T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : `${fd(m.inicio)} a ${fd(m.fim)}`;
    const estTxt = { concluida: 'Concluída ✓', encerrada: 'Prazo encerrado', futura: 'Ainda não começou', ritmo: 'No ritmo', atrasada: 'Abaixo do ritmo' };
    const caixasOpc = computed(() => caixas.value ? Object.entries(caixas.value).map(([id, x]) => ({ id, nome: x.nome })) : []);
    return { visiveis, filtro, ed, nova, editar, salvar, excluir, pm, abrirProgresso, somar, definir, fmtV, perTxt, estTxt, FONTES: P.FONTES, TIPOS: P.TIPOS_LEIT, PERIODOS, caixasOpc, finLiberado };
  },
  template: `
  <div class="pilha">
    <div class="chips"><button v-for="f in [['ativas','Ativas'],['concluidas','Concluídas'],['todas','Todas']]" :key="f[0]" class="chip" :class="{ ativo: filtro===f[0] }" @click="filtro=f[0]">{{ f[1] }}</button></div>
    <p v-if="!visiveis.length" class="vazio">{{ filtro==='ativas' ? 'Nenhuma meta ativa. Toque em “+ Meta”.' : 'Nada aqui ainda.' }}</p>
    <div v-for="m in visiveis" :key="m.id" class="caixa pilha meta-p" :class="m.estado">
      <div class="entre"><button class="linha-info" @click="editar(m)"><strong>{{ m.nome }}</strong><span class="suave">{{ perTxt(m) }} · {{ m.tipo==='auto' ? 'automática' : 'manual' }}</span></button>
        <button v-if="m.tipo==='manual'" class="btn mini" @click="abrirProgresso(m)">Atualizar</button></div>
      <template v-if="m.bloqueado"><span class="suave">🔒 Abra Finanças com a senha para ver esta meta.</span></template>
      <template v-else>
        <div class="entre"><b class="num">{{ fmtV(m, m.atual) }} <small class="suave">de {{ fmtV(m, m.alvo) }}</small></b><span class="meta-est">{{ estTxt[m.estado] }}</span></div>
        <span class="barra"><i :style="{ width: m.pct + '%' }"></i></span>
        <span class="dica">{{ m.pct }}% feito · {{ m.passadosPct }}% do prazo<template v-if="m.estado==='atrasada' && m.fonte!=='rotina'"> · esperado hoje: {{ fmtV(m, m.esperado) }}</template><template v-if="m.estado!=='concluida' && m.estado!=='encerrada'"> · faltam {{ m.restamDias }} dias</template></span>
      </template>
    </div>
    <button class="btn-tracejado" @click="nova">+ Meta</button>

    <Modal v-if="ed.aberto" :titulo="ed.v.id ? 'Editar meta' : 'Nova meta'" @fechar="ed.aberto=false">
      <label class="campo">Nome <input v-model="ed.v.nome" placeholder="Ex.: Estudar 200 h, Ler 12 livros"></label>
      <div class="abas-seg"><button :class="{ ativo: ed.v.tipo==='auto' }" @click="ed.v.tipo='auto'">Automática</button><button :class="{ ativo: ed.v.tipo==='manual' }" @click="ed.v.tipo='manual'">Manual</button></div>
      <template v-if="ed.v.tipo==='auto'">
        <label class="campo">Medir por <select v-model="ed.v.fonte"><option v-for="(f,k) in FONTES" :key="k" :value="k">{{ f.nome }}</option></select></label>
        <label v-if="ed.v.fonte==='caixinha'" class="campo">Caixinha <select v-model="ed.v.caixinhaId" :disabled="!finLiberado"><option value="">{{ finLiberado ? 'Escolha…' : '🔒 abra Finanças (PIN)' }}</option><option v-for="c in caixasOpc" :key="c.id" :value="c.id">{{ c.nome }}</option></select></label>
        <label v-if="ed.v.fonte==='leituras'" class="campo">Tipo <select v-model="ed.v.filtroTipo"><option value="">Todos</option><option v-for="(n,k) in TIPOS" :key="k" :value="k">{{ n }}</option></select></label>
      </template>
      <div class="grade-2">
        <label class="campo">Alvo ({{ ed.v.tipo==='auto' ? FONTES[ed.v.fonte].unidade : 'número' }}) <input v-model="ed.v.alvo" inputmode="decimal"></label>
        <label v-if="ed.v.tipo==='manual'" class="campo">Unidade <input v-model="ed.v.unidade" placeholder="ex.: km, viagens"></label>
      </div>
      <label class="campo">Prazo <select v-model="ed.v.periodo"><option v-for="(n,k) in PERIODOS" :key="k" :value="k">{{ n }}</option></select></label>
      <div class="grade-2">
        <label v-if="ed.v.periodo==='ano' || ed.v.periodo==='trimestre'" class="campo">Ano <input v-model="ed.v.ano" inputmode="numeric"></label>
        <label v-if="ed.v.periodo==='trimestre'" class="campo">Trimestre <select v-model="ed.v.tri"><option v-for="q in ['1','2','3','4']" :key="q" :value="q">{{ q }}º</option></select></label>
        <label v-if="ed.v.periodo==='mes'" class="campo">Mês <input type="month" v-model="ed.v.mes"></label>
        <label v-if="ed.v.periodo==='livre'" class="campo">Início <input type="date" v-model="ed.v.inicio"></label>
        <label v-if="ed.v.periodo==='livre'" class="campo">Fim <input type="date" v-model="ed.v.fim"></label>
      </div>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
    <Modal v-if="pm.aberto" :titulo="pm.m.nome" @fechar="pm.aberto=false">
      <div class="acoes"><button class="btn" @click="somar(-1)">− 1</button><button class="btn primario" @click="somar(1)">+ 1</button></div>
      <label class="campo">Ou defina o total ({{ pm.m.unidade || 'número' }}) <input v-model="pm.valor" inputmode="decimal"></label>
      <div class="acoes"><button class="btn" @click="pm.aberto=false">Cancelar</button><button class="btn primario" @click="definir">Salvar</button></div>
    </Modal>
  </div>`
};
