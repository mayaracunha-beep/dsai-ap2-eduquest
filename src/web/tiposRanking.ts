// SPEC/2026-11-19-rankings.md §4 — tipos e rótulos compartilhados dos rankings (D11)

export type MetricaRanking = 'xp' | 'aulas_concluidas'
export type EscopoRanking = 'global' | 'curso'
export type PeriodoRanking = 'semana' | 'total'
export type ParticipacaoRanking = 'anonimo' | 'apelido' | 'oculto'

export interface EntradaRanking {
  posicao: number
  nome: string
  valor: number
  voce: boolean
}

export interface RespostaRanking {
  metrica: { chave: MetricaRanking; rotulo: string; unidade: string }
  escopo: { tipo: 'global' } | { tipo: 'curso'; cursoId: string; cursoTitulo: string }
  periodo: { tipo: 'semana'; inicio: string; fim: string } | { tipo: 'total' }
  geradoEm: string
  totalParticipantes: number
  entradas: EntradaRanking[]
  voce: { posicao: number; valor: number } | null
}

export interface PreferenciaRanking {
  participacao: ParticipacaoRanking
  apelido: string | null
}

export const METRICAS_RANKING: { valor: MetricaRanking; rotulo: string }[] = [
  { valor: 'xp', rotulo: 'XP' },
  { valor: 'aulas_concluidas', rotulo: 'Aulas concluídas' },
]

export const PERIODOS_RANKING: { valor: PeriodoRanking; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Semana atual' },
  { valor: 'total', rotulo: 'Desde o início' },
]

export const OPCOES_PARTICIPACAO: { valor: ParticipacaoRanking; rotulo: string; ajuda: string }[] = [
  { valor: 'anonimo', rotulo: 'Anônimo', ajuda: 'Aparece como "Estudante" com um código.' },
  { valor: 'apelido', rotulo: 'Com apelido', ajuda: 'Aparece com o apelido que você escolher.' },
  { valor: 'oculto', rotulo: 'Oculto', ajuda: 'Não aparece nos rankings.' },
]

export function ordinal(posicao: number): string {
  return `${posicao}º`
}

export function montarConsulta(
  metrica: MetricaRanking,
  periodo: PeriodoRanking,
  cursoId: string | null
): string {
  const params = new URLSearchParams({ metrica, periodo })
  if (cursoId) {
    params.set('escopo', 'curso')
    params.set('cursoId', cursoId)
  }
  return `/api/v1/rankings?${params.toString()}`
}
