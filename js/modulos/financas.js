// Módulo Finanças: PIN, visões (Pessoal | Empresa | Tudo), abas e lançamento.
import { ref, computed, provide, onMounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar } from '../ui.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import * as F from '../servicos/fin-servico.js';
import Resumo from './fin-resumo.js';
import { Lancamentos, Categorias, Metas } from './fin-listas.js';
import Lancar from './fin-lancar.js';
import Config from './fin-config.js';
import Assinaturas from './fin-assinaturas.js';
import Relatorio from './fin-relatorio.js';
import Banco from './fin-banco.js';

const AMP = `<svg viewBox="0 0 86 120" aria-hidden="true"><rect x="10" y="2" width="66" height="6" rx="3" fill="#D4AF37"/><rect x="10" y="112" width="66" height="6" rx="3" fill="#D4AF37"/><path d="M16 10h54c0 22-18 32-24 50 6 18 24 28 24 50H16c0-22 18-32 24-50-6-18-24-28-24-50z" fill="none" stroke="#D4AF37" stroke-width="3"/><path d="M24 26h38c-3 10-12 16-19 28-7-12-16-18-19-28z" fill="#A78BFA"/><path d="M22 108c2-14 13-20 21-26 8 6 19 12 21 26z" fill="#E8CF7A"/></svg>`;

export default {
  components: { Resumo, Lancamentos, Categorias, Metas, Lancar, Config, Assinaturas, Relatorio, Banco },
  setup() {
    // ----- PIN -----
    const criando = ref(!F.temPin());
    const liberado = ref(F.temPin() && F.desbloqueadoRecente());
    const pin = ref(''), primeiro = ref(''), erro = ref('');
    async function tecla(t) {
      erro.value = '';
      if (t === '⌫') { pin.value = pin.value.slice(0, -1); return; }
      if (pin.value.length >= 4) return;
      pin.value += t;
      if (pin.value.length < 4) return;
      if (criando.value) {
        if (!primeiro.value) { primeiro.value = pin.value; pin.value = ''; return; }
        if (primeiro.value !== pin.value) { erro.value = 'Os PINs não conferem. Comece de novo.'; primeiro.value = ''; pin.value = ''; return; }
        await F.definirPin(pin.value); criando.value = false;
      } else if (!(await F.conferirPin(pin.value))) { erro.value = 'PIN incorreto'; pin.value = ''; return; }
      F.marcarDesbloqueio(); liberado.value = true; pin.value = '';
    }
    function esqueci() {
      if (!confirm('Redefinir o PIN deste aparelho? Seus dados não são apagados.')) return;
      F.removerPin(); criando.value = true; primeiro.value = ''; pin.value = '';
    }
    const msgPin = computed(() => criando.value ? (primeiro.value ? 'Confirme o novo PIN' : 'Crie um PIN de 4 dígitos para Finanças') : 'Digite seu PIN');

    // ----- dados -----
    const D = {
      contas: vivo(() => db.fContas.toArray(), []), cartoes: vivo(() => db.fCartoes.toArray(), []),
      categorias: vivo(() => db.fCategorias.toArray(), []), caixinhas: vivo(() => db.fCaixinhas.toArray(), []),
      fixas: vivo(() => db.fFixas.toArray(), []), lancs: vivo(() => db.fLanc.toArray(), []),
      inicio: vivo(() => db.meta.get('finInicio'), null)
    };
    const cot = ref({ valor: 5.3, antiga: true });
    onMounted(async () => { F.garantirFinancas(); cot.value = await F.cotacaoDolar(); });
    const visao = ref(sessionStorage.getItem('finVisao') || 'pf');
    const mes = ref(F.mesDe(hojeStr()));
    const aba = ref(sessionStorage.getItem('finAba') || 'resumo');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('finAba', k); };
    const mudarVisao = (k) => { visao.value = k; sessionStorage.setItem('finVisao', k); };
    const fin = computed(() => F.criarFin({ contas: D.contas.value, cartoes: D.cartoes.value, categorias: D.categorias.value, caixinhas: D.caixinhas.value, fixas: D.fixas.value,
      lancs: D.lancs.value, cotacao: cot.value.valor, hoje: hojeStr(), inicio: D.inicio.value?.data || '' }, visao.value, mes.value));

    // ----- lançamento (modal) -----
    const form = ref(null); // null = fechado; objeto = valores iniciais
    const abrirLanc = (inicial = {}) => { form.value = { ...inicial }; };
    // vindo da Lista de compras: "Lançar gasto"
    const pend = sessionStorage.getItem('finNovo');
    if (pend) { sessionStorage.removeItem('finNovo'); try { form.value = JSON.parse(pend); } catch { /* ignora */ } }
    const config = ref(false), relatorio = ref(false);
    provide('fin', { fin, D, cot, visao, mes, irAba: (k) => { aba.value = k; sessionStorage.setItem('finAba', k); }, abrirLanc, abrirConfig: () => { config.value = true; } });
    const mudarMes = (n) => { mes.value = F.addMes(mes.value, n); };
    const inicioTxt = computed(() => { const d = D.inicio.value?.data; return d && hojeStr() < d ? d.split('-').reverse().join('/') : ''; });
    return { relatorio, inicioTxt, AMP, criando, liberado, pin, erro, msgPin, tecla, esqueci, visao, mudarVisao, aba, irAba, fin, mes, mudarMes, nomeMes: F.nomeMes, form, abrirLanc, config, avisar };
  },
  template: `
  <section v-if="!liberado" class="pin-tela">
    <span class="pin-amp" v-html="AMP"></span>
    <h2 class="pin-titulo">Finanças</h2>
    <p class="suave">{{ msgPin }}</p>
    <div class="pin-pontos"><i v-for="n in 4" :key="n" :class="{ on: pin.length >= n }"></i></div>
    <p v-if="erro" class="alerta">{{ erro }}</p>
    <div class="pin-teclado">
      <button v-for="t in ['1','2','3','4','5','6','7','8','9','','0','⌫']" :key="t" :disabled="!t" @click="t && tecla(t)" :aria-label="t==='⌫' ? 'Apagar' : t">{{ t }}</button>
    </div>
    <button v-if="!criando" class="btn-link" @click="esqueci">Esqueci o PIN</button>
  </section>

  <section v-else-if="relatorio" class="pilha fin">
    <button class="btn-voltar nao-imprimir" @click="relatorio=false">‹ Finanças</button>
    <Relatorio></Relatorio>
  </section>

  <section v-else-if="config" class="pilha fin">
    <button class="btn-voltar" @click="config=false">‹ Finanças</button>
    <Config></Config>
  </section>

  <section v-else class="pilha fin">
    <div class="entre">
      <div class="seg-visao">
        <button v-for="[k, n] in [['pf','Pessoal'],['pj','Empresa'],['tudo','Tudo']]" :key="k" :class="{ ativo: visao===k }" @click="mudarVisao(k)">{{ n }}</button>
      </div>
      <span class="topo-acoes"><button class="btn mini" @click="relatorio=true">Relatório</button>
      <button class="btn-engr" @click="config=true" aria-label="Configurar Finanças"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></svg></button></span>
    </div>
    <p v-if="inicioTxt" class="aviso-inicio">Os registros começam em {{ inicioTxt }}. Lançamentos com data anterior não aparecem (altere em ajustes › Geral).</p>
    <div class="abas-fin">
      <button v-for="[k, n] in [['resumo','Resumo'],['lanc','Lançamentos'],['cat','Categorias'],['metas','Metas'],['assin','Assinaturas'],['banco','Banco']]" :key="k" :class="{ ativo: aba===k }" @click="irAba(k)">{{ n }}</button>
    </div>
    <div v-if="aba!=='metas' && aba!=='assin' && aba!=='banco'" class="cab-mes"><button class="btn-mini" @click="mudarMes(-1)" aria-label="Mês anterior">‹</button><b class="cresce centro">{{ nomeMes(mes) }}</b><button class="btn-mini" @click="mudarMes(1)" aria-label="Próximo mês">›</button></div>
    <Resumo v-if="aba==='resumo'"></Resumo>
    <Lancamentos v-else-if="aba==='lanc'"></Lancamentos>
    <Assinaturas v-else-if="aba==='assin'"></Assinaturas>
    <Banco v-else-if="aba==='banco'"></Banco>
    <Categorias v-else-if="aba==='cat'"></Categorias>
    <Metas v-else></Metas>
    <button class="fab" @click="abrirLanc()" aria-label="Novo lançamento">+</button>
    <Lancar v-if="form" :inicial="form" @fechar="form=null"></Lancar>
  </section>`
};
