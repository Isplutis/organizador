// Viagem: período em que só as atividades escolhidas aparecem e nada conta nos percentuais.
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';

export default {
  components: { Modal },
  props: { viagem: Object },
  emits: ['fechar'],
  setup(props, { emit }) {
    const r = inject('rot');
    const ontem = R.somaDias(r.hoje.value, -1);
    const v = props.viagem;
    const nova = !v.id;
    const f = reactive({ inicio: v.inicio < ontem && nova ? ontem : v.inicio, fim: v.fim || v.inicio, atividades: [...(v.atividades || [])] });
    const inicioTravado = !nova && v.inicio < ontem; // começou antes de ontem: só o fim pode mudar
    const candidatas = computed(() => {
      const c = r.calc.value, mapa = new Map();
      if (!f.inicio || !f.fim || f.fim < f.inicio) return [];
      for (let s = f.inicio, n = 0; s <= f.fim && n < 62; s = R.somaDias(s, 1), n++) for (const a of c.candidatasViagem(s)) mapa.set(a.id, a);
      return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });
    const alternar = (id) => { const i = f.atividades.indexOf(id); if (i >= 0) f.atividades.splice(i, 1); else f.atividades.push(id); };
    async function salvar() {
      if (!f.inicio || !f.fim) return avisar('Informe início e fim');
      if (!inicioTravado && f.inicio < ontem) return avisar('Só é possível marcar viagem a partir de ontem');
      if (f.fim < f.inicio) return avisar('O fim deve ser depois do início');
      if (f.fim < ontem) return avisar('O fim não pode ser antes de ontem');
      if (R.difDias(f.fim, f.inicio) > 60) return avisar('Máximo de 60 dias por viagem');
      const conflito = r.calc.value.trips.some((t) => t.id !== v.id && t.inicio <= f.fim && f.inicio <= t.fim);
      if (conflito) return avisar('Já existe viagem nesse período');
      const ids = new Set(candidatas.value.map((a) => a.id));
      await R.salvarViagem({ id: v.id, inicio: f.inicio, fim: f.fim, atividades: f.atividades.filter((id) => ids.has(id)) });
      avisar('Viagem salva'); emit('fechar');
    }
    async function excluir() {
      if (!confirm('Excluir esta viagem? Os dias voltam a contar nos percentuais.')) return;
      await R.excluirViagem(v.id); avisar('Viagem excluída'); emit('fechar');
    }
    return { f, nova, ontem, inicioTravado, candidatas, alternar, salvar, excluir };
  },
  template: `
  <Modal :titulo="nova ? 'Marcar viagem' : 'Editar viagem'" @fechar="$emit('fechar')">
    <div class="grade-2">
      <label class="campo">Início <input type="date" v-model="f.inicio" :min="ontem" :disabled="inicioTravado"></label>
      <label class="campo">Fim <input type="date" v-model="f.fim" :min="f.inicio > ontem ? f.inicio : ontem"></label>
    </div>
    <span class="suave">Atividades que você fará nesses dias:</span>
    <p v-if="!candidatas.length" class="suave">Nenhuma atividade no período.</p>
    <label v-for="a in candidatas" :key="a.id" class="entre opcao" :class="{ travada: inicioTravado }">
      <span>{{ a.nome }}</span>
      <input type="checkbox" class="check-g" :checked="f.atividades.includes(a.id)" :disabled="inicioTravado" @change="alternar(a.id)">
    </label>
    <p class="dica">Os dias de viagem ficam verde-água no calendário e não contam em nenhum percentual nem nas falhas.{{ inicioTravado ? ' Viagem já iniciada: só o fim pode mudar.' : '' }}</p>
    <div class="acoes">
      <button v-if="!nova && !inicioTravado" class="btn perigo" @click="excluir">Excluir</button>
      <span class="espaco"></span>
      <button class="btn" @click="$emit('fechar')">Cancelar</button>
      <button class="btn primario" @click="salvar">Salvar</button>
    </div>
  </Modal>`
};
