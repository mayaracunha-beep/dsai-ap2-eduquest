import { useEffect, useState } from 'react'
import { api } from './cliente'
import type { Aparencia } from './tiposAparencia'

// aparência do usuário logado para o cabeçalho (F11-02); recarrega a cada troca de página, para refletir
// uma moldura recém-equipada, e nunca atrapalha a navegação se a consulta falhar
export function useAparencia(autenticado: boolean, vista: string) {
  const [aparencia, setAparencia] = useState<Aparencia | null>(null)

  useEffect(() => {
    if (!autenticado) {
      setAparencia(null)
      return
    }
    let atual = true
    api<Aparencia>('/api/v1/aparencia')
      .then((resposta) => {
        if (atual) setAparencia(resposta)
      })
      .catch(() => undefined)
    return () => {
      atual = false
    }
  }, [autenticado, vista])

  return [aparencia, setAparencia] as const
}
