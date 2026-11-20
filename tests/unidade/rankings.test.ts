import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Erro } from '../../src/server/erros'
import { pseudonimo, validarConsulta } from '../../src/server/servicos/rankings'

// SPEC/2026-11-19-rankings.md — regras puras: validação da consulta (R-RK11) e pseudônimo (R-RK6)

const cursoId = randomUUID()

function status(query: unknown): number {
  try {
    validarConsulta(query)
    return 200
  } catch (erro) {
    return (erro as Erro).status
  }
}

describe('validarConsulta (R-RK11)', () => {
  it('sem parâmetros usa xp, global e semana', () => {
    expect(validarConsulta({})).toEqual({ metrica: 'xp', escopo: 'global', cursoId: null, periodo: 'semana' })
    expect(validarConsulta(undefined)).toEqual({ metrica: 'xp', escopo: 'global', cursoId: null, periodo: 'semana' })
  })

  it('aceita todas as combinações válidas', () => {
    for (const metrica of ['xp', 'aulas_concluidas']) {
      for (const periodo of ['semana', 'total']) {
        expect(validarConsulta({ metrica, periodo, escopo: 'curso', cursoId })).toEqual({
          metrica,
          periodo,
          escopo: 'curso',
          cursoId,
        })
      }
    }
  })

  it.each([
    ['métrica desconhecida', { metrica: 'nivel' }],
    ['métrica repetida (lista)', { metrica: ['xp', 'xp'] }],
    ['escopo desconhecido', { escopo: 'turma' }],
    ['período desconhecido', { periodo: 'mes' }],
    ['escopo curso sem cursoId', { escopo: 'curso' }],
    ['cursoId malformado', { escopo: 'curso', cursoId: 'abc' }],
    ['cursoId com escopo global', { cursoId }],
    ['parâmetro desconhecido', { limite: '5' }],
  ])('rejeita %s com 400', (_rotulo, query) => {
    expect(status(query)).toBe(400)
  })
})

describe('pseudonimo (R-RK6)', () => {
  it('tem o formato "Estudante XXXXXX" e é estável para o mesmo id', () => {
    const id = randomUUID()
    expect(pseudonimo(id)).toMatch(/^Estudante [0-9A-F]{6}$/)
    expect(pseudonimo(id)).toBe(pseudonimo(id))
  })

  it('não contém o identificador e varia entre estudantes', () => {
    const ids = Array.from({ length: 50 }, () => randomUUID())
    const rotulos = new Set(ids.map(pseudonimo))
    expect(rotulos.size).toBeGreaterThan(45)
    for (const id of ids) expect(pseudonimo(id)).not.toContain(id.slice(0, 6))
  })
})
