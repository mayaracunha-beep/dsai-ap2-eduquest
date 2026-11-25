import { describe, expect, it } from 'vitest'
import { Erro } from '../../src/server/erros'
import {
  AVATARES,
  NOME_MAXIMO,
  avatarPorId,
  equipadosDe,
  validarAvatar,
  validarNome,
} from '../../src/server/servicos/aparencia'

// SPEC/2026-11-21-nome-avatar-moldura.md — regras puras: nome (R-AV2), catálogo (R-AV3) e equipados (R-AV4)

function status(acao: () => unknown): number {
  try {
    acao()
    return 200
  } catch (erro) {
    return (erro as Erro).status
  }
}

describe('validarNome (R-AV2)', () => {
  it('remove espaços das pontas e preserva acentos e espaços internos', () => {
    expect(validarNome('  Maria da Conceição  ')).toBe('Maria da Conceição')
    expect(validarNome('Zé')).toBe('Zé')
  })

  it('aceita o tamanho exato do limite', () => {
    expect(validarNome('x'.repeat(NOME_MAXIMO))).toHaveLength(NOME_MAXIMO)
  })

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['acima do limite', 'x'.repeat(NOME_MAXIMO + 1)],
    ['com @', 'maria@exemplo.com'],
    ['com quebra de linha', 'Ma\nria'],
    ['com tabulação', 'Ma\tria'],
    ['com caractere nulo', 'Ma\u0000ria'],
    ['número', 42],
    ['nulo', null],
    ['indefinido', undefined],
    ['lista', ['Maria']],
  ])('rejeita nome %s com 400', (_rotulo, valor) => {
    expect(status(() => validarNome(valor))).toBe(400)
  })
})

describe('catálogo de avatares (R-AV3)', () => {
  it('tem 12 opções com código único, rótulo, emoji e cor hexadecimal', () => {
    expect(AVATARES).toHaveLength(12)
    expect(new Set(AVATARES.map((a) => a.id)).size).toBe(12)
    for (const avatar of AVATARES) {
      expect(avatar.rotulo.length).toBeGreaterThan(0)
      expect(avatar.emoji.length).toBeGreaterThan(0)
      expect(avatar.cor).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('validarAvatar aceita só códigos do catálogo', () => {
    expect(validarAvatar('raposa')).toBe('raposa')
    for (const invalido of ['dinossauro', '', 'RAPOSA', 7, null, undefined, { id: 'raposa' }]) {
      expect(status(() => validarAvatar(invalido))).toBe(400)
    }
  })

  it('avatarPorId resolve o objeto completo ou null', () => {
    expect(avatarPorId('coruja')).toMatchObject({ id: 'coruja', rotulo: 'Coruja' })
    expect(avatarPorId('nao-existe')).toBeNull()
    expect(avatarPorId(null)).toBeNull()
    expect(avatarPorId(undefined)).toBeNull()
  })
})

describe('equipadosDe (R-AV4)', () => {
  const posse = (codigo: string, categoria: string, equipado: boolean) => ({ codigo, nome: `Nome ${codigo}`, categoria, equipado })

  it('devolve a moldura e o título equipados', () => {
    const resultado = equipadosDe([
      posse('moldura-ouro', 'moldura', true),
      posse('titulo-lenda', 'titulo', true),
      posse('moldura-prata', 'moldura', false),
    ])
    expect(resultado).toEqual({
      moldura: { codigo: 'moldura-ouro', nome: 'Nome moldura-ouro' },
      titulo: { codigo: 'titulo-lenda', nome: 'Nome titulo-lenda' },
    })
  })

  it('sem equipados, ou sem inventário, devolve null', () => {
    expect(equipadosDe([])).toEqual({ moldura: null, titulo: null })
    expect(equipadosDe([posse('moldura-ouro', 'moldura', false)])).toEqual({ moldura: null, titulo: null })
  })

  it('um título equipado não vira moldura e vice-versa', () => {
    expect(equipadosDe([posse('titulo-lenda', 'titulo', true)])).toEqual({
      moldura: null,
      titulo: { codigo: 'titulo-lenda', nome: 'Nome titulo-lenda' },
    })
  })
})
