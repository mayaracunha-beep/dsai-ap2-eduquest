import { describe, expect, it } from 'vitest'
import { XP_POR_MOEDA, moedasPorXp } from '../../src/server/servicos/moedas'

// SPEC/2026-11-19-moedas-loja-inventario.md — MO-02 (R-M1): moedas = floor(xp / 5)

describe('moedasPorXp (R-M1)', () => {
  it('abaixo do limiar não gera moeda', () => {
    expect(moedasPorXp(0)).toBe(0)
    expect(moedasPorXp(XP_POR_MOEDA - 1)).toBe(0)
  })

  it.each([
    [5, 1],
    [9, 1],
    [10, 2],
    [19, 3],
    [20, 4],
    [1000, 200],
  ])('%i XP → %i moedas (arredonda para baixo)', (xp, moedas) => {
    expect(moedasPorXp(xp)).toBe(moedas)
  })

  it('XP negativo nunca vira moeda', () => {
    expect(moedasPorXp(-50)).toBe(0)
  })
})
