// Cadastro/edição de atividade da Rotina.
import { reactive, computed } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';

const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default {
  components: { Modal },
  props: { atividade: Object },
  emits: ['fechar'],
  setup(props, { emit }) {
    const a = props.atividade?.id ? props.atividade : null;
    const v = a ? R.versaoEm(a.versoes, R.hojeStr()) || a.versoes[a.versoes.length - 1] : null;
    const hor = v?.horarios || {};
    const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => !!hor[d] || !a);
    const lista = (d) => (hor[d] || []).filter(Boolean);
    const unicos = new Set([0, 1, 2, 3, 4, 5, 6].filter((d) => hor[d]).map((d) => lista(d).join(',')));
    const f = reactive({
      nome: a?.nome || '', tipo: a?.tipo || 'fixo', modoHora: a?.modoHora || 'ate', vezes: v?.vezes || 1, dias,
      aleatoria: !!v?.aleatoria, outraPessoa: a?.outraPessoa || '', temOutra: !!a?.outraPessoa,
      mesmo: unicos.size <= 1,
      horarios: [...(lista([0, 1, 2, 3, 4, 5, 6].find((d) => hor[d]) ?? 0))],
      porDia: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [...lista(d)]]))
    });
    const ehAgua = !!a?.agua;
    const resumo = computed(() => {
      const n = f.dias.filter(Boolean).length;
      return n === 7 ? 'Todos os dias' : n === 0 ? 'Nenhum dia selecionado' : R.DIAS.filter((_, i) => f.dias[i]).join(', ');
    });
    const diasSel = computed(() => [1, 2, 3, 4, 5, 6, 0].filter((d) => f.dias[d]));
    const add = (arr) => arr.push('');
    const rem = (arr, i) => arr.splice(i, 1);
    const limpa = (arr) => [...new Set(arr.filter(Boolean))].sort();

    async function salvar() {
      if (!f.nome.trim()) return avisar('Informe o nome');
      const dados = { id: a?.id, nome: f.nome, tipo: f.tipo, modoHora: f.modoHora, outraPessoa: f.temOutra ? f.outraPessoa : '' };
      if (f.temOutra && !f.outraPessoa.trim()) return avisar('Informe o nome da outra pessoa');
      if (!ehAgua) {
        if (f.tipo === 'semanal') {
          const n = parseInt(f.vezes, 10);
          if (!(n >= 1 && n <= 7)) return avisar('Vezes por semana: de 1 a 7');
          if (f.aleatoria && n > 3) return avisar('Aleatória: no máximo 3x por semana (mais que isso obriga dias seguidos)');
          dados.vezes = n; dados.aleatoria = f.aleatoria;
        } else {
          if (!diasSel.value.length) return avisar('Selecione pelo menos um dia');
          dados.horarios = {};
          for (const d of diasSel.value) dados.horarios[d] = limpa(f.mesmo ? f.horarios : f.porDia[d]);
        }
      }
      await R.salvarAtividade(dados);
      avisar(a ? 'Alteração vale de hoje em diante' : 'Atividade criada');
      emit('fechar');
    }
    async function desativar() {
      if (!confirm(`Desativar "${a.nome}"? O histórico continua guardado.`)) return;
      await R.desativar(a.id); avisar('Atividade desativada'); emit('fechar');
    }
    return { a, f, ehAgua, resumo, diasSel, add, rem, salvar, desativar, LETRAS, DIAS: R.DIAS };
  },
  template: `
  <Modal :titulo="a ? 'Editar atividade' : 'Nova atividade'" @fechar="$emit('fechar')">
    <label class="campo">Nome <input v-model="f.nome" :autofocus="!a"></label>
    <p v-if="ehAgua" class="dica">Água é diária e concluída automaticamente. Meta e recipientes ficam na aba Água.</p>
    <template v-else>
      <div v-if="!a" class="abas-seg dois">
        <button :class="{ ativo: f.tipo==='fixo' }" @click="f.tipo='fixo'">Dias fixos</button>
        <button :class="{ ativo: f.tipo==='semanal' }" @click="f.tipo='semanal'">X vezes/semana</button>
      </div>
      <template v-if="f.tipo==='fixo'">
        <span>{{ resumo }}</span>
        <div class="dias-alarme">
          <button v-for="(l, i) in LETRAS" :key="i" :class="{ on: f.dias[i] }" @click="f.dias[i]=!f.dias[i]" :aria-label="DIAS[i]" :aria-pressed="f.dias[i]">{{ l }}</button>
        </div>
        <div class="entre">
          <span class="suave">Horário (opcional)</span>
          <div class="abas-seg dois curto"><button :class="{ ativo: f.modoHora==='as' }" @click="f.modoHora='as'">às</button><button :class="{ ativo: f.modoHora==='ate' }" @click="f.modoHora='ate'">até</button></div>
        </div>
        <label class="entre"><span>Mesmo horário em todos os dias</span><input type="checkbox" v-model="f.mesmo" class="check-g"></label>
        <div v-if="f.mesmo" class="horarios">
          <span v-for="(h, i) in f.horarios" :key="i" class="hora-item"><input type="time" v-model="f.horarios[i]"><button class="btn-x" @click="rem(f.horarios, i)" aria-label="Remover horário">×</button></span>
          <button class="btn-tracejado mini" @click="add(f.horarios)">+ horário</button>
        </div>
        <template v-else>
          <div v-for="d in diasSel" :key="d" class="dia-hor">
            <span class="nome-dia">{{ DIAS[d] }}</span>
            <div class="horarios">
              <span v-for="(h, i) in f.porDia[d]" :key="i" class="hora-item"><input type="time" v-model="f.porDia[d][i]"><button class="btn-x" @click="rem(f.porDia[d], i)" aria-label="Remover horário">×</button></span>
              <button class="btn-tracejado mini" @click="add(f.porDia[d])">+</button>
            </div>
          </div>
        </template>
        <p class="dica">Cada horário vira uma marcação separada. Sem horário = uma marcação no dia.</p>
      </template>
      <template v-else>
        <label class="entre"><span>Meta: vezes por semana</span><input v-model="f.vezes" inputmode="numeric" class="qtd"></label>
        <label class="entre"><span>Aleatória (surpresa)</span><input type="checkbox" v-model="f.aleatoria" class="check-g"></label>
        <p v-if="f.aleatoria" class="dica">O app sorteia os dias da semana: nunca em dias seguidos e sem intervalo grande (ex.: 3x → seg, qui, sáb). Você só descobre no próprio dia. Aparece como atividade normal, com ✓/✕. Mudanças valem a partir da próxima semana. Máximo 3x.</p>
        <p v-else class="dica">Aparece em “Nesta semana”. Pode fazer mais vezes; conta falha se a semana fechar (domingo) abaixo da meta.</p>
      </template>
      <label class="entre"><span>Outra pessoa pode fazer</span><input type="checkbox" v-model="f.temOutra" class="check-g"></label>
      <label v-if="f.temOutra" class="campo">Nome da pessoa <input v-model="f.outraPessoa" placeholder="Ex.: Lavinia"></label>
      <p v-if="f.temOutra" class="dica">Aparece um 3º botão com a inicial. Conta como feita.</p>
      <p v-if="a" class="dica">Alterações valem de hoje em diante; o histórico não muda.</p>
    </template>
    <div class="acoes">
      <button v-if="a && !ehAgua && !a.desativadoEm" class="btn perigo" @click="desativar">Desativar</button>
      <span class="espaco"></span>
      <button class="btn" @click="$emit('fechar')">Cancelar</button>
      <button class="btn primario" @click="salvar">Salvar</button>
    </div>
  </Modal>`
};
