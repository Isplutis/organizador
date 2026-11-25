// Mais / Configurações: atalhos, sincronização com o Google Drive, sobre.
import { ref, computed } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import { sync, conectar, resolverPrimeira, desconectar, sincronizar, carregarLogin, ID_FIXO } from '../sync.js';

export const VERSAO = '0.3.3';

export default {
  components: { Modal },
  emits: ['ir'],
  setup() {
    const persistente = ref('verificando…');
    navigator.storage?.persisted?.().then((p) => { persistente.value = p ? 'sim' : 'não (o navegador pode limpar se faltar espaço)'; });
    const clientId = ref(sync.clientId);
    const ocupado = ref(false);
    const pergunta = ref(false);
    carregarLogin().catch(() => {}); // deixa o login pronto antes do toque

    async function ligar() {
      if (!/\.apps\.googleusercontent\.com$/.test(clientId.value.trim())) return avisar('ID inválido: deve terminar com .apps.googleusercontent.com');
      ocupado.value = true;
      try {
        const r = await conectar(clientId.value);
        if (r.perguntar) pergunta.value = true; else avisar('Conectado e sincronizado');
      } catch (e) { avisar(e.message); } finally { ocupado.value = false; }
    }
    async function escolher(op) {
      pergunta.value = false; ocupado.value = true;
      try { await resolverPrimeira(op); avisar('Sincronizado'); } catch (e) { avisar(e.message); } finally { ocupado.value = false; }
    }
    async function agora() { await sincronizar({ interativo: true }); if (sync.estado === 'ok') avisar('Sincronizado'); else if (sync.msg) avisar(sync.msg); }
    function sair() { if (confirm('Desconectar deste aparelho? Os dados continuam aqui e no Drive.')) desconectar(); }
    const ultimoTxt = computed(() => sync.ultimo ? new Date(sync.ultimo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
    const estadoTxt = computed(() => ({ ok: 'Sincronizado', sincronizando: 'Sincronizando…', reconectar: 'Precisa reconectar ao Google', offline: 'Sem internet — sincroniza quando voltar', erro: 'Erro: ' + sync.msg, desconectado: 'Desconectado' })[sync.estado]);
    return { ID_FIXO, persistente, VERSAO, sync, clientId, ocupado, pergunta, ligar, escolher, agora, sair, ultimoTxt, estadoTxt };
  },
  template: `
  <section class="pilha">
    <div class="atalhos">
      <button class="linha" @click="$emit('ir','estudos')"><strong>Estudos</strong><span class="suave">Etapa futura</span></button>
      <button class="linha" @click="$emit('ir','atividades')"><strong>Atividades</strong><span class="suave">Etapa futura</span></button>
    </div>
    <p class="dica">Categorias do estoque: Estoque › Categorias. Atividades da rotina: Rotina › Atividades.</p>

    <h2 class="rotulo">Sincronização (Google Drive)</h2>
    <div v-if="!sync.conectado" class="caixa pilha">
      <label v-if="!ID_FIXO" class="campo">ID do cliente Google <input v-model="clientId" placeholder="xxxx.apps.googleusercontent.com" autocomplete="off"></label>
      <button class="btn primario" :disabled="ocupado" @click="ligar">{{ ocupado ? 'Conectando…' : 'Conectar ao Google' }}</button>
      <p class="dica">Os dados ficam numa pasta oculta do seu Drive que só este app enxerga. Uma janela do Google vai pedir sua autorização.</p>
    </div>
    <div v-else class="caixa pilha">
      <div class="entre"><span>{{ estadoTxt }}</span><span class="suave">último: {{ ultimoTxt }}</span></div>
      <div class="acoes"><button class="btn" @click="sair">Desconectar</button><button class="btn primario" :disabled="sync.estado==='sincronizando'" @click="agora">Sincronizar agora</button></div>
      <p class="dica">Sincroniza sozinho ao abrir o app, ao voltar a internet e alguns segundos depois de cada alteração. A cada ~1 hora o Google pode pedir para reconectar (toque no aviso no topo).</p>
    </div>

    <h2 class="rotulo">Sobre</h2>
    <p class="suave">Versão {{ VERSAO }} · Armazenamento persistente: {{ persistente }}</p>

    <Modal v-if="pergunta" titulo="Já existem dados neste aparelho e na nuvem" @fechar="pergunta=false">
      <p>O que fazer com os dados deste aparelho?</p>
      <button class="btn primario largo" @click="escolher('nuvem')">Usar só os da nuvem (apaga os deste aparelho)</button>
      <button class="btn largo" @click="escolher('juntar')">Juntar os dois</button>
      <p class="dica">Recomendado: “usar só os da nuvem” se este é o seu segundo aparelho. “Juntar” pode duplicar atividades cadastradas nos dois.</p>
    </Modal>
  </section>`
};
