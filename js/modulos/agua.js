// Rotina > Água: registro do dia, recipientes (segure para editar), meta e histórico.
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { fmtNum, lerNumero, uid } from '../db.js';
import { avisar, Modal, criarPressao } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';

export default {
  components: { Modal },
  setup() {
    const r = inject('rot');
    const c = computed(() => r.calc.value);
    const hoje = computed(() => r.hoje.value);
    const cfgH = computed(() => c.value.cfgEm(hoje.value));
    const total = computed(() => c.value.litros(hoje.value));
    const status = computed(() => {
      const t = total.value, { meta, limiar } = cfgH.value;
      if (t >= meta) return 'Meta batida!';
      if (t >= limiar) return `Concluído na rotina. Faltam ${fmtNum(meta - t)} L para a meta.`;
      return `Faltam ${fmtNum(limiar - t)} L para concluir na rotina.`;
    });
    const registros = computed(() => r.agua.value.filter((x) => x.data === hoje.value && !x.excluido).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)));
    const hist = computed(() => {
      const out = [];
      for (let i = 29; i >= 0; i--) {
        const s = R.somaDias(hoje.value, -i), l = c.value.litros(s), lim = c.value.cfgEm(s).limiar;
        out.push({ s, l, ok: l >= lim, h: Math.min(100, (l / 4) * 100), tit: R.pd(s).toLocaleDateString('pt-BR') + ': ' + fmtNum(l) + ' L' });
      }
      return out;
    });
    const linhaLimiar = computed(() => (cfgH.value.limiar / 4) * 100);

    async function beber(ml, nome) { await R.beber(ml); avisar(`+${ml} ml${nome ? ' (' + nome + ')' : ''}`); }
    async function desfazer() { const u = await R.desfazerAgua(); avisar(u ? `Removido: ${u.ml} ml` : 'Nada para desfazer hoje'); }

    // Recipientes: toque = registrar; segurar = editar
    const p = criarPressao();
    const ed = reactive({ aberto: false, id: null, nome: '', ml: '' });
    const editar = (x) => Object.assign(ed, { aberto: true, id: x?.id || null, nome: x?.nome || '', ml: x ? String(x.ml) : '' });
    async function salvarRec() {
      const ml = Math.round(lerNumero(ed.ml));
      if (!ed.nome.trim() || !(ml > 0)) return avisar('Informe nome e capacidade (ml)');
      const recs = [...r.cfg.value.recipientes];
      const i = recs.findIndex((x) => x.id === ed.id);
      const novo = { id: ed.id || uid(), nome: ed.nome.trim(), ml };
      if (i >= 0) recs[i] = novo; else recs.push(novo);
      await R.salvarCfgAgua({ recipientes: recs }); ed.aberto = false;
    }
    async function removerRec() {
      await R.salvarCfgAgua({ recipientes: r.cfg.value.recipientes.filter((x) => x.id !== ed.id) }); ed.aberto = false;
    }
    // Outro valor
    const outro = reactive({ aberto: false, ml: '' });
    async function confirmarOutro() {
      const ml = Math.round(lerNumero(outro.ml));
      if (!(ml > 0)) return avisar('Informe a quantidade em ml');
      outro.aberto = false; await beber(ml);
    }
    // Meta
    const cf = reactive({ aberto: false, meta: '', limiar: '' });
    const abrirCfg = () => Object.assign(cf, { aberto: true, meta: fmtNum(cfgH.value.meta), limiar: fmtNum(cfgH.value.limiar) });
    async function salvarCfg() {
      const meta = lerNumero(cf.meta), limiar = lerNumero(cf.limiar);
      if (!(meta > 0) || !(limiar > 0) || limiar > meta) return avisar('Valores inválidos (o mínimo não pode passar da meta)');
      await R.salvarCfgAgua({ meta, limiar }); cf.aberto = false; avisar('Vale a partir de hoje');
    }
    return { r, cfgH, total, status, registros, hist, linhaLimiar, beber, desfazer, p, ed, editar, salvarRec, removerRec, outro, confirmarOutro, cf, abrirCfg, salvarCfg, fmtNum };
  },
  template: `
  <div class="pilha">
    <div class="caixa pilha">
      <div class="entre"><span><b class="grande">{{ fmtNum(total) }} L</b> <span class="suave">de {{ fmtNum(cfgH.meta) }} L</span></span><button class="btn-mini" @click="abrirCfg" aria-label="Configurar meta">⚙</button></div>
      <span class="barra grossa marcador"><i :style="{ width: Math.min(100, total / cfgH.meta * 100) + '%' }"></i><em :style="{ left: (cfgH.limiar / cfgH.meta * 100) + '%' }"></em></span>
      <span class="dica" :class="{ okt: total >= cfgH.limiar }">{{ status }}</span>
    </div>
    <div class="recipientes">
      <button v-for="x in r.cfg.value.recipientes" :key="x.id" class="recip"
        @pointerdown="p.iniciar(() => editar(x))" @pointerleave="p.cancelar()" @pointercancel="p.cancelar()"
        @click="p.clique(() => beber(x.ml, x.nome))" @contextmenu.prevent><b>{{ x.nome }}</b><small>{{ x.ml }} ml</small></button>
      <button class="recip tracejado" @click="outro.aberto=true; outro.ml=''"><b>Outro</b><small>digitar</small></button>
    </div>
    <p class="dica">Segure um recipiente para alterar a capacidade. <a href="#" @click.prevent="editar(null)">+ novo recipiente</a></p>
    <div class="entre"><h2 class="rotulo">Hoje</h2><button class="btn" @click="desfazer">Desfazer último</button></div>
    <p v-if="!registros.length" class="suave">Nenhum registro hoje.</p>
    <div v-for="x in registros" :key="x.id" class="entre item-agua"><span class="suave">{{ x.hora }}</span><span>+{{ x.ml }} ml<small v-if="x.origem" class="suave"> · automático</small></span></div>
    <h2 class="rotulo">Últimos 30 dias</h2>
    <div class="grafico-agua">
      <em :style="{ bottom: linhaLimiar + '%' }"></em>
      <i v-for="b in hist" :key="b.s" :class="{ ok: b.ok }" :style="{ height: b.h + '%' }" :title="b.tit"></i>
    </div>
    <p class="dica">Linha = mínimo para concluir ({{ fmtNum(cfgH.limiar) }} L). Registros só no próprio dia.</p>

    <Modal v-if="ed.aberto" :titulo="ed.id ? 'Editar recipiente' : 'Novo recipiente'" @fechar="ed.aberto=false">
      <div class="grade-2">
        <label class="campo">Nome <input v-model="ed.nome"></label>
        <label class="campo">Capacidade (ml) <input v-model="ed.ml" inputmode="numeric" autofocus></label>
      </div>
      <div class="acoes"><button v-if="ed.id" class="btn perigo" @click="removerRec">Remover</button><span class="espaco"></span>
        <button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvarRec">Salvar</button></div>
    </Modal>
    <Modal v-if="outro.aberto" titulo="Outra quantidade" @fechar="outro.aberto=false">
      <label class="campo">Quantidade (ml) <input v-model="outro.ml" inputmode="numeric" autofocus @keyup.enter="confirmarOutro"></label>
      <div class="acoes"><button class="btn" @click="outro.aberto=false">Cancelar</button><button class="btn primario" @click="confirmarOutro">Adicionar</button></div>
    </Modal>
    <Modal v-if="cf.aberto" titulo="Meta de água" @fechar="cf.aberto=false">
      <div class="grade-2">
        <label class="campo">Meta diária (L) <input v-model="cf.meta" inputmode="decimal"></label>
        <label class="campo">Concluir na rotina com (L) <input v-model="cf.limiar" inputmode="decimal"></label>
      </div>
      <p class="dica">A mudança vale de hoje em diante; o histórico não muda.</p>
      <div class="acoes"><button class="btn" @click="cf.aberto=false">Cancelar</button><button class="btn primario" @click="salvarCfg">Salvar</button></div>
    </Modal>
  </div>`
};
