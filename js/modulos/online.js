// Compras › Online: desejos (preço-alvo e histórico) e pedidos (status, entrega, devolução, garantia).
import { ref, reactive, computed, onMounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, lerNumero, fmtNum } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { hojeStr, somaDias } from '../servicos/rotina-servico.js';
import * as O from '../servicos/online-servico.js';
import * as E from '../servicos/estoque-servico.js';

const num = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

export default {
  components: { Modal },
  setup() {
    const desejos = vivo(() => db.oDesejos.toArray(), []);
    const precos = vivo(() => db.oPrecos.toArray(), []);
    const pedidos = vivo(() => db.oPedidos.toArray(), []);
    const cfg = vivo(() => O.lerCfg(), null);
    const itensEstoque = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const hoje = hojeStr();
    const M = computed(() => O.montar({ desejos: desejos.value, precos: precos.value, pedidos: pedidos.value, hoje }));

    const seg = ref(sessionStorage.getItem('onlineSeg') || 'desejos');
    const irSeg = (k) => { seg.value = k; sessionStorage.setItem('onlineSeg', k); };
    const filtro = ref('todos');
    const vistosV = ref(O.vistos());
    const avisos = computed(() => M.value.avisos.filter((a) => !vistosV.value.has(a.chave)));
    const dispensar = (a) => { O.marcarVisto(a.chave); vistosV.value = O.vistos(); };
    const listaDesejos = computed(() => {
      const ord = { alta: 0, media: 1, baixa: 2 };
      return M.value.desejos.filter((d) => filtro.value === 'alvo' ? d.noAlvo : filtro.value === 'alta' ? d.prio === 'alta' : filtro.value === 'indisp' ? !d.disp : true)
        .sort((a, b) => (b.noAlvo - a.noAlvo) || (ord[a.prio] - ord[b.prio]) || a.nome.localeCompare(b.nome, 'pt-BR'));
    });

    // gráfico (SVG) de uma série de preços
    function serie(d, w, h, pad) {
      const v = d.hist.map((p) => p.valor);
      if (!v.length) return null;
      const lo = Math.min(...v, d.alvo), hi = Math.max(...v, d.alvo), sp = hi - lo || 1;
      const y = (x) => +(pad + (h - 2 * pad) * (1 - (x - lo) / sp)).toFixed(1);
      const pts = v.map((x, i) => ({ x: v.length === 1 ? w : +(i * w / (v.length - 1)).toFixed(1), y: y(x) }));
      if (v.length === 1) pts.unshift({ x: 0, y: pts[0].y });
      const linha = pts.map((p) => p.x + ',' + p.y).join(' ');
      return { linha, area: `0,${h} ${linha} ${w},${h}`, yAlvo: y(d.alvo), fim: pts[pts.length - 1], pts };
    }

    // ---------- telas ----------
    const tela = reactive({ tipo: 'lista', id: null });
    const abrirDesejo = (id) => Object.assign(tela, { tipo: 'desejo', id });
    const abrirPedido = (id) => Object.assign(tela, { tipo: 'pedido', id });
    const voltar = () => Object.assign(tela, { tipo: 'lista', id: null });
    const dz = computed(() => tela.tipo === 'desejo' ? M.value.desejos.find((d) => d.id === tela.id) : null);
    const pz = computed(() => tela.tipo === 'pedido' ? M.value.pedidos.find((p) => p.id === tela.id) : null);
    const irAviso = (a) => { if (a.desejoId) { irSeg('desejos'); abrirDesejo(a.desejoId); } else { irSeg('pedidos'); abrirPedido(a.pedidoId); } };

    // ---------- desejo: novo / editar ----------
    const fd = reactive({ aberto: false, id: null, url: '', nome: '', preco: '', alvo: '', prio: 'media', buscando: false });
    const lojaFd = computed(() => O.detectarLoja(fd.url));
    function novoDesejo() { Object.assign(fd, { aberto: true, id: null, url: '', nome: '', preco: '', alvo: '', prio: 'media', buscando: false }); }
    function editarDesejo(d) { Object.assign(fd, { aberto: true, id: d.id, url: d.url, nome: d.nome, preco: '', alvo: num(d.alvo), prio: d.prio, buscando: false }); }
    async function buscarML() {
      if (!cfg.value?.url) return avisar('Configure o servidor em “Servidor” para buscar automático');
      fd.buscando = true;
      try {
        const r = await O.consultar(cfg.value, fd.url);
        if (r.erro) avisar(r.erro);
        else { if (!fd.nome) fd.nome = r.titulo || ''; if (r.preco) fd.preco = num(r.preco); if (!r.disp) avisar('Anúncio indisponível no momento'); }
      } catch (e) { avisar('Não consegui consultar: ' + e.message); }
      fd.buscando = false;
    }
    async function salvarDesejo() {
      const alvo = lerNumero(fd.alvo), preco = lerNumero(fd.preco);
      if (!fd.nome.trim()) return avisar('Informe o nome');
      if (!(alvo > 0)) return avisar('Informe o preço-alvo');
      if (!fd.id && !(preco > 0) && lojaFd.value !== 'ml') return avisar('Informe o preço atual');
      const id = await O.salvarDesejo({ id: fd.id, url: fd.url, nome: fd.nome, alvo, prio: fd.prio, loja: lojaFd.value, preco: fd.id || (lojaFd.value === 'ml' && cfg.value?.url) ? null : preco });
      fd.aberto = false;
      avisar(fd.id ? 'Desejo atualizado' : 'Desejo adicionado');
      if (lojaFd.value === 'ml') O.atualizarOnline({ forcar: true });
      if (!fd.id) abrirDesejo(id);
    }
    async function excluirDesejo() {
      if (!confirm(`Excluir "${fd.nome}" da lista de desejos?`)) return;
      await O.excluirDesejo(fd.id); fd.aberto = false; voltar(); avisar('Desejo excluído');
    }

    // registrar preço manual
    const np = reactive({ valor: '', indisp: false });
    async function registrarPreco() {
      if (np.indisp) { await O.registrarPreco(dz.value.id, null, 'manual', false); np.indisp = false; return avisar('Marcado como indisponível'); }
      const v = lerNumero(np.valor);
      if (!(v > 0)) return avisar('Informe o preço');
      await O.registrarPreco(dz.value.id, v, 'manual', true);
      np.valor = ''; avisar('Preço registrado');
    }
    async function apagarPreco(p) { if (confirm('Apagar este registro de preço?')) await O.excluirPreco(p.id); }
    const registros = computed(() => dz.value ? (precos.value.filter((p) => p.desejoId === dz.value.id && !p.excluido)).sort((a, b) => b.em.localeCompare(a.em)) : []);

    // comprei
    const fc = reactive({ aberto: false, valor: '', compra: hoje, prazo: '', lancar: true });
    function abrirComprei() { Object.assign(fc, { aberto: true, valor: num(dz.value.atual), compra: hoje, prazo: '', lancar: true }); }
    async function confirmarComprei() {
      const v = lerNumero(fc.valor);
      if (!(v > 0)) return avisar('Informe o valor pago');
      const d = dz.value;
      const id = await O.comprar(d, { valor: v, compra: fc.compra, prazo: fc.prazo, primeiroPreco: d.primeiro });
      fc.aberto = false;
      irSeg('pedidos'); abrirPedido(id);
      if (fc.lancar) {
        sessionStorage.setItem('finNovo', JSON.stringify({ tipo: 'desp', valor: v, descricao: d.nome, catNome: 'Compras', data: fc.compra }));
        location.hash = 'financas';
      } else avisar('Virou pedido');
    }

    // ---------- pedido: novo / editar ----------
    const fp = reactive({ aberto: false, id: null, nome: '', url: '', valor: '', compra: hoje, prazo: '', rastreio: '', status: 'aguardando', garantiaAte: '' });
    function novoPedido() { Object.assign(fp, { aberto: true, id: null, nome: '', url: '', valor: '', compra: hoje, prazo: '', rastreio: '', status: 'aguardando', garantiaAte: '' }); }
    function editarPedido(p) { Object.assign(fp, { aberto: true, id: p.id, nome: p.nome, url: p.url || '', valor: num(p.valor), compra: p.compra, prazo: p.prazo || '', rastreio: p.rastreio || '', status: p.status, garantiaAte: p.garantiaAte || '' }); }
    async function salvarPedido() {
      const v = lerNumero(fp.valor);
      if (!fp.nome.trim()) return avisar('Informe o nome');
      if (!(v > 0)) return avisar('Informe o valor');
      if (!fp.compra) return avisar('Informe a data da compra');
      const id = await O.salvarPedido({ ...fp, valor: v });
      fp.aberto = false; avisar('Pedido salvo');
      if (!fp.id) { irSeg('pedidos'); abrirPedido(id); }
    }
    async function excluirPedido() {
      if (!confirm(`Excluir o pedido "${fp.nome}"?`)) return;
      await O.excluirPedido(fp.id); fp.aberto = false; voltar(); avisar('Pedido excluído');
    }
    async function avancar() {
      const p = pz.value, prox = O.ETAPAS[p.etapa + 1];
      if (prox === 'entregue') return abrirEntregue();
      await O.mudarStatus(p, prox); avisar(O.STATUS[prox]);
    }
    async function marcar(st) {
      if (!confirm(`Marcar "${pz.value.nome}" como ${O.STATUS[st].toLowerCase()}?`)) return;
      await O.mudarStatus(pz.value, st); avisar(O.STATUS[st]);
    }

    // entregue: garantia + somar ao estoque
    const fe = reactive({ aberto: false, data: hoje, garantiaMeses: '3', somar: false, itemId: '', novoNome: '', qtd: '1' });
    function abrirEntregue() { Object.assign(fe, { aberto: true, data: hoje, garantiaMeses: '3', somar: false, itemId: '', novoNome: pz.value.nome, qtd: '1' }); }
    async function confirmarEntregue() {
      const p = pz.value, m = lerNumero(fe.garantiaMeses);
      let garantiaAte = '';
      if (m > 0) { const d = new Date(+fe.data.slice(0, 4), +fe.data.slice(5, 7) - 1 + m, +fe.data.slice(8, 10)); garantiaAte = d.toISOString().slice(0, 10); }
      await O.mudarStatus(p, 'entregue', { entregueEm: fe.data, garantiaAte });
      if (fe.somar) {
        const q = lerNumero(fe.qtd);
        if (!(q > 0)) return avisar('Quantidade inválida');
        if (fe.itemId && fe.itemId !== '__novo') await E.repor(fe.itemId, q);
        else if (fe.novoNome.trim()) await E.salvarItem({ nome: fe.novoNome, categoriaId: null, unidade: 'un', saldo: q, qtdReposicaoPadrao: 1, passoBaixa: 1 });
      }
      fe.aberto = false;
      avisar(`Entregue · devolução até ${O.fmtD(somaDias(fe.data, O.DIAS_DEVOLUCAO))}` + (fe.somar ? ' · somado ao Estoque' : ''));
    }
    const copiar = async (t) => { try { await navigator.clipboard.writeText(t); avisar('Código copiado'); } catch { avisar(t); } };
    const abrirLink = (u) => { if (u) window.open(u, '_blank', 'noopener'); };

    // ---------- servidor ----------
    const fs = reactive({ aberto: false, url: '', segredo: '', status: null, testando: false });
    function abrirServidor() { Object.assign(fs, { aberto: true, url: cfg.value?.url || '', segredo: cfg.value?.segredo || '', status: null, testando: false }); }
    async function testarServidor() {
      if (!/^https:\/\//.test(fs.url.trim())) return avisar('O endereço deve começar com https://');
      if (fs.segredo.trim().length < 12) return avisar('A chave deve ter pelo menos 12 caracteres');
      await O.salvarCfg(fs.url, fs.segredo);
      fs.testando = true;
      try { fs.status = await O.testar(await O.lerCfg()); } catch (e) { fs.status = { erro: e.message }; }
      fs.testando = false;
    }
    async function conectarML() {
      try { const r = await O.iniciarML(await O.lerCfg()); window.open(r.url, '_blank', 'noopener'); avisar('Autorize no Mercado Livre e volte aqui'); }
      catch (e) { avisar('Erro: ' + e.message); }
    }
    async function atualizarAgora() {
      const r = await O.atualizarOnline({ forcar: true });
      avisar(r ? 'Preços atualizados' : (O.estadoOnline.erro || 'Servidor não configurado ou sem internet'));
    }

    onMounted(() => { O.atualizarOnline(); });

    const selosDe = (d) => [d.noAlvo && ['No alvo', 'pos'], d.menor && ['Menor preço', 'roxo'], !d.disp && ['Indisponível', 'neg'], d.voltou && ['Voltou ao estoque', 'pos']].filter(Boolean);
    const infoPedido = (p) => p.status === 'entregue' ? (p.devolveDias != null ? `Entregue ${O.fmtD(p.entregueEm)} · devolução até ${O.fmtD(p.devolveAte)}` : `Entregue ${O.fmtD(p.entregueEm)}`)
      : p.atraso ? `Atrasado ${p.atraso} ${p.atraso === 1 ? 'dia' : 'dias'} · prometido ${O.fmtD(p.prazo)}`
      : p.aberto ? (p.prazo ? `Prazo ${O.fmtD(p.prazo)}${p.faltam != null ? ' · ' + (p.faltam === 0 ? 'chega hoje' : 'faltam ' + p.faltam + (p.faltam === 1 ? ' dia' : ' dias')) : ''}` : 'Sem prazo informado') : O.STATUS[p.status];

    return { M, seg, irSeg, filtro, avisos, dispensar, irAviso, listaDesejos, serie, tela, abrirDesejo, abrirPedido, voltar, dz, pz,
      fd, lojaFd, novoDesejo, editarDesejo, buscarML, salvarDesejo, excluirDesejo, np, registrarPreco, apagarPreco, registros,
      fc, abrirComprei, confirmarComprei, fp, novoPedido, editarPedido, salvarPedido, excluirPedido, avancar, marcar,
      fe, confirmarEntregue, itensEstoque, copiar, abrirLink, fs, abrirServidor, testarServidor, conectarML, atualizarAgora, cfg,
      selosDe, infoPedido, L: O.LOJAS, ST: O.STATUS, ETAPAS: O.ETAPAS, PRIOS: O.PRIOS, fmtR: O.fmtR, fmtD: O.fmtD, fmtNum, estado: O.estadoOnline };
  },
  template: `
  <div class="pilha">
  <template v-if="tela.tipo==='lista'">
    <div class="on-resumo">
      <button @click="irSeg('desejos'); filtro='alvo'"><b :class="{ pos: M.nAlvo }">{{ M.nAlvo }}</b><span>no alvo</span></button>
      <button @click="irSeg('pedidos')"><b :class="{ roxo: M.nCaminho }">{{ M.nCaminho }}</b><span>a caminho</span></button>
      <button @click="irSeg('pedidos')"><b :class="{ neg: M.nAtraso }">{{ M.nAtraso }}</b><span>atrasado</span></button>
      <button @click="irSeg('pedidos')"><b :class="{ alerta: M.nDevol }">{{ M.nDevol }}</b><span>em devolução</span></button>
    </div>
    <div v-if="M.economia > 0" class="on-economia"><span>Economia comprando abaixo do 1º preço</span><b class="num">{{ fmtR(M.economia) }}</b></div>
    <div v-for="a in avisos" :key="a.chave" class="on-aviso" :class="a.cor">
      <button class="on-aviso-txt" @click="irAviso(a)">{{ a.texto }}</button>
      <button class="btn-x" aria-label="Dispensar aviso" @click="dispensar(a)">×</button>
    </div>
    <div class="on-topo">
      <div class="seg-visao"><button :class="{ ativo: seg==='desejos' }" @click="irSeg('desejos')">Desejos</button><button :class="{ ativo: seg==='pedidos' }" @click="irSeg('pedidos')">Pedidos</button></div>
      <button class="btn mini" @click="abrirServidor">Servidor{{ cfg?.url ? '' : ' ⚠' }}</button>
    </div>

    <template v-if="seg==='desejos'">
      <div class="chips on-filtros"><button v-for="f in [['todos','Todos'],['alvo','No alvo'],['alta','Prioridade alta'],['indisp','Indisponíveis']]" :key="f[0]" class="chip" :class="{ ativo: filtro===f[0] }" @click="filtro=f[0]">{{ f[1] }}</button></div>
      <p v-if="!listaDesejos.length" class="vazio">{{ filtro==='todos' ? 'Nenhum desejo. Toque em “+” e cole o link do produto.' : 'Nada neste filtro.' }}</p>
      <button v-for="d in listaDesejos" :key="d.id" class="on-card" @click="abrirDesejo(d.id)">
        <div class="on-linha">
          <span class="on-ini" :class="'lj-' + d.loja">{{ d.nome[0] }}</span>
          <div class="on-meio"><strong>{{ d.nome }}</strong><div class="on-sub"><span class="on-loja" :class="'lj-' + d.loja">{{ L[d.loja] }}</span><span class="suave">{{ d.loja==='ml' ? 'automático' : 'manual' }}{{ d.ultimaEm ? ' · ' + fmtD(d.ultimaEm.slice(0,10)) : '' }}</span></div></div>
          <div class="on-preco"><b class="num" :class="{ pos: d.noAlvo, apagado: !d.disp }">{{ fmtR(d.atual) }}</b><span class="suave">alvo {{ fmtR(d.alvo) }}</span></div>
        </div>
        <div class="on-linha">
          <svg v-if="serie(d,150,34,4)" class="on-spark" viewBox="0 0 150 34" aria-hidden="true"><line x1="0" :y1="serie(d,150,34,4).yAlvo" x2="150" :y2="serie(d,150,34,4).yAlvo" class="alvo"/><polyline :points="serie(d,150,34,4).linha" class="ln"/><circle :cx="serie(d,150,34,4).fim.x" :cy="serie(d,150,34,4).fim.y" r="3" class="pt"/></svg>
          <span v-else class="suave">sem preço ainda</span>
          <div class="on-selos"><span v-for="s in selosDe(d)" :key="s[0]" class="on-selo" :class="s[1]">{{ s[0] }}</span></div>
        </div>
      </button>
    </template>

    <template v-else>
      <p v-if="!M.pedidos.length" class="vazio">Nenhum pedido. Use “Comprei” num desejo ou o “+”.</p>
      <p v-if="estado.pedidosErro" class="dica">{{ estado.pedidosErro }}</p>
      <button v-for="p in M.pedidos" :key="p.id" class="on-card" :class="{ atrasado: p.atraso, fechado: !p.aberto && p.status!=='entregue' }" @click="abrirPedido(p.id)">
        <div class="on-linha"><strong class="on-nome">{{ p.nome }}</strong><b class="num">{{ fmtR(p.valor) }}</b></div>
        <div class="on-sub"><span class="on-loja" :class="'lj-' + p.loja">{{ L[p.loja] }}</span><span class="on-selo" :class="p.atraso ? 'neg' : p.status==='entregue' ? 'pos' : p.aberto ? 'roxo' : 'cinza'">{{ p.atraso ? 'Atrasado' : ST[p.status] }}</span><span v-if="p.origem==='ml'" class="suave">automático</span></div>
        <div v-if="p.etapa >= 0" class="on-passos"><i v-for="k in 4" :key="k" :class="{ on: k-1 <= p.etapa, neg: p.atraso && k-1 <= p.etapa }"></i></div>
        <span class="on-info" :class="{ neg: p.atraso, alerta: p.devolveDias != null }">{{ infoPedido(p) }}</span>
      </button>
    </template>
    <button class="fab" aria-label="Adicionar" @click="seg==='desejos' ? novoDesejo() : novoPedido()">+</button>
  </template>

  <template v-else-if="tela.tipo==='desejo' && dz">
    <button class="voltar" @click="voltar">‹ Desejos</button>
    <div class="on-linha"><span class="on-ini g" :class="'lj-' + dz.loja">{{ dz.nome[0] }}</span>
      <div class="on-meio"><strong class="on-titulo">{{ dz.nome }}</strong><div class="on-sub"><span class="on-loja" :class="'lj-' + dz.loja">{{ L[dz.loja] }}</span><span class="suave">prioridade {{ PRIOS[dz.prio].toLowerCase() }}</span></div></div></div>
    <div class="on-grafico">
      <div class="on-linha"><div><span class="rotulo">Preço atual</span><b class="num on-grande" :class="{ pos: dz.noAlvo, apagado: !dz.disp }">{{ fmtR(dz.atual) }}</b></div><span class="suave">alvo {{ fmtR(dz.alvo) }}</span></div>
      <svg v-if="serie(dz,326,120,10)" viewBox="0 0 326 120" class="on-big" aria-hidden="true"><line x1="0" :y1="serie(dz,326,120,10).yAlvo" x2="326" :y2="serie(dz,326,120,10).yAlvo" class="alvo"/><polygon :points="serie(dz,326,120,10).area" class="ar"/><polyline :points="serie(dz,326,120,10).linha" class="ln"/><circle v-for="(p,i) in serie(dz,326,120,10).pts" :key="i" :cx="p.x" :cy="p.y" r="3" class="pt"/></svg>
      <p v-else class="suave">Sem registros de preço ainda.</p>
      <div class="on-stats"><div><span>Menor</span><b class="num">{{ fmtR(dz.min) }}</b></div><div><span>Maior</span><b class="num">{{ fmtR(dz.max) }}</b></div><div><span>Média</span><b class="num">{{ fmtR(dz.media) }}</b></div></div>
    </div>
    <div class="on-selos esq"><span v-for="s in selosDe(dz)" :key="s[0]" class="on-selo" :class="s[1]">{{ s[0] }}</span></div>
    <p v-if="dz.loja==='ml'" class="dica">Mercado Livre: preço conferido pelo servidor às 8h, 12h, 16h e 20h.<span v-if="estado.erro"> Último erro: {{ estado.erro }}</span></p>
    <div class="linha-form">
      <input v-model="np.valor" class="cresce" inputmode="decimal" placeholder="Novo preço (R$)" :disabled="np.indisp" aria-label="Novo preço">
      <button class="btn" @click="registrarPreco">Registrar</button>
    </div>
    <label class="caixa-linha"><input type="checkbox" v-model="np.indisp"> Marcar como indisponível</label>
    <h2 class="rotulo">Registros</h2>
    <div class="on-regs"><div v-for="p in registros" :key="p.id"><span class="suave">{{ fmtD(p.em.slice(0,10)) }} · {{ p.origem==='auto' ? 'automático' : 'manual' }}</span><b class="num">{{ p.valor==null ? 'indisponível' : fmtR(p.valor) }}</b><button v-if="p.origem==='manual'" class="btn-x" aria-label="Apagar registro" @click="apagarPreco(p)">×</button></div></div>
    <div class="grade-2">
      <button class="btn" :disabled="!dz.url" @click="abrirLink(dz.url)">Abrir na loja</button>
      <button class="btn primario" @click="abrirComprei">Comprei</button>
    </div>
    <button class="btn" @click="editarDesejo(dz)">Editar desejo</button>
  </template>

  <template v-else-if="tela.tipo==='pedido' && pz">
    <button class="voltar" @click="voltar">‹ Pedidos</button>
    <div><strong class="on-titulo">{{ pz.nome }}</strong><div class="on-sub"><span class="on-loja" :class="'lj-' + pz.loja">{{ L[pz.loja] }}</span><span class="suave">comprado em {{ fmtD(pz.compra) }} · {{ fmtR(pz.valor) }}</span></div></div>
    <div v-if="pz.etapa >= 0" class="on-etapas">
      <div v-for="(e,k) in ETAPAS" :key="e" class="on-etapa" :class="{ feito: k < pz.etapa, atual: k===pz.etapa, neg: k===pz.etapa && pz.atraso }"><span class="bola"></span><span>{{ ST[e] }}</span><span class="suave">{{ k===0 ? fmtD(pz.compra) : k===3 && pz.entregueEm ? fmtD(pz.entregueEm) : '' }}</span></div>
    </div>
    <p v-else class="on-selo cinza esq">{{ ST[pz.status] }}</p>
    <div class="on-infos">
      <div><span>Prazo prometido</span><b class="num">{{ fmtD(pz.prazo) }}</b></div>
      <div><span>Situação</span><b :class="pz.atraso ? 'neg' : pz.aberto ? 'pos' : ''">{{ pz.atraso ? pz.atraso + (pz.atraso===1 ? ' dia' : ' dias') + ' de atraso' : pz.aberto ? 'No prazo' : ST[pz.status] }}</b></div>
      <div><span>Devolução até</span><b :class="{ alerta: pz.devolveDias != null }">{{ pz.devolveAte ? fmtD(pz.devolveAte) : '7 dias após a entrega' }}</b></div>
      <div><span>Garantia até</span><b>{{ pz.garantiaAte ? fmtD(pz.garantiaAte) : 'não informada' }}</b></div>
    </div>
    <div class="on-rastreio"><span class="suave">Rastreio</span><b class="num">{{ pz.rastreio || '—' }}</b>
      <button v-if="pz.rastreio" class="btn mini" @click="copiar(pz.rastreio)">Copiar</button>
      <button class="btn mini" @click="abrirLink(pz.url || 'https://rastreamento.correios.com.br/app/index.php')">{{ pz.url ? 'Abrir pedido' : 'Correios' }}</button></div>
    <button v-if="pz.aberto" class="btn primario largo" @click="avancar">Marcar como {{ ST[ETAPAS[pz.etapa + 1]].toLowerCase() }}</button>
    <div v-if="pz.status==='entregue'" class="grade-2"><button class="btn" @click="fe.aberto=false; marcar('devolvido')">Devolvido</button><button class="btn" @click="editarPedido(pz)">Garantia / editar</button></div>
    <div v-else class="grade-2"><button class="btn" @click="editarPedido(pz)">Editar</button><button v-if="pz.aberto" class="btn perigo" @click="marcar('cancelado')">Cancelado</button></div>
  </template>

  <Modal v-if="fd.aberto" :titulo="fd.id ? 'Editar desejo' : 'Novo desejo'" @fechar="fd.aberto=false">
    <label class="campo">Link do produto <input v-model="fd.url" inputmode="url" placeholder="cole o link aqui"></label>
    <p class="dica">{{ fd.url ? 'Loja: ' + L[lojaFd] + (lojaFd==='ml' ? ' · preço automático' : ' · preço manual') : 'A loja é reconhecida pelo link.' }}</p>
    <button v-if="lojaFd==='ml' && fd.url && !fd.id" class="btn" :disabled="fd.buscando" @click="buscarML">{{ fd.buscando ? 'Buscando…' : 'Buscar nome e preço no Mercado Livre' }}</button>
    <label class="campo">Nome <input v-model="fd.nome"></label>
    <div class="grade-2">
      <label v-if="!fd.id" class="campo">Preço atual <input v-model="fd.preco" inputmode="decimal"></label>
      <label class="campo">Preço-alvo <input v-model="fd.alvo" inputmode="decimal"></label>
    </div>
    <div class="campo"><span>Prioridade</span><div class="chips"><button v-for="(n,k) in PRIOS" :key="k" class="chip" :class="{ ativo: fd.prio===k }" @click="fd.prio=k">{{ n }}</button></div></div>
    <div class="acoes"><button v-if="fd.id" class="btn perigo" @click="excluirDesejo">Excluir</button><span class="espaco"></span><button class="btn" @click="fd.aberto=false">Cancelar</button><button class="btn primario" @click="salvarDesejo">Salvar</button></div>
  </Modal>

  <Modal v-if="fc.aberto" titulo="Comprei" @fechar="fc.aberto=false">
    <div class="grade-2">
      <label class="campo">Valor pago <input v-model="fc.valor" inputmode="decimal"></label>
      <label class="campo">Data da compra <input type="date" v-model="fc.compra"></label>
    </div>
    <label class="campo">Prazo de entrega (opcional) <input type="date" v-model="fc.prazo"></label>
    <label class="caixa-linha"><input type="checkbox" v-model="fc.lancar"> Lançar o gasto em Finanças (abre já preenchido)</label>
    <div class="acoes"><button class="btn" @click="fc.aberto=false">Cancelar</button><button class="btn primario" @click="confirmarComprei">Confirmar</button></div>
  </Modal>

  <Modal v-if="fp.aberto" :titulo="fp.id ? 'Editar pedido' : 'Novo pedido'" @fechar="fp.aberto=false">
    <label class="campo">Produto <input v-model="fp.nome"></label>
    <label class="campo">Link do pedido ou produto (opcional) <input v-model="fp.url" inputmode="url"></label>
    <div class="grade-2">
      <label class="campo">Valor <input v-model="fp.valor" inputmode="decimal"></label>
      <label class="campo">Data da compra <input type="date" v-model="fp.compra"></label>
      <label class="campo">Prazo prometido <input type="date" v-model="fp.prazo"></label>
      <label class="campo">Código de rastreio <input v-model="fp.rastreio"></label>
    </div>
    <label class="campo">Status <select v-model="fp.status"><option v-for="(n,k) in ST" :key="k" :value="k">{{ n }}</option></select></label>
    <label class="campo">Garantia até (opcional) <input type="date" v-model="fp.garantiaAte"></label>
    <div class="acoes"><button v-if="fp.id" class="btn perigo" @click="excluirPedido">Excluir</button><span class="espaco"></span><button class="btn" @click="fp.aberto=false">Cancelar</button><button class="btn primario" @click="salvarPedido">Salvar</button></div>
  </Modal>

  <Modal v-if="fe.aberto" titulo="Pedido entregue" @fechar="fe.aberto=false">
    <div class="grade-2">
      <label class="campo">Entregue em <input type="date" v-model="fe.data"></label>
      <label class="campo">Garantia (meses) <input v-model="fe.garantiaMeses" inputmode="numeric"></label>
    </div>
    <p class="dica">Devolução por arrependimento: até 7 dias após a entrega. Garantia legal mínima de produtos duráveis: 3 meses (0 = não acompanhar).</p>
    <label class="caixa-linha"><input type="checkbox" v-model="fe.somar"> Somar ao Estoque</label>
    <template v-if="fe.somar">
      <label class="campo">Item do estoque <select v-model="fe.itemId"><option value="">— novo item —</option><option v-for="i in itensEstoque" :key="i.id" :value="i.id">{{ i.nome }} ({{ i.unidade }})</option></select></label>
      <label v-if="!fe.itemId" class="campo">Nome do novo item <input v-model="fe.novoNome"></label>
      <label class="campo">Quantidade <input v-model="fe.qtd" inputmode="decimal"></label>
    </template>
    <div class="acoes"><button class="btn" @click="fe.aberto=false">Cancelar</button><button class="btn primario" @click="confirmarEntregue">Confirmar</button></div>
  </Modal>

  <Modal v-if="fs.aberto" titulo="Servidor (Cloudflare)" @fechar="fs.aberto=false">
    <p class="dica">Necessário só para o Mercado Livre automático. Siga o GUIA-CLOUDFLARE.md que veio no pacote.</p>
    <label class="campo">Endereço do servidor <input v-model="fs.url" inputmode="url" placeholder="https://organizador-online.SEU-NOME.workers.dev"></label>
    <label class="campo">Chave do app (a mesma CHAVE_APP do Cloudflare) <input v-model="fs.segredo" type="password" autocomplete="off"></label>
    <p class="dica">A chave fica neste aparelho e na pasta privada do app no seu Google Drive.</p>
    <button class="btn" :disabled="fs.testando" @click="testarServidor">{{ fs.testando ? 'Testando…' : 'Salvar e testar' }}</button>
    <div v-if="fs.status" class="on-status">
      <template v-if="fs.status.erro"><b class="neg">Erro: {{ fs.status.erro }}</b></template>
      <template v-else>
        <span>Servidor: <b class="pos">conectado ✓</b></span>
        <span>Mercado Livre: <b :class="fs.status.ml ? 'pos' : 'alerta'">{{ fs.status.ml ? 'conectado ✓' : 'não conectado' }}</b></span>
        <span v-if="fs.status.ultima" class="suave">Última verificação: {{ new Date(fs.status.ultima.em).toLocaleString('pt-BR') }}{{ fs.status.ultima.erros?.length ? ' · ' + fs.status.ultima.erros.length + ' erro(s)' : '' }}</span>
        <button class="btn primario" @click="conectarML">{{ fs.status.ml ? 'Reconectar Mercado Livre' : 'Conectar Mercado Livre' }}</button>
        <button class="btn" @click="atualizarAgora">Atualizar preços agora</button>
      </template>
    </div>
    <div class="acoes"><button class="btn" @click="fs.aberto=false">Fechar</button></div>
  </Modal>
  </div>`
};
