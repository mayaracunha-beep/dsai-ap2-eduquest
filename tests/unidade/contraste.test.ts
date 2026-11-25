import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contraste, luminancia, tokensDeCor } from '../utilidades/contraste'

// SPEC/2026-11-19-painel-acessibilidade.md — AC-03 (R-AC3): contraste AA nos tokens do tema real

const css = readFileSync('src/web/estilo.css', 'utf-8')
const tokens = tokensDeCor(css)
const MINIMO_AA = 4.5

// pares de texto sobre fundo realmente usados nas telas
const PARES: [string, string][] = [
  ['texto', 'fundo'],
  ['texto', 'superficie'],
  ['texto', 'sucesso-suave'],
  ['texto', 'primaria-suave'],
  ['texto-sec', 'superficie'],
  ['texto-sec', 'fundo'],
  ['texto-sec', 'superficie-alt'],
  ['primaria', 'superficie'],
  ['primaria', 'fundo'],
  ['primaria', 'primaria-suave'],
  ['primaria-escura', 'primaria-suave'],
  ['texto-invertido', 'primaria'],
  ['texto-invertido', 'primaria-escura'],
  ['sucesso', 'superficie'],
  ['sucesso', 'sucesso-suave'],
  ['aviso', 'superficie'],
  ['aviso', 'aviso-suave'],
  ['erro', 'superficie'],
  ['erro', 'erro-suave'],
]

describe('funções de contraste (WCAG)', () => {
  it('preto sobre branco é 21:1 e a razão é simétrica', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('cores iguais têm razão 1', () => {
    expect(contraste('#2563eb', '#2563eb')).toBeCloseTo(1, 5)
  })

  it('luminância de preto e branco', () => {
    expect(luminancia('#000000')).toBe(0)
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5)
  })

  it('rejeita cor fora do formato #rrggbb', () => {
    expect(() => luminancia('azul')).toThrow(/cor invalida/)
    expect(() => luminancia('#fff')).toThrow(/cor invalida/)
  })

  it('um par conhecido ruim fica abaixo de AA (o teste não é vazio)', () => {
    expect(contraste('#9ca3af', '#ffffff')).toBeLessThan(MINIMO_AA)
  })
})

describe('tokens de cor do tema', () => {
  it('o CSS declara os tokens usados nos pares', () => {
    for (const nome of new Set(PARES.flat())) expect(tokens[nome], `token --${nome}`).toBeTruthy()
  })

  it.each(PARES)('--%s sobre --%s atende WCAG AA (≥ 4,5:1)', (texto, fundo) => {
    expect(contraste(tokens[texto], tokens[fundo])).toBeGreaterThanOrEqual(MINIMO_AA)
  })
})
