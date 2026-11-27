// Mais / Configurações: atalhos, sincronização com o Google Drive, sobre.
import { ref, computed, watch } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, agora as agoraISO } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as B from '../servicos/backup-servico.js';
import { gcal, ativarCalendar, desativarCalendar, sincronizarCalendar } from '../gcal.js';
import { sync, conectar, resolverPrimeira, desconectar, sincronizar, carregarLogin, ID_FIXO } from '../sync.js';

export const VERSAO = '0.16.1';

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
    // Início da contagem da rotina
    const inicioCont = vivo(() => db.meta.get('inicioContagem'), null);
    const inicioData = ref('');
    watch(inicioCont, (v) => { inicioData.value = v?.data || ''; }, { immediate: true });
    async function salvarInicio() {
      await db.meta.put({ chave: 'inicioContagem', data: inicioData.value || '', atualizadoEm: agoraISO() });
      avisar(inicioData.value ? 'Contagem começa em ' + inicioData.value.split('-').reverse().join('/') : 'Contagem sem data de início');
    }
    // Backup manual
    const bkUlt = ref(B.ultimoBackup());
    const bk = ref(null); // resumo do arquivo lido
    let bkDados = null;   // dados brutos (fora do Vue: o IndexedDB não aceita objetos reativos)
    async function baixar() { const n = await B.baixarBackup(); bkUlt.value = B.ultimoBackup(); avisar(`Backup baixado (${n} registros). Guarde o arquivo em local seguro.`); }
    async function escolherArquivo(e) {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      try { const r = await B.lerArquivo(f); bkDados = r.dados; bk.value = { total: r.total, geradoEm: r.geradoEm }; } catch (err) { avisar('Não foi possível ler: ' + err.message); }
    }
    async function restaurar(modo) {
      if (modo === 'substituir' && !confirm('Isso APAGA os dados atuais deste aparelho e coloca os do arquivo. Continuar?')) return;
      try { await B.restaurar(bkDados, modo); avisar(modo === 'substituir' ? 'Dados substituídos pelo backup' : 'Backup juntado aos dados atuais'); }
      catch (err) { avisar('Erro ao restaurar: ' + err.message); }
      bk.value = null; bkDados = null;
    }
    const fmtData = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : 'nunca';
    const calOcupado = ref(false);
    async function ligarCal() {
      if (!sync.conectado) return avisar('Conecte primeiro a sincronização com o Google (acima)');
      calOcupado.value = true; try { await ativarCalendar(); avisar(gcal.estado === 'ok' ? 'Google Agenda conectada' : gcal.msg); } catch (e) { avisar('Erro: ' + e.message); } calOcupado.value = false;
    }
    async function calAgora() { calOcupado.value = true; await sincronizarCalendar({ interativo: true, forcar: true }); calOcupado.value = false; avisar(gcal.msg || 'Pronto'); }
    function desligarCal() { if (!confirm('Parar de enviar e ler a Google Agenda neste aparelho? (Os eventos já criados continuam na agenda “Organizador”; para removê-los, apague essa agenda no Google.)')) return; desativarCalendar(); avisar('Google Agenda desligada'); }
    const calUlt = computed(() => gcal.ultimo ? new Date(gcal.ultimo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
    return { gcal, calOcupado, ligarCal, calAgora, desligarCal, calUlt, bkUlt, bk, baixar, escolherArquivo, restaurar, fmtData, inicioData, salvarInicio, ID_FIXO, persistente, VERSAO, sync, clientId, ocupado, pergunta, ligar, escolher, agora, sair, ultimoTxt, estadoTxt };
  },
  template: `
  <section class="pilha">
    <p class="dica">Estoque, lista e categorias: Compras. Finanças: ícone de ajustes dentro da aba. Atividades da rotina: Rotina › Atividades.</p>

    <h2 class="rotulo">Rotina</h2>
    <div class="caixa pilha">
      <div class="linha-form"><label class="campo cresce">Início da contagem <input type="date" v-model="inicioData" @change="salvarInicio"></label>
        <button v-if="inicioData" class="btn alinhar-base" @click="inicioData=''; salvarInicio()">Sem data</button></div>
      <p class="dica">Antes dessa data as atividades aparecem e podem ser marcadas (teste), mas não contam em percentuais nem nas falhas. Deixe vazio para contar desde a criação de cada atividade.</p>
    </div>

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

    <h2 class="rotulo">Google Agenda (lembretes)</h2>
    <div class="caixa pilha">
      <template v-if="!gcal.ativo">
        <p class="dica">Envia para uma agenda chamada “Organizador” no seu Google Agenda: compromissos, aniversários, contas e faturas (só nomes), assinaturas, entregas, devoluções, garantias, provas e prazos — com aviso no celular mesmo com o app fechado. Também mostra os eventos das suas outras agendas na Agenda do app.</p>
        <button class="btn primario" :disabled="calOcupado" @click="ligarCal">{{ calOcupado ? 'Conectando…' : 'Conectar Google Agenda' }}</button>
      </template>
      <template v-else>
        <div class="entre"><span>{{ ({ ok: '✓ Conectada', sincronizando: 'Sincronizando…', reconectar: 'Reconectar', erro: 'Erro', offline: 'Offline' })[gcal.estado] || 'Conectada' }}</span><span class="suave">último: {{ calUlt }}</span></div>
        <p v-if="gcal.msg" class="dica">{{ gcal.msg }}</p>
        <div class="acoes"><button class="btn" @click="desligarCal">Desligar</button><button class="btn primario" :disabled="calOcupado" @click="calAgora">Sincronizar agenda agora</button></div>
        <p class="dica">Atualiza sozinha ao abrir o app e a cada 30 min. Avisos: contas/entregas na véspera e no dia às 9h; compromissos 1 dia e 1 h antes.</p>
      </template>
    </div>

    <h2 class="rotulo">Backup manual</h2>
    <div class="caixa pilha">
      <div class="entre"><span>Último backup neste aparelho</span><b>{{ fmtData(bkUlt) }}</b></div>
      <button class="btn primario" @click="baixar">Baixar backup agora</button>
      <label class="btn btn-arquivo">Restaurar de um arquivo…<input type="file" accept=".json,application/json" @change="escolherArquivo"></label>
      <p class="dica">O arquivo tem TODOS os seus dados. Finanças vai cifrada (só abre com a sua senha ou a chave de recuperação); o resto vai legível: guarde em local seguro (ex.: uma pasta sua no Drive ou no PC) e não envie a ninguém. Lembrete no Início a cada 30 dias.</p>
    </div>

    <h2 class="rotulo">Sobre</h2>
    <p class="suave">Versão {{ VERSAO }} · Armazenamento persistente: {{ persistente }}</p>

    <Modal v-if="bk" titulo="Restaurar backup" @fechar="bk=null">
      <p>Arquivo de {{ fmtData(bk.geradoEm.slice(0,10)) }} com {{ bk.total }} registros.</p>
      <button class="btn primario largo" @click="restaurar('juntar')">Juntar com os dados atuais (seguro)</button>
      <button class="btn perigo largo" @click="restaurar('substituir')">Substituir tudo pelos dados do arquivo</button>
      <p class="dica">“Juntar” só acrescenta o que falta e atualiza o que for mais recente no arquivo; nada é apagado. Com a sincronização ligada, o resultado vai para o Drive em seguida.</p>
      <div class="acoes"><button class="btn" @click="bk=null">Cancelar</button></div>
    </Modal>

    <Modal v-if="pergunta" titulo="Já existem dados neste aparelho e na nuvem" @fechar="pergunta=false">
      <p>O que fazer com os dados deste aparelho?</p>
      <button class="btn primario largo" @click="escolher('nuvem')">Usar só os da nuvem (apaga os deste aparelho)</button>
      <button class="btn largo" @click="escolher('juntar')">Juntar os dois</button>
      <p class="dica">Recomendado: “usar só os da nuvem” se este é o seu segundo aparelho. “Juntar” pode duplicar atividades cadastradas nos dois.</p>
    </Modal>
  </section>`
};
