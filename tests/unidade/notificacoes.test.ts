import { describe, expect, it } from 'vitest'
import { Erro } from '../../src/server/erros'
import {
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  TIPOS_NOTIFICACAO,
  comporTexto,
  validarConsulta,
} from '../../src/server/servicos/notificacoes'

// SPEC/2026-11-19-notificacoes.md — regras puras: texto (R-NT7) e consulta (R-NT6, R-NT9)

describe('comporTexto (R-NT7)', () => {
  it('conquista', () => {
    expect(comporTexto('conquista_desbloqueada', { nome: 'Primeira aula' })).toEqual({
      titulo: 'Nova conquista!',
      mensagem: 'Você desbloqueou "Primeira aula".',
    })
  })

  it.each([
    [0, 'Você cumpriu "Maratona".'],
    [1, 'Você cumpriu "Maratona" e ganhou 1 moeda.'],
    [15, 'Você cumpriu "Maratona" e ganhou 15 moedas.'],
    [undefined, 'Você cumpriu "Maratona".'],
  ])('missão com %s moedas', (moedas, mensagem) => {
    expect(comporTexto('missao_cumprida', { nome: 'Maratona', moedas })).toEqual({
      titulo: 'Missão cumprida!',
      mensagem,
    })
  })

  it('item comprado e novo nível', () => {
    expect(comporTexto('item_comprado', { nome: 'Moldura Ouro' })).toEqual({
      titulo: 'Compra realizada',
      mensagem: 'Moldura Ouro já está no seu inventário.',
    })
    expect(comporTexto('nivel_alcancado', { nivel: 4 }).mensagem).toBe('Você chegou ao nível 4.')
    expect(comporTexto('nivel_alcancado', {}).mensagem).toBe('Você chegou ao nível 1.')
  })

  it('nomes longos são cortados em 120 caracteres', () => {
    const { mensagem } = comporTexto('conquista_desbloqueada', { nome: 'x'.repeat(300) })
    expect(mensagem).toBe(`Você desbloqueou "${'x'.repeat(117)}...".`)
  })

  it('todo tipo tem rótulo para as preferências', () => {
    expect(Object.keys(TIPOS_NOTIFICACAO).sort()).toEqual([
      'conquista_desbloqueada',
      'item_comprado',
      'missao_cumprida',
      'nivel_alcancado',
    ])
  })
})

function status(query: unknown): number {
  try {
    validarConsulta(query)
    return 200
  } catch (erro) {
    return (erro as Erro).status
  }
}

describe('validarConsulta (R-NT6, R-NT9)', () => {
  it('sem parâmetros: limite padrão e todas as notificações', () => {
    expect(validarConsulta({})).toEqual({ limite: LIMITE_PADRAO, apenasNaoLidas: false })
    expect(validarConsulta(undefined)).toEqual({ limite: LIMITE_PADRAO, apenasNaoLidas: false })
  })

  it('aceita os limites exatos e o filtro', () => {
    expect(validarConsulta({ limite: '1' }).limite).toBe(1)
    expect(validarConsulta({ limite: String(LIMITE_MAXIMO) }).limite).toBe(LIMITE_MAXIMO)
    expect(validarConsulta({ apenasNaoLidas: 'true' }).apenasNaoLidas).toBe(true)
    expect(validarConsulta({ apenasNaoLidas: 'false' }).apenasNaoLidas).toBe(false)
  })

  it.each([
    ['limite zero', { limite: '0' }],
    ['limite acima do máximo', { limite: String(LIMITE_MAXIMO + 1) }],
    ['limite fracionário', { limite: '2.5' }],
    ['limite negativo', { limite: '-1' }],
    ['limite textual', { limite: 'muitos' }],
    ['limite repetido', { limite: ['1', '2'] }],
    ['filtro inválido', { apenasNaoLidas: 'sim' }],
    ['parâmetro desconhecido', { pagina: '2' }],
  ])('rejeita %s com 400', (_rotulo, query) => {
    expect(status(query)).toBe(400)
  })
})
