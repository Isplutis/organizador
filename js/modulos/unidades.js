// Unidades de medida do estoque + seletor (lista com "Outra…").
export const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'dz'];

// Lista de unidades (mostra todas) + "Outra…" para digitar uma unidade livre.
export const SeletorUnidade = {
  props: { modelValue: String, rotulo: { type: String, default: 'Unidade' } },
  emits: ['update:modelValue'],
  data() { return { outra: !!this.modelValue && !UNIDADES.includes(this.modelValue), UNIDADES }; },
  methods: {
    escolher(v) { if (v === '__outra') { this.outra = true; this.$emit('update:modelValue', ''); } else this.$emit('update:modelValue', v); },
    voltar() { this.outra = false; this.$emit('update:modelValue', 'un'); }
  },
  template: `
  <select v-if="!outra" :value="modelValue" @change="escolher($event.target.value)" :aria-label="rotulo">
    <option v-for="u in UNIDADES" :key="u" :value="u">{{ u }}</option>
    <option value="__outra">Outra…</option>
  </select>
  <span v-else class="un-outra"><input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" placeholder="unidade" :aria-label="rotulo" autofocus><button type="button" class="btn-x" @click="voltar" aria-label="Voltar para a lista">×</button></span>`
};
