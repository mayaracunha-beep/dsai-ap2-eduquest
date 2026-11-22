// SPEC/2026-11-19-painel-acessibilidade.md §4 — tipos do painel do estudante (F10-01)

import type { TipoMissao } from './tiposMissao'

export interface MissaoDoPainel {
  missaoId: string
  titulo: string
  tipo: TipoMissao
  meta: number
  progresso: number
  fim: string
  recompensaMoedas: number
}

export interface CursoDoPainel {
  cursoId: string
  titulo: string
  aulasConcluidas: number
  aulasTotal: number
  percentual: number
}

export interface RespostaPainel {
  geradoEm: string
  xp: { xpTotal: number; xpSemana: number; nivel: number; xpNivelAtual: number; xpProximoNivel: number }
  moedas: { saldo: number }
  missoes: MissaoDoPainel[]
  conquistas: {
    desbloqueadas: number
    total: number
    recentes: { codigo: string; nome: string; desbloqueadaEm: string }[]
  }
  notificacoes: {
    naoLidas: number
    recentes: { notificacaoId: string; titulo: string; mensagem: string; criadaEm: string }[]
  }
  ranking: { posicao: number | null; valor: number | null; totalParticipantes: number }
  cursos: CursoDoPainel[]
}

// percentual de avanço dentro do nível atual (0 a 100), sem dividir por zero
export function percentualDoNivel(xp: RespostaPainel['xp']): number {
  const faixa = xp.xpProximoNivel - xp.xpNivelAtual
  if (faixa <= 0) return 0
  const dentro = Math.min(Math.max(xp.xpTotal - xp.xpNivelAtual, 0), faixa)
  return Math.floor((dentro * 100) / faixa)
}
