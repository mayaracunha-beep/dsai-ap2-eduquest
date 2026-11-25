import { vi } from 'vitest'

// utilitários compartilhados dos testes web novos: resposta JSON e fetch simulado com sessão

export const usuarioId = '44444444-4444-4444-8444-444444444444'

export function respostaJson(dados: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(dados) }
}

export type Especifico = (alvo: string, metodo: string) => unknown

// sessão do papel dado, perfil vazio e 404 para o que o teste não define
export function fetchSimulado(papel: string, especifico: Especifico = () => undefined) {
  return vi.fn(async (url: unknown, init?: { method?: string }) => {
    const alvo = String(url)
    const metodo = init?.method ?? 'GET'
    const resposta = especifico(alvo, metodo)
    if (resposta) return resposta
    if (alvo.includes('/auth/sessao')) {
      return respostaJson({ usuarioId, papel, expiraEm: new Date(Date.now() + 60_000).toISOString() })
    }
    if (alvo.includes('/perfis/')) return respostaJson({ id: usuarioId, papel, nivel: null, conquistas: [], inventario: [] })
    if (alvo.endsWith('/api/v1/xp')) {
      return respostaJson({ xpTotal: 0, xpSemana: 0, nivel: 1, xpNivelAtual: 0, xpProximoNivel: 100 })
    }
    return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'nao encontrado' } }, 404)
  })
}
