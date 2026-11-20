// SPEC/2026-11-19-missoes.md §5 — tipos e rótulos compartilhados das missões (D9)

export type TipoMissao = 'aulas_concluidas' | 'questoes_acertadas' | 'avaliacoes_entregues' | 'xp_ganho'
export type StatusMissao = 'em_andamento' | 'encerrada'

export interface MissaoBase {
  missaoId: string
  titulo: string
  descricao: string
  tipo: TipoMissao
  meta: number
  inicio: string
  fim: string
  recompensaMoedas: number
  escopo: { cursoId: string; cursoTitulo: string } | null
}

export interface MissaoDoEstudante extends MissaoBase {
  status: StatusMissao
  progresso: number
  cumprida: boolean
  cumpridaEm: string | null
}

export interface MissaoDeGestao extends MissaoBase {
  status: StatusMissao | 'futura'
  ativa: boolean
  cumpriram: number
}

export const TIPOS_MISSAO: { valor: TipoMissao; rotulo: string }[] = [
  { valor: 'aulas_concluidas', rotulo: 'Concluir aulas' },
  { valor: 'questoes_acertadas', rotulo: 'Acertar questões' },
  { valor: 'avaliacoes_entregues', rotulo: 'Entregar avaliações' },
  { valor: 'xp_ganho', rotulo: 'Ganhar XP' },
]

export const ROTULO_TIPO: Record<TipoMissao, string> = Object.fromEntries(
  TIPOS_MISSAO.map(({ valor, rotulo }) => [valor, rotulo])
) as Record<TipoMissao, string>

export const ROTULO_STATUS: Record<StatusMissao | 'futura', string> = {
  em_andamento: 'Em andamento',
  encerrada: 'Encerrada',
  futura: 'Ainda não começou',
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// R-MS2: o escopo é o curso da missão ou, sem curso, qualquer curso
export function descreverEscopo(escopo: MissaoBase['escopo']): string {
  return escopo ? `Curso: ${escopo.cursoTitulo}` : 'Todos os cursos'
}

// valor para <input type="datetime-local"> no fuso local
export function paraCampoDataHora(data: Date): string {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
