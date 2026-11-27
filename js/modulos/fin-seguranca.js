// Finanças › ⚙ › Segurança: trocar senha, nova chave de recuperação, digital neste aparelho, bloquear agora.
import { ref, reactive } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as C from '../servicos/cripto-servico.js';
import { Regras } from './fin-senha.js';

export default {
  components: { Modal, Regras },
  setup() {
    const e = C.estado;
    const ts = reactive({ aberto: false, atual: '', nova: '', conf: '', ocupado: false });
    async function trocar() {
      if (ts.nova !== ts.conf) return avisar('As senhas não conferem');
      ts.ocupado = true; try { await C.trocarSenha(ts.atual, ts.nova); Object.assign(ts, { aberto: false, atual: '', nova: '', conf: '' }); avisar('Senha trocada'); } catch (x) { avisar(x.message); } ts.ocupado = false;
    }
    const nr = reactive({ aberto: false, senha: '', chave: '', confirmar: null, conf4: '', ocupado: false });
    async function gerarRec() { nr.ocupado = true; try { const r = await C.novaRecuperacao(nr.senha); Object.assign(nr, { chave: r.recuperacao, confirmar: r.confirmar, senha: '' }); } catch (x) { avisar(x.message); } nr.ocupado = false; }
    async function salvarRec() { if (C.normRec(nr.conf4) !== C.normRec(nr.chave).slice(0, 4)) return avisar('Os 4 primeiros caracteres não conferem'); await nr.confirmar(); Object.assign(nr, { aberto: false, chave: '', confirmar: null, conf4: '' }); avisar('Nova chave de recuperação ativa. A antiga deixou de valer.'); }
    const dig = ref(false);
    async function ativarDig() { dig.value = true; try { await C.ativarDigital(); avisar('Digital ativada neste aparelho'); } catch (x) { avisar(x.name === 'NotAllowedError' ? 'Cancelado' : x.message); } dig.value = false; }
    function desativarDig() { C.desativarDigital(); avisar('Digital desativada neste aparelho'); }
    return { e, ts, trocar, nr, gerarRec, salvarRec, dig, ativarDig, desativarDig, bloquear: C.bloquear, baixarRec: C.baixarRecuperacao, suporta: C.suportaPasskey() };
  },
  template: `
  <div class="caixa pilha">
    <b>🔐 Segurança</b>
    <small class="suave">Finanças fica cifrada no aparelho, no Drive e no backup. Bloqueia sozinha depois de 15 min fora do app.</small>
    <button class="btn" @click="bloquear">Bloquear agora</button>
    <button class="btn" @click="ts.aberto = true">Trocar senha</button>
    <button class="btn" @click="nr.aberto = true">Gerar nova chave de recuperação</button>
    <template v-if="suporta">
      <button v-if="!e.digitalAqui" class="btn" :disabled="dig" @click="ativarDig">{{ dig ? 'Aguardando a digital…' : '☝ Ativar digital neste aparelho' }}</button>
      <button v-else class="btn" @click="desativarDig">Desativar digital neste aparelho</button>
      <small class="suave">A digital vale só neste aparelho e usa uma passkey salva pelo Android/Google. A senha continua funcionando.</small>
    </template>
    <small v-else class="suave">Este navegador não oferece digital (passkeys).</small>

    <Modal v-if="ts.aberto" titulo="Trocar senha" @fechar="ts.aberto=false">
      <label class="campo">Senha atual <input type="password" v-model="ts.atual" autocomplete="current-password"></label>
      <label class="campo">Nova senha <input type="password" v-model="ts.nova" autocomplete="new-password"></label>
      <Regras :senha="ts.nova"></Regras>
      <label class="campo">Repita a nova senha <input type="password" v-model="ts.conf" autocomplete="new-password"></label>
      <div class="acoes"><button class="btn" @click="ts.aberto=false">Cancelar</button><button class="btn primario" :disabled="ts.ocupado" @click="trocar">{{ ts.ocupado ? 'Trocando…' : 'Trocar' }}</button></div>
    </Modal>
    <Modal v-if="nr.aberto" titulo="Nova chave de recuperação" @fechar="nr.aberto=false">
      <template v-if="!nr.chave">
        <p class="dica">A chave antiga deixa de valer quando você confirmar a nova.</p>
        <label class="campo">Sua senha <input type="password" v-model="nr.senha" autocomplete="current-password"></label>
        <div class="acoes"><button class="btn" @click="nr.aberto=false">Cancelar</button><button class="btn primario" :disabled="nr.ocupado || !nr.senha" @click="gerarRec">{{ nr.ocupado ? 'Gerando…' : 'Gerar' }}</button></div>
      </template>
      <template v-else>
        <div class="chave-rec">{{ nr.chave }}</div>
        <button class="btn" @click="baixarRec(nr.chave)">Baixar .txt</button>
        <label class="campo">Digite os 4 primeiros caracteres <input v-model="nr.conf4" maxlength="4" autocapitalize="characters"></label>
        <div class="acoes"><button class="btn" @click="nr.aberto=false; nr.chave=''">Cancelar</button><button class="btn primario" @click="salvarRec">Confirmar</button></div>
      </template>
    </Modal>
  </div>`
};
