// SPEC/2026-11-19-notificacoes.md §5 — tipos compartilhados das notificações (D13)

export type TipoNotificacao = 'conquista_desbloqueada' | 'missao_cumprida' | 'item_comprado' | 'nivel_alcancado'

export interface Notificacao {
  notificacaoId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  lida: boolean
  criadaEm: string
  lidaEm: string | null
}

export interface RespostaNotificacoes {
  naoLidas: number
  notificacoes: Notificacao[]
}

export interface PreferenciaNotificacao {
  tipo: TipoNotificacao
  rotulo: string
  ativa: boolean
}

// texto acessível do botão do menu: só cita a contagem quando há não lidas
export function rotuloDoMenu(naoLidas: number): string {
  if (naoLidas <= 0) return 'Notificações'
  return `Notificações (${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'})`
}
