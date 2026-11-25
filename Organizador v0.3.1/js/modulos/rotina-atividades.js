// Rotina > Atividades: todas as atividades num lugar só (criar, editar, desativar, excluir, sugestões).
import { computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';

const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default {
  setup() {
    const r = inject('rot');
    const hoje = computed(() => r.hoje.value);
    function resumo(a) {
      if (a.agua) return 'Todos os dias · concluída automaticamente';
      const v = R.versaoEm(a.versoes, hoje.value) || a.versoes[a.versoes.length - 1] || {};
      if (a.tipo === 'semanal') return `${v.vezes}x por semana${v.aleatoria ? ' · aleatória (surpresa)' : ''}`;
      const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => v.horarios?.[d]);
      const txtDias = dias.length === 7 ? 'Todos os dias' : dias.map((d) => R.DIAS[d].slice(0, 3)).join(', ');
      const hs = [...new Set(dias.flatMap((d) => v.horarios[d]))].filter(Boolean).sort();
      return txtDias + (hs.length ? ' · ' + (a.modoHora === 'as' ? 'às ' : 'até ') + hs.join(', ') : '');
    }
    const vivas = computed(() => r.atividades.value.filter((a) => !a.excluido));
    const ativas = computed(() => vivas.value.filter((a) => !a.desativadoEm || a.desativadoEm > hoje.value)
      .sort((a, b) => (a.agua - b.agua) || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((a) => ({ a, resumo: resumo(a), outra: a.outraPessoa })));
    const desativadas = computed(() => vivas.value.filter((a) => a.desativadoEm && a.desativadoEm <= hoje.value).map((a) => ({ a, resumo: resumo(a) })));
    const sugestoes = computed(() => {
      const nomes = new Set(vivas.value.filter((a) => !a.desativadoEm).map((a) => a.nome.toLowerCase()));
      return R.SUGESTOES.filter((s) => !nomes.has(s.nome.toLowerCase()));
    });
    async function adicionar(nome) { await R.adicionarSugestoes([nome]); avisar(`${nome} adicionada`); }
    async function desativar(a) {
      if (!confirm(`Desativar "${a.nome}"? Ela some da rotina a partir de hoje, mas o histórico fica guardado.`)) return;
      await R.desativar(a.id); avisar('Atividade desativada');
    }
    async function excluir(a) {
      if (!confirm(`EXCLUIR "${a.nome}" DE VEZ?\n\nO histórico dela será apagado de todos os dias, percentuais e falhas. Isso não pode ser desfeito.`)) return;
      await R.excluirDeVez(a.id); avisar('Atividade excluída');
    }
    return { r, ativas, desativadas, sugestoes, adicionar, desativar, excluir, LETRAS };
  },
  template: `
  <div class="pilha">
    <button class="btn primario largo" @click="r.editar()">+ Nova atividade</button>
    <h2 class="rotulo">Ativas · {{ ativas.length }}</h2>
    <div v-for="x in ativas" :key="x.a.id" class="linha">
      <button class="linha-info" @click="r.editar(x.a)">
        <strong>{{ x.a.nome }}</strong>
        <span class="suave">{{ x.resumo }}{{ x.outra ? ' · ' + x.outra + ' pode fazer' : '' }}</span>
      </button>
      <button v-if="!x.a.agua" class="btn" @click="desativar(x.a)">Desativar</button>
    </div>
    <template v-if="sugestoes.length">
      <h2 class="rotulo">Sugestões (da sua lista)</h2>
      <div v-for="s in sugestoes" :key="s.nome" class="linha tracejada">
        <span class="linha-info"><strong>{{ s.nome }}</strong><span class="suave">{{ s.tipo === 'semanal' ? s.vezes + 'x por semana' : 'Todos os dias' }}</span></span>
        <button class="btn" @click="adicionar(s.nome)">+ Adicionar</button>
      </div>
    </template>
    <template v-if="desativadas.length">
      <h2 class="rotulo">Desativadas (histórico guardado)</h2>
      <div v-for="x in desativadas" :key="x.a.id" class="linha apagada">
        <span class="linha-info"><strong>{{ x.a.nome }}</strong><span class="suave">desde {{ x.a.desativadoEm.split('-').reverse().join('/') }}</span></span>
        <button class="btn perigo" @click="excluir(x.a)">Excluir de vez</button>
      </div>
    </template>
    <p class="dica">Desativar mantém o histórico. “Excluir de vez” só aparece para desativadas e apaga o histórico.</p>
  </div>`
};
