// Tela de Finanças bloqueada: criação da senha (migração do PIN), desbloqueio, digital e recuperação.
import { ref, reactive, computed, markRaw } from '../../lib/vue.esm-browser.prod.js';
import { avisar } from '../ui.js';
import * as C from '../servicos/cripto-servico.js';
import { baixarBackup } from '../servicos/backup-servico.js';

export const Regras = {
  props: { senha: String },
  setup: (p) => ({ f: computed(() => C.forcaSenha(p.senha || '')) }),
  template: `<ul class="regras-senha"><li :class="{ ok: f.tam }">10+ caracteres</li><li :class="{ ok: f.letra }">letra</li><li :class="{ ok: f.num }">número</li><li :class="{ ok: f.simb }">símbolo (!@#…)</li></ul>`
};

export default {
  components: { Regras },
  props: { amp: String },
  setup() {
    const e = C.estado;
    const ver = ref(false);
    // ---------- desbloquear ----------
    const senha = ref(''), erro = ref(''), ocupado = ref(false);
    async function entrar() { if (!senha.value) return; ocupado.value = true; erro.value = ''; try { await C.desbloquear(senha.value); senha.value = ''; } catch (x) { erro.value = x.message; } ocupado.value = false; }
    async function digital() { erro.value = ''; try { await C.desbloquearDigital(); } catch (x) { erro.value = x.name === 'NotAllowedError' ? 'Digital cancelada.' : x.message; } }
    // ---------- recuperação ----------
    const rec = reactive({ aberto: false, chave: '', nova: '', conf: '' });
    async function recuperar() {
      if (rec.nova !== rec.conf) return (erro.value = 'As senhas não conferem');
      ocupado.value = true; erro.value = '';
      try { await C.desbloquearComRecuperacao(rec.chave, rec.nova); Object.assign(rec, { aberto: false, chave: '', nova: '', conf: '' }); avisar('Senha nova definida. Finanças aberta.'); } catch (x) { erro.value = x.message; }
      ocupado.value = false;
    }
    // ---------- criação (primeira vez) ----------
    const cr = reactive({ passo: 1, s1: '', s2: '', prep: null, conf4: '', guardei: false, feito: 0 });
    const podeSenha = computed(() => C.forcaSenha(cr.s1).ok && cr.s1 === cr.s2);
    async function backup() { try { const n = await baixarBackup(); avisar(`Backup baixado (${n} registros)`); } catch (x) { avisar('Erro no backup: ' + x.message); } }
    async function gerar() { ocupado.value = true; erro.value = ''; try { cr.prep = markRaw(await C.configurar(cr.s1)); cr.passo = 3; } catch (x) { erro.value = x.message; } ocupado.value = false; }
    const confere = computed(() => cr.prep && C.normRec(cr.conf4) === C.normRec(cr.prep.recuperacao).slice(0, 4));
    async function copiar() { try { await navigator.clipboard.writeText(cr.prep.recuperacao); avisar('Chave copiada'); } catch { avisar('Não consegui copiar: anote manualmente'); } }
    async function concluir() {
      ocupado.value = true; erro.value = '';
      try { cr.feito = await C.ativar(cr.prep); cr.prep = null; avisar('Proteção ativada. Para usar a digital: ⚙ › Segurança.'); } catch (x) { erro.value = x.message; }
      ocupado.value = false;
    }
    const temPinAntigo = (() => { try { return !!localStorage.getItem('finPin'); } catch { return false; } })();
    return { e, ver, senha, erro, ocupado, entrar, digital, rec, recuperar, cr, podeSenha, backup, gerar, confere, copiar, concluir, temPinAntigo, baixarRec: C.baixarRecuperacao, temDigital: C.temDigital };
  },
  template: `
  <section class="pin-tela senha-tela">
    <span class="pin-amp" v-html="amp"></span>
    <h2 class="pin-titulo">Finanças</h2>

    <!-- PRIMEIRA VEZ: criar a senha -->
    <template v-if="!e.ativo">
      <template v-if="cr.passo===1">
        <p class="centro">{{ temPinAntigo ? 'O PIN de 4 dígitos vai ser trocado por uma senha longa, e seus dados de Finanças passam a ficar cifrados no aparelho, no Drive e no backup.' : 'Crie uma senha longa para proteger Finanças. Os dados ficam cifrados no aparelho, no Drive e no backup.' }}</p>
        <div class="caixa pilha-p aviso-senha"><b>⚠️ Importante</b><small>Sem a senha e sem a chave de recuperação, os dados de Finanças não podem ser recuperados por ninguém.</small><small>Atualize o app nos outros aparelhos antes de continuar.</small></div>
        <button class="btn largo" @click="backup">1. Baixar backup antes (recomendado)</button>
        <button class="btn primario largo" @click="cr.passo=2">2. Criar a senha</button>
      </template>
      <template v-else-if="cr.passo===2">
        <label class="campo largo-c">Nova senha <span class="campo-voz"><input :type="ver ? 'text' : 'password'" v-model="cr.s1" autocomplete="new-password" autofocus><button class="btn-voz" @click="ver=!ver" :aria-label="ver ? 'Esconder' : 'Mostrar'">{{ ver ? '🙈' : '👁' }}</button></span></label>
        <Regras :senha="cr.s1"></Regras>
        <label class="campo largo-c">Repita a senha <input :type="ver ? 'text' : 'password'" v-model="cr.s2" autocomplete="new-password" @keyup.enter="podeSenha && gerar()"></label>
        <small v-if="cr.s2 && cr.s1 !== cr.s2" class="neg">As senhas não conferem</small>
        <p v-if="erro" class="alerta">{{ erro }}</p>
        <div class="acoes"><button class="btn" @click="cr.passo=1">Voltar</button><button class="btn primario" :disabled="!podeSenha || ocupado" @click="gerar">{{ ocupado ? 'Gerando…' : 'Continuar' }}</button></div>
      </template>
      <template v-else-if="cr.passo===3">
        <p class="centro">Esta é sua <b>chave de recuperação</b>. Ela abre Finanças se você esquecer a senha. Ela aparece só agora.</p>
        <div class="chave-rec" aria-label="Chave de recuperação">{{ cr.prep.recuperacao }}</div>
        <div class="grade-2"><button class="btn" @click="copiar">Copiar</button><button class="btn" @click="baixarRec(cr.prep.recuperacao)">Baixar .txt</button></div>
        <small class="suave centro">Guarde fora do celular: gerenciador de senhas, pendrive ou papel.</small>
        <label class="campo largo-c">Para confirmar, digite os 4 primeiros caracteres <input v-model="cr.conf4" maxlength="4" autocapitalize="characters" autocomplete="off"></label>
        <label class="caixa-linha"><input type="checkbox" v-model="cr.guardei"> Guardei a chave em local seguro</label>
        <p v-if="erro" class="alerta">{{ erro }}</p>
        <button class="btn primario largo" :disabled="!confere || !cr.guardei || ocupado" @click="concluir">{{ ocupado ? 'Protegendo seus dados…' : 'Ativar a proteção' }}</button>
      </template>
    </template>

    <!-- JÁ CONFIGURADA: desbloquear -->
    <template v-else-if="!rec.aberto">
      <p class="suave">Digite a senha de Finanças</p>
      <label class="campo largo-c"><span class="campo-voz"><input :type="ver ? 'text' : 'password'" v-model="senha" autocomplete="current-password" aria-label="Senha" @keyup.enter="entrar" autofocus><button class="btn-voz" @click="ver=!ver" :aria-label="ver ? 'Esconder' : 'Mostrar'">{{ ver ? '🙈' : '👁' }}</button></span></label>
      <p v-if="erro" class="alerta">{{ erro }}</p>
      <button class="btn primario largo" :disabled="!senha || ocupado" @click="entrar">{{ ocupado ? 'Abrindo…' : 'Entrar' }}</button>
      <button v-if="e.digitalAqui" class="btn largo" @click="digital">☝ Usar a digital</button>
      <button class="btn-link" @click="rec.aberto=true; erro=''">Esqueci a senha</button>
    </template>
    <template v-else>
      <p class="centro">Digite a chave de recuperação e crie uma senha nova.</p>
      <label class="campo largo-c">Chave de recuperação <input v-model="rec.chave" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX-…"></label>
      <label class="campo largo-c">Nova senha <input :type="ver ? 'text' : 'password'" v-model="rec.nova" autocomplete="new-password"></label>
      <Regras :senha="rec.nova"></Regras>
      <label class="campo largo-c">Repita a nova senha <input :type="ver ? 'text' : 'password'" v-model="rec.conf" autocomplete="new-password"></label>
      <p v-if="erro" class="alerta">{{ erro }}</p>
      <div class="acoes"><button class="btn" @click="rec.aberto=false; erro=''">Voltar</button><button class="btn primario" :disabled="ocupado" @click="recuperar">{{ ocupado ? 'Verificando…' : 'Redefinir' }}</button></div>
    </template>
  </section>`
};
