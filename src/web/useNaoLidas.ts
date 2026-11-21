import { useEffect, useState } from 'react'
import { api } from './cliente'
import type { RespostaNotificacoes } from './tiposNotificacao'

// contador do menu (F9-01): só para estudante; falha de rede nunca atrapalha a navegação
export function useNaoLidas(ativo: boolean, vista: string) {
  const [naoLidas, setNaoLidas] = useState(0)

  useEffect(() => {
    if (!ativo) {
      setNaoLidas(0)
      return
    }
    let atual = true
    api<RespostaNotificacoes>('/api/v1/notificacoes?limite=1')
      .then((resposta) => {
        if (atual) setNaoLidas(resposta.naoLidas)
      })
      .catch(() => undefined)
    return () => {
      atual = false
    }
  }, [ativo, vista])

  return [naoLidas, setNaoLidas] as const
}
