// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../../src/web/App'
import { descreverEstoque, formatarMoedas } from '../../src/web/tiposLoja'

// SPEC/2026-11-19-moedas-loja-inventario.md §6 — web de moedas, loja, inventário e configuração (D12)

function respostaJson(dados: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(dados),
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usuarioId = '44444444-4444-4444-8444-444444444444'
const idMoldura = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const idTitulo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const idRaro = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function item(parcial: object) {
  return {
    itemId: idMoldura,
    codigo: 'moldura-bronze',
    nome: 'Moldura Bronze',
    descricao: 'Moldura simples.',
    categoria: 'moldura',
    preco: 20,
    estoque: null,
    possui: false,
    ...parcial,
  }
}

function mock(papel: string, extra: (alvo: string, metodo: string) => unknown = () => undefined) {
  return vi.fn(async (url: unknown, init?: { method?: string }) => {
    const alvo = String(url)
    const metodo = init?.method ?? 'GET'
    const especifico = extra(alvo, metodo)
    if (especifico) return especifico
    if (alvo.includes('/auth/sessao')) {
      return respostaJson({ usuarioId, papel, expiraEm: new Date(Date.now() + 60_000).toISOString() })
    }
    if (alvo.includes('/perfis/')) {
      return respostaJson({ id: usuarioId, papel, nivel: papel === 'estudante' ? 1 : null, conquistas: [], inventario: [] })
    }
    if (alvo.endsWith('/api/v1/xp')) {
      return respostaJson({ xpTotal: 0, xpSemana: 0, nivel: 1, xpNivelAtual: 0, xpProximoNivel: 100 })
    }
    return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'nao encontrado' } }, 404)
  })
}

async function abrir(papel: string, rotulo: string, extra?: (alvo: string, metodo: string) => unknown) {
  const fetchMock = mock(papel, extra)
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: rotulo }))
  return fetchMock
}

describe('formatação (unidade)', () => {
  it('singular e plural de moedas', () => {
    expect(formatarMoedas(1)).toBe('1 moeda')
    expect(formatarMoedas(0)).toBe('0 moedas')
    expect(formatarMoedas(1500)).toBe('1.500 moedas')
  })

  it('estoque: ilimitado, esgotado e contagem', () => {
    expect(descreverEstoque(null)).toBe('Estoque ilimitado')
    expect(descreverEstoque(0)).toBe('Esgotado')
    expect(descreverEstoque(7)).toBe('7 em estoque')
  })
})

describe('menu por papel', () => {
  it('estudante vê Loja e Meu inventário', async () => {
    vi.stubGlobal('fetch', mock('estudante'))
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Loja' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Meu inventário' })).toBeTruthy()
  })

  it('professor e administrador não veem Loja nem Meu inventário', async () => {
    for (const papel of ['professor', 'administrador']) {
      vi.stubGlobal('fetch', mock(papel))
      const { unmount } = render(<App />)
      await screen.findByRole('button', { name: 'Catálogo' })
      expect(screen.queryByRole('button', { name: 'Loja' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Meu inventário' })).toBeNull()
      unmount()
    }
  })
})

describe('Loja (F8-01–F8-03)', () => {
  const lojaBase = (alvo: string, metodo: string) => {
    if (alvo.endsWith('/api/v1/moedas')) return respostaJson({ saldo: 25, extrato: [] })
    if (alvo.endsWith('/api/v1/loja/itens') && metodo === 'GET') {
      return respostaJson({
        itens: [
          item({}),
          item({ itemId: idTitulo, codigo: 'titulo-lenda', nome: 'Título Lenda', categoria: 'titulo', preco: 150 }),
          item({ itemId: idRaro, codigo: 'raro', nome: 'Item Raro', preco: 5, estoque: 0 }),
        ],
      })
    }
    return undefined
  }

  it('mostra saldo, itens, preço e estoque; desabilita o que não dá para comprar', async () => {
    await abrir('estudante', 'Loja', lojaBase)
    await screen.findByText('Moldura Bronze')
    expect(screen.getByLabelText('Saldo de moedas').textContent).toBe('25 moedas')
    expect(screen.getAllByText('Estoque ilimitado').length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Comprar' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Saldo insuficiente' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Esgotado' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('comprar atualiza saldo e posse a partir da resposta do servidor', async () => {
    const fetchMock = await abrir('estudante', 'Loja', (alvo, metodo) => {
      if (metodo === 'POST' && alvo.endsWith(`/loja/itens/${idMoldura}/comprar`)) {
        return respostaJson({ saldo: 5, item: item({ possui: true, equipado: false }) }, 201)
      }
      return lojaBase(alvo, metodo)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Comprar' }))

    await screen.findByText(/Você comprou Moldura Bronze/)
    expect(screen.getByLabelText('Saldo de moedas').textContent).toBe('5 moedas')
    expect(screen.getByText('Você já possui este item')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Comprar' })).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => (init as { method?: string })?.method === 'POST')).toBe(true)
  })

  it('erro do servidor na compra é exibido e a loja é recarregada', async () => {
    let carregamentos = 0
    await abrir('estudante', 'Loja', (alvo, metodo) => {
      if (metodo === 'POST') {
        return respostaJson({ erro: { codigo: 'conflito', mensagem: 'item esgotado' } }, 409)
      }
      if (alvo.endsWith('/api/v1/moedas')) carregamentos += 1
      return lojaBase(alvo, metodo)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Comprar' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toBe('item esgotado')
    await waitFor(() => expect(carregamentos).toBe(2))
  })

  it('loja vazia mostra mensagem', async () => {
    await abrir('estudante', 'Loja', (alvo) => {
      if (alvo.endsWith('/api/v1/moedas')) return respostaJson({ saldo: 0, extrato: [] })
      if (alvo.endsWith('/api/v1/loja/itens')) return respostaJson({ itens: [] })
      return undefined
    })
    await screen.findByText('Nenhum item à venda no momento.')
  })

  it('falha ao carregar mostra o erro', async () => {
    await abrir('estudante', 'Loja', (alvo) =>
      alvo.endsWith('/api/v1/moedas')
        ? respostaJson({ erro: { codigo: 'erro_interno', mensagem: 'falhou' } }, 500)
        : undefined
    )
    expect((await screen.findByRole('alert')).textContent).toBe('falhou')
  })
})

describe('Inventário (F8-04, F8-05)', () => {
  const dono = (equipadoMoldura: boolean) => ({
    itens: [
      { itemId: idMoldura, codigo: 'm', nome: 'Moldura Bronze', categoria: 'moldura', equipado: equipadoMoldura, adquiridoEm: '2026-11-01T12:00:00.000Z' },
      { itemId: idTitulo, codigo: 't', nome: 'Título Lenda', categoria: 'titulo', equipado: false, adquiridoEm: '2026-11-02T12:00:00.000Z' },
    ],
  })

  it('agrupa por categoria e equipa recarregando o estado do servidor', async () => {
    let equipado = false
    const fetchMock = await abrir('estudante', 'Meu inventário', (alvo, metodo) => {
      if (metodo === 'PUT' && alvo.endsWith(`/inventario/${idMoldura}/equipado`)) {
        equipado = true
        return respostaJson({ ...dono(true).itens[0] })
      }
      if (alvo.endsWith('/api/v1/inventario')) return respostaJson(dono(equipado))
      return undefined
    })
    await screen.findByRole('heading', { name: 'Molduras' })
    expect(screen.getByRole('heading', { name: 'Títulos' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Equipar' })[0])
    await screen.findByRole('button', { name: 'Desequipar' })
    expect(screen.getByText('Equipado')).toBeTruthy()
    const put = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PUT')
    expect(JSON.parse((put?.[1] as { body: string }).body)).toEqual({ equipado: true })
  })

  it('inventário vazio convida a ir para a loja', async () => {
    await abrir('estudante', 'Meu inventário', (alvo) =>
      alvo.endsWith('/api/v1/inventario') ? respostaJson({ itens: [] }) : undefined
    )
    await screen.findByText('Inventário vazio.')
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a loja' }))
    await screen.findByRole('heading', { name: 'Loja' })
  })

  it('erro ao equipar aparece como alerta', async () => {
    await abrir('estudante', 'Meu inventário', (alvo, metodo) => {
      if (metodo === 'PUT') return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'sumiu' } }, 404)
      if (alvo.endsWith('/api/v1/inventario')) return respostaJson(dono(false))
      return undefined
    })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Equipar' }))[0])
    expect((await screen.findByRole('alert')).textContent).toBe('sumiu')
  })
})

describe('Perfil — inventário (R-M10)', () => {
  it('lista os itens possuídos e marca o equipado', async () => {
    vi.stubGlobal(
      'fetch',
      mock('estudante', (alvo) =>
        alvo.includes('/perfis/')
          ? respostaJson({
              id: usuarioId,
              papel: 'estudante',
              nivel: 1,
              conquistas: [],
              inventario: [
                { itemId: idMoldura, codigo: 'm', nome: 'Moldura Bronze', categoria: 'moldura', equipado: true },
                { itemId: idTitulo, codigo: 't', nome: 'Título Lenda', categoria: 'titulo', equipado: false },
              ],
            })
          : undefined
      )
    )
    render(<App />)
    await screen.findByText('Moldura Bronze (equipado)')
    expect(screen.getByText('Título Lenda')).toBeTruthy()
  })
})

describe('Administração — loja (F8-06, F8-07)', () => {
  const config = {
    itens: [
      item({ ativo: true, estoque: 3 }),
      item({ itemId: idTitulo, codigo: 'titulo', nome: 'Título Lenda', categoria: 'titulo', preco: 150, ativo: false }),
    ],
  }

  it('lista os itens com valores atuais, inclusive inativos', async () => {
    await abrir('administrador', 'Administração', (alvo) =>
      alvo.endsWith('/api/v1/config/loja') ? respostaJson(config) : alvo.endsWith('/config/xp') ? respostaJson({ xpConclusaoAula: 10, xpAcertoQuestao: 5, xpEntregaAvaliacao: 20, xpPorPontoNota: 3 }) : undefined
    )
    await screen.findByLabelText('Preço de Moldura Bronze')
    expect((screen.getByLabelText('Preço de Moldura Bronze') as HTMLInputElement).value).toBe('20')
    expect((screen.getByLabelText('Estoque de Moldura Bronze') as HTMLInputElement).value).toBe('3')
    expect((screen.getByLabelText('Estoque de Título Lenda') as HTMLInputElement).value).toBe('')
    const linhas = screen.getAllByRole('listitem').filter((li) => li.classList.contains('linha-config-loja'))
    expect((within(linhas[1]).getByLabelText('À venda') as HTMLInputElement).checked).toBe(false)
  })

  it('salva o ajuste: estoque vazio vira null e a resposta do servidor volta para a tela', async () => {
    const fetchMock = await abrir('administrador', 'Administração', (alvo, metodo) => {
      if (metodo === 'PATCH' && alvo.endsWith(`/config/loja/itens/${idMoldura}`)) {
        return respostaJson({ ...config.itens[0], preco: 35, estoque: null, ativo: true })
      }
      if (alvo.endsWith('/api/v1/config/loja')) return respostaJson(config)
      if (alvo.endsWith('/config/xp')) return respostaJson({ xpConclusaoAula: 10, xpAcertoQuestao: 5, xpEntregaAvaliacao: 20, xpPorPontoNota: 3 })
      return undefined
    })
    const preco = await screen.findByLabelText('Preço de Moldura Bronze')
    fireEvent.change(preco, { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('Estoque de Moldura Bronze'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Moldura Bronze' }))

    await screen.findByText(/Moldura Bronze atualizado/)
    const patch = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PATCH')
    expect(JSON.parse((patch?.[1] as { body: string }).body)).toEqual({ preco: 35, estoque: null, ativo: true })
    expect((screen.getByLabelText('Estoque de Moldura Bronze') as HTMLInputElement).value).toBe('')
  })

  it('erro de validação do servidor é mostrado', async () => {
    await abrir('administrador', 'Administração', (alvo, metodo) => {
      if (metodo === 'PATCH') return respostaJson({ erro: { codigo: 'validacao', mensagem: 'preco deve ser inteiro entre 0 e 10000' } }, 400)
      if (alvo.endsWith('/api/v1/config/loja')) return respostaJson(config)
      if (alvo.endsWith('/config/xp')) return respostaJson({ xpConclusaoAula: 10, xpAcertoQuestao: 5, xpEntregaAvaliacao: 20, xpPorPontoNota: 3 })
      return undefined
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar Moldura Bronze' }))
    const alertas = await screen.findAllByRole('alert')
    expect(alertas.some((a) => a.textContent === 'preco deve ser inteiro entre 0 e 10000')).toBe(true)
  })
})
