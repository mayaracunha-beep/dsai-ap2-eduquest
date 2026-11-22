import { useEffect, useRef, useState } from 'react'

// SPEC/2026-11-19-painel-acessibilidade.md §3 (R-AC1, R-AC2) — foco, título e anúncio na troca de página

// leva o foco ao título principal da página (ou, sem título, ao conteúdo principal)
export function focarConteudo(): boolean {
  const alvo = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
  if (!alvo) return false
  if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1')
  alvo.focus()
  return true
}

/**
 * Atualiza o título do documento e, a cada troca de página depois da primeira, move o foco e
 * devolve o texto do anúncio para a região `aria-live`. Só age depois que a sessão carregou.
 */
export function useAcessibilidadeDeRota(titulo: string, ativo: boolean): string {
  const anterior = useRef<string | null>(null)
  const [anuncio, setAnuncio] = useState('')

  useEffect(() => {
    if (!ativo) return
    document.title = `${titulo} — EduQuest`
    if (anterior.current === null) {
      anterior.current = titulo
      return
    }
    if (anterior.current === titulo) return
    anterior.current = titulo
    setAnuncio(`Página: ${titulo}`)
    focarConteudo()
  }, [titulo, ativo])

  return anuncio
}
