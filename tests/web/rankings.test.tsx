// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/web/App'
import { montarConsulta, ordinal } from '../../src/web/tiposRanking'

// SPEC/2026-11-19-rankings.md §4 — web de rankings (F7-01–F7-03)

function respostaJson(dados: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(dados) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usuarioId = '44444444-4444-4444-8444-444444444444'
const cursoA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function ranking(parcial: object = {}) {
  return {
    metrica: { chave: 'xp', rotulo: 'XP', unidade: 'XP' },
    escopo: { tipo: 'global' },
    periodo: { tipo: 'semana', inicio: '2026-11-16T03:00:00.000Z', fim: '2026-11-23T03:00:00.000Z' },
    geradoEm: '2026-11-19T12:00:00.000Z',
    totalParticipantes: 2,
    entradas: [
      { posicao: 1, nome: 'Ada', valor: 1200, voce: false },
      { posicao: 2, nome: 'Estudante A1B2C3', valor: 90, voce: true },
    ],
    voce: { posicao: 2, valor: 90 },
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
    if (alvo.includes('/perfis/')) return respostaJson({ id: usuarioId, papel, nivel: null, conquistas: [], inventario: [] })
    if (alvo.endsWith('/api/v1/xp')) {
      return respostaJson({ xpTotal: 0, xpSemana: 0, nivel: 1, xpNivelAtual: 0, xpProximoNivel: 100 })
    }
    if (alvo.endsWith('/api/v1/cursos')) return respostaJson([{ id: cursoA, titulo: 'Álgebra', publicado: true }])
    if (alvo.includes('/api/v1/rankings/preferencia')) {
      return respostaJson({ participacao: 'anonimo', apelido: null })
    }
    if (alvo.includes('/api/v1/rankings?')) return respostaJson(ranking())
    return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'nao encontrado' } }, 404)
  })
}

async function abrir(papel: string, extra?: (alvo: string, metodo: string) => unknown) {
  const fetchMock = mock(papel, extra)
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rankings' }))
  return fetchMock
}

const chamadas = (fetchMock: ReturnType<typeof mock>) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/api/v1/rankings?'))

describe('formatação (unidade)', () => {
  it('ordinal e montagem da consulta', () => {
    expect(ordinal(3)).toBe('3º')
    expect(montarConsulta('xp', 'semana', null)).toBe('/api/v1/rankings?metrica=xp&periodo=semana')
    expect(montarConsulta('aulas_concluidas', 'total', cursoA)).toBe(
      `/api/v1/rankings?metrica=aulas_concluidas&periodo=total&escopo=curso&cursoId=${cursoA}`
    )
  })
})

describe('menu', () => {
  it('Rankings aparece para os três papéis', async () => {
    for (const papel of ['estudante', 'professor', 'administrador']) {
      vi.stubGlobal('fetch', mock(papel))
      const { unmount } = render(<App />)
      expect(await screen.findByRole('button', { name: 'Rankings' })).toBeTruthy()
      unmount()
    }
  })
})

describe('Ranking (F7-01)', () => {
  it('declara a métrica, mostra posições e marca o próprio estudante', async () => {
    await abrir('estudante')
    await screen.findByRole('table', { name: 'Ranking por XP (Semana atual)' })
    expect(screen.getByText('1º')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('1.200')).toBeTruthy()
    expect(screen.getByText('Estudante A1B2C3 (você)')).toBeTruthy()
    expect(screen.getByText(/Empates: quem chegou antes ao valor fica à frente/)).toBeTruthy()
    // a própria posição já está na tabela: sem aviso extra
    expect(screen.queryByText(/Sua posição:/)).toBeNull()
  })

  it('mostra a posição do estudante quando ele está fora da lista', async () => {
    await abrir('estudante', (alvo) =>
      alvo.includes('/api/v1/rankings?')
        ? respostaJson(ranking({ entradas: [{ posicao: 1, nome: 'Ada', valor: 1200, voce: false }], voce: { posicao: 22, valor: 5 }, totalParticipantes: 22 }))
        : undefined
    )
    await screen.findByText('Sua posição: 22º com 5 XP.')
  })

  it('trocar métrica, período e escopo refaz a consulta no servidor', async () => {
    const fetchMock = await abrir('estudante')
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Métrica'), { target: { value: 'aulas_concluidas' } })
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'total' } })
    await waitFor(() => expect(chamadas(fetchMock)).toContain('/api/v1/rankings?metrica=aulas_concluidas&periodo=total'))

    fireEvent.change(screen.getByLabelText('Escopo'), { target: { value: 'curso' } })
    await screen.findByText('Escolha um curso para ver o ranking.')
    const antes = chamadas(fetchMock).length
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: cursoA } })
    await waitFor(() =>
      expect(chamadas(fetchMock).at(-1)).toBe(
        `/api/v1/rankings?metrica=aulas_concluidas&periodo=total&escopo=curso&cursoId=${cursoA}`
      )
    )
    expect(chamadas(fetchMock).length).toBeGreaterThan(antes)
  })

  it('ranking de curso mostra o título do curso no resumo', async () => {
    await abrir('estudante', (alvo) =>
      alvo.includes('escopo=curso')
        ? respostaJson(ranking({ escopo: { tipo: 'curso', cursoId: cursoA, cursoTitulo: 'Álgebra' } }))
        : undefined
    )
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Escopo'), { target: { value: 'curso' } })
    fireEvent.change(await screen.findByLabelText('Curso'), { target: { value: cursoA } })
    await screen.findByText(/Curso: Álgebra/)
  })

  it('sem pontuação mostra mensagem de vazio; erro vira alerta', async () => {
    await abrir('estudante', (alvo) =>
      alvo.includes('/api/v1/rankings?') ? respostaJson(ranking({ entradas: [], voce: null, totalParticipantes: 0 })) : undefined
    )
    await screen.findByText('Ninguém pontuou neste recorte ainda.')
    cleanup()
    await abrir('estudante', (alvo) =>
      alvo.includes('/api/v1/rankings?') ? respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'curso nao encontrado' } }, 404) : undefined
    )
    expect((await screen.findByRole('alert')).textContent).toBe('curso nao encontrado')
  })

  it('professor vê o ranking, sem a seção de privacidade e sem consultar a preferência', async () => {
    const fetchMock = await abrir('professor')
    await screen.findByRole('table')
    expect(screen.queryByText('Privacidade nos rankings')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/rankings/preferencia'))).toBe(false)
  })
})

describe('Privacidade (F7-02, F7-03)', () => {
  it('carrega a preferência atual do estudante', async () => {
    await abrir('estudante', (alvo, metodo) =>
      alvo.includes('/rankings/preferencia') && metodo === 'GET' ? respostaJson({ participacao: 'oculto', apelido: null }) : undefined
    )
    const oculto = (await screen.findByLabelText(/Oculto —/)) as HTMLInputElement
    await waitFor(() => expect(oculto.checked).toBe(true))
  })

  it('apelido: o campo aparece só com essa opção e o PUT leva o apelido', async () => {
    const fetchMock = await abrir('estudante', (alvo, metodo) =>
      metodo === 'PUT' ? respostaJson({ participacao: 'apelido', apelido: 'Ada' }) : undefined
    )
    expect(screen.queryByLabelText('Apelido')).toBeNull()
    fireEvent.click(await screen.findByLabelText(/Com apelido —/))
    fireEvent.change(screen.getByLabelText('Apelido'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar privacidade' }))
    await screen.findByText(/Privacidade salva/)
    const put = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PUT')
    expect(JSON.parse((put?.[1] as { body: string }).body)).toEqual({ participacao: 'apelido', apelido: 'Ada' })
  })

  it('anônimo e oculto não enviam apelido', async () => {
    const fetchMock = await abrir('estudante', (alvo, metodo) =>
      metodo === 'PUT' ? respostaJson({ participacao: 'oculto', apelido: null }) : undefined
    )
    fireEvent.click(await screen.findByLabelText(/Oculto —/))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar privacidade' }))
    await screen.findByText(/Privacidade salva/)
    const put = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PUT')
    expect(JSON.parse((put?.[1] as { body: string }).body)).toEqual({ participacao: 'oculto' })
  })

  it('erro do servidor ao salvar é exibido', async () => {
    await abrir('estudante', (alvo, metodo) =>
      metodo === 'PUT' ? respostaJson({ erro: { codigo: 'validacao', mensagem: 'apelido invalido' } }, 400) : undefined
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar privacidade' }))
    expect((await screen.findByRole('alert')).textContent).toBe('apelido invalido')
  })
})
