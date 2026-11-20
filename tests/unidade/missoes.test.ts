import { describe, expect, it } from 'vitest'
import { Erro } from '../../src/server/erros'
import { LIMITES, statusDaMissao, validarAjuste, validarNovaMissao } from '../../src/server/servicos/missoes'

// SPEC/2026-11-19-missoes.md — regras puras de validação e de janela (R-MS1, R-MS5, R-MS7, R-MS8)

const AGORA = new Date('2026-11-19T12:00:00.000Z')
const HORA = 60 * 60 * 1000
const iso = (deslocamento: number) => new Date(AGORA.getTime() + deslocamento).toISOString()

const valida = () => ({
  titulo: 'Estudo da semana',
  descricao: 'Conclua aulas.',
  tipo: 'aulas_concluidas',
  meta: 3,
  inicio: iso(-HORA),
  fim: iso(HORA),
  recompensaMoedas: 10,
})

function status(corpo: unknown, ajuste = false): number {
  try {
    if (ajuste) validarAjuste(corpo, { inicio: new Date(iso(-HORA)), fim: new Date(iso(HORA)) }, AGORA)
    else validarNovaMissao(corpo, AGORA)
    return 200
  } catch (erro) {
    return (erro as Erro).status
  }
}

describe('statusDaMissao (R-MS5)', () => {
  const missao = { inicio: new Date(iso(-HORA)), fim: new Date(iso(HORA)) }

  it('futura antes do início, em andamento no início, encerrada exatamente no fim', () => {
    expect(statusDaMissao(missao, new Date(iso(-2 * HORA)))).toBe('futura')
    expect(statusDaMissao(missao, missao.inicio)).toBe('em_andamento')
    expect(statusDaMissao(missao, AGORA)).toBe('em_andamento')
    expect(statusDaMissao(missao, missao.fim)).toBe('encerrada')
    expect(statusDaMissao(missao, new Date(iso(2 * HORA)))).toBe('encerrada')
  })
})

describe('validarNovaMissao (R-MS1)', () => {
  it('aceita uma missão válida, normaliza texto e assume escopo global', () => {
    const dados = validarNovaMissao({ ...valida(), titulo: '  Estudo  ' }, AGORA)
    expect(dados).toMatchObject({ titulo: 'Estudo', tipo: 'aulas_concluidas', meta: 3, recompensaMoedas: 10, cursoId: null })
    expect(dados.inicio.toISOString()).toBe(iso(-HORA))
  })

  it('descrição é opcional', () => {
    const { descricao: _descricao, ...semDescricao } = valida()
    expect(validarNovaMissao(semDescricao, AGORA).descricao).toBe('')
  })

  it.each([
    ['título vazio', { titulo: '   ' }],
    ['título acima do limite', { titulo: 'x'.repeat(LIMITES.tituloMax + 1) }],
    ['título não textual', { titulo: 5 }],
    ['descrição acima do limite', { descricao: 'x'.repeat(LIMITES.descricaoMax + 1) }],
    ['tipo desconhecido', { tipo: 'voar' }],
    ['tipo ausente', { tipo: undefined }],
    ['meta zero', { meta: 0 }],
    ['meta acima do limite', { meta: LIMITES.metaMax + 1 }],
    ['meta fracionária', { meta: 1.5 }],
    ['meta textual', { meta: '3' }],
    ['recompensa negativa', { recompensaMoedas: -1 }],
    ['recompensa acima do limite', { recompensaMoedas: LIMITES.recompensaMax + 1 }],
    ['recompensa fracionária', { recompensaMoedas: 2.5 }],
    ['início inválido', { inicio: 'ontem' }],
    ['fim inválido', { fim: 123 }],
    ['fim igual ao início', { fim: iso(-HORA) }],
    ['fim anterior ao início', { fim: iso(-2 * HORA) }],
    ['fim já passado', { inicio: iso(-3 * HORA), fim: iso(-HORA) }],
    ['cursoId não textual', { cursoId: 7 }],
    ['campo desconhecido', { ativa: true }],
  ])('rejeita %s com 400', (_rotulo, alteracao) => {
    expect(status({ ...valida(), ...alteracao })).toBe(400)
  })

  it.each([[null], [[]], ['texto'], [42]])('rejeita corpo %j com 400', (corpo) => {
    expect(status(corpo)).toBe(400)
  })

  it('aceita os limites exatos', () => {
    const dados = validarNovaMissao(
      { ...valida(), meta: LIMITES.metaMax, recompensaMoedas: 0, titulo: 'x'.repeat(LIMITES.tituloMax) },
      AGORA
    )
    expect(dados.meta).toBe(LIMITES.metaMax)
    expect(validarNovaMissao({ ...valida(), recompensaMoedas: LIMITES.recompensaMax }, AGORA).recompensaMoedas).toBe(1000)
  })
})

describe('validarAjuste (R-MS7, R-MS8)', () => {
  it('converte para as colunas e aceita ajuste parcial', () => {
    const ajuste = validarAjuste(
      { titulo: ' Novo ', descricao: '', recompensaMoedas: 0, ativa: false, fim: iso(3 * HORA) },
      { inicio: new Date(iso(-HORA)), fim: new Date(iso(HORA)) },
      AGORA
    )
    expect(ajuste).toMatchObject({ titulo: 'Novo', descricao: '', recompensa_moedas: 0, ativa: false })
    expect(ajuste.fim?.toISOString()).toBe(iso(3 * HORA))
  })

  it.each([
    ['corpo vazio', {}],
    ['campo imutável: tipo', { tipo: 'xp_ganho' }],
    ['campo imutável: meta', { meta: 9 }],
    ['campo imutável: inicio', { inicio: iso(0) }],
    ['campo imutável: cursoId', { cursoId: 'x' }],
    ['título vazio', { titulo: '' }],
    ['recompensa inválida', { recompensaMoedas: -5 }],
    ['ativa não booleana', { ativa: 'sim' }],
    ['fim inválido', { fim: 'amanhã' }],
    ['fim no passado', { fim: iso(-HORA / 2) }],
    ['fim antes do início', { fim: iso(-2 * HORA) }],
  ])('rejeita %s com 400', (_rotulo, corpo) => {
    expect(status(corpo, true)).toBe(400)
  })

  it('missão encerrada não aceita novo fim (409), mas aceita desativar', () => {
    const encerrada = { inicio: new Date(iso(-3 * HORA)), fim: new Date(iso(-HORA)) }
    expect(() => validarAjuste({ fim: iso(HORA) }, encerrada, AGORA)).toThrowError(/encerrada/)
    try {
      validarAjuste({ fim: iso(HORA) }, encerrada, AGORA)
    } catch (erro) {
      expect((erro as Erro).status).toBe(409)
    }
    expect(validarAjuste({ ativa: false }, encerrada, AGORA)).toEqual({ ativa: false })
  })
})
