// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/web/App'
import { descreverEscopo, paraCampoDataHora } from '../../src/web/tiposMissao'

// SPEC/2026-11-19-missoes.md §5 — web de missões: estudante (F6-01) e gestão (F6-02–F6-04)

function respostaJson(dados: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(dados) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usuarioId = '44444444-4444-4444-8444-444444444444'
const cursoProprio = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const cursoAlheio = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const idMissao = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function base(parcial: object = {}) {
  return {
    missaoId: idMissao,
    titulo: 'Maratona de aulas',
    descricao: 'Conclua aulas.',
    tipo: 'aulas_concluidas',
    meta: 4,
    inicio: '2026-11-01T12:00:00.000Z',
    fim: '2026-12-01T12:00:00.000Z',
    recompensaMoedas: 15,
    escopo: null,
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
      return respostaJson({ id: usuarioId, papel, nivel: null, conquistas: [], inventario: [] })
    }
    if (alvo.endsWith('/api/v1/xp')) {
      return respostaJson({ xpTotal: 0, xpSemana: 0, nivel: 1, xpNivelAtual: 0, xpProximoNivel: 100 })
    }
    return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'nao encontrado' } }, 404)
  })
}

async function abrir(papel: string, extra?: (alvo: string, metodo: string) => unknown) {
  const fetchMock = mock(papel, extra)
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Missões' }))
  return fetchMock
}

describe('formatação (unidade)', () => {
  it('descreve o escopo da missão', () => {
    expect(descreverEscopo(null)).toBe('Todos os cursos')
    expect(descreverEscopo({ cursoId: cursoProprio, cursoTitulo: 'Álgebra' })).toBe('Curso: Álgebra')
  })

  it('campo de data local tem o formato do datetime-local', () => {
    expect(paraCampoDataHora(new Date(2026, 10, 19, 8, 5))).toBe('2026-11-19T08:05')
  })
})

describe('menu', () => {
  it('Missões aparece para os três papéis', async () => {
    for (const papel of ['estudante', 'professor', 'administrador']) {
      vi.stubGlobal('fetch', mock(papel))
      const { unmount } = render(<App />)
      expect(await screen.findByRole('button', { name: 'Missões' })).toBeTruthy()
      unmount()
    }
  })
})

describe('Missões do estudante (F6-01)', () => {
  it('mostra progresso, escopo, prazo e recompensa', async () => {
    await abrir('estudante', (alvo) =>
      alvo.endsWith('/api/v1/missoes')
        ? respostaJson({
            missoes: [
              {
                ...base({ escopo: { cursoId: cursoProprio, cursoTitulo: 'Álgebra' } }),
                status: 'em_andamento',
                progresso: 1,
                cumprida: false,
                cumpridaEm: null,
              },
            ],
          })
        : undefined
    )
    await screen.findByText('Maratona de aulas')
    const barra = screen.getByRole('progressbar', { name: 'Progresso de Maratona de aulas' })
    expect(barra.getAttribute('aria-valuenow')).toBe('1')
    expect(barra.getAttribute('aria-valuemax')).toBe('4')
    expect(screen.getByText('Em andamento')).toBeTruthy()
    expect(screen.getByText(/Concluir aulas · Curso: Álgebra/)).toBeTruthy()
    expect(screen.getByText('Recompensa: 15 moedas')).toBeTruthy()
    expect(screen.queryByText(/Cumprida em/)).toBeNull()
  })

  it('missão cumprida mostra o selo e a data do cumprimento', async () => {
    await abrir('estudante', (alvo) =>
      alvo.endsWith('/api/v1/missoes')
        ? respostaJson({
            missoes: [{ ...base(), status: 'encerrada', progresso: 4, cumprida: true, cumpridaEm: '2026-11-10T12:00:00.000Z' }],
          })
        : undefined
    )
    await screen.findByText('Cumprida')
    expect(screen.getByText(/Cumprida em/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4')
  })

  it('missão encerrada sem cumprimento mostra o status Encerrada', async () => {
    await abrir('estudante', (alvo) =>
      alvo.endsWith('/api/v1/missoes')
        ? respostaJson({ missoes: [{ ...base(), status: 'encerrada', progresso: 1, cumprida: false, cumpridaEm: null }] })
        : undefined
    )
    await screen.findByText('Encerrada')
  })

  it('sem missões mostra a mensagem de vazio; erro do servidor vira alerta', async () => {
    await abrir('estudante', (alvo) => (alvo.endsWith('/api/v1/missoes') ? respostaJson({ missoes: [] }) : undefined))
    await screen.findByText('Nenhuma missão disponível no momento.')
    cleanup()
    await abrir('estudante', (alvo) =>
      alvo.endsWith('/api/v1/missoes') ? respostaJson({ erro: { codigo: 'erro_interno', mensagem: 'falhou' } }, 500) : undefined
    )
    expect((await screen.findByRole('alert')).textContent).toBe('falhou')
  })
})

describe('Gestão de missões (F6-02–F6-04)', () => {
  const cursos = [
    { id: cursoProprio, titulo: 'Meu curso', donoId: usuarioId },
    { id: cursoAlheio, titulo: 'Curso de outro', donoId: 'outro' },
  ]
  const gestaoBase = (alvo: string, metodo: string) => {
    if (alvo.endsWith('/api/v1/missoes/gestao')) {
      return respostaJson({ missoes: [{ ...base(), status: 'em_andamento', ativa: true, cumpriram: 3 }] })
    }
    if (alvo.endsWith('/api/v1/cursos') && metodo === 'GET') return respostaJson(cursos)
    return undefined
  }

  it('lista as missões com cumprimentos e período', async () => {
    await abrir('professor', gestaoBase)
    await screen.findByText('Maratona de aulas')
    expect(screen.getByText(/3 cumpriram/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desativar Maratona de aulas' })).toBeTruthy()
  })

  it('professor só escolhe entre os próprios cursos; administrador também vê "Todos os cursos"', async () => {
    await abrir('professor', gestaoBase)
    await screen.findByLabelText('Curso')
    expect(screen.getByRole('option', { name: 'Meu curso' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Curso de outro' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Todos os cursos' })).toBeNull()
    cleanup()
    await abrir('administrador', gestaoBase)
    await screen.findByRole('option', { name: 'Todos os cursos' })
    expect(screen.getByRole('option', { name: 'Curso de outro' })).toBeTruthy()
  })

  it('cria a missão enviando o corpo do contrato e recarrega a lista', async () => {
    let criada = false
    const fetchMock = await abrir('professor', (alvo, metodo) => {
      if (metodo === 'POST' && alvo.endsWith('/api/v1/missoes')) {
        criada = true
        return respostaJson(base(), 201)
      }
      return gestaoBase(alvo, metodo)
    })
    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Nova missão' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'xp_ganho' } })
    fireEvent.change(screen.getByLabelText('Meta'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: cursoProprio } })
    fireEvent.change(screen.getByLabelText('Recompensa (moedas)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar missão' }))

    await screen.findByText('Missão criada.')
    expect(criada).toBe(true)
    const post = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'POST')
    const corpo = JSON.parse((post?.[1] as { body: string }).body)
    expect(corpo).toMatchObject({ titulo: 'Nova missão', tipo: 'xp_ganho', meta: 50, recompensaMoedas: 20, cursoId: cursoProprio })
    expect(new Date(corpo.fim) > new Date(corpo.inicio)).toBe(true)
  })

  it('administrador cria missão global: o corpo não leva cursoId', async () => {
    const fetchMock = await abrir('administrador', (alvo, metodo) =>
      metodo === 'POST' && alvo.endsWith('/api/v1/missoes') ? respostaJson(base(), 201) : gestaoBase(alvo, metodo)
    )
    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Global' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar missão' }))
    await screen.findByText('Missão criada.')
    const post = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'POST')
    expect('cursoId' in JSON.parse((post?.[1] as { body: string }).body)).toBe(false)
  })

  it('erro do servidor na criação aparece como alerta', async () => {
    await abrir('professor', (alvo, metodo) =>
      metodo === 'POST'
        ? respostaJson({ erro: { codigo: 'validacao', mensagem: 'meta deve ser inteiro entre 1 e 10000' } }, 400)
        : gestaoBase(alvo, metodo)
    )
    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: cursoProprio } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar missão' }))
    expect((await screen.findByRole('alert')).textContent).toBe('meta deve ser inteiro entre 1 e 10000')
  })

  it('desativa uma missão com PATCH e recarrega', async () => {
    let ativa = true
    const fetchMock = await abrir('professor', (alvo, metodo) => {
      if (metodo === 'PATCH' && alvo.endsWith(`/api/v1/missoes/${idMissao}`)) {
        ativa = false
        return respostaJson({ ...base(), status: 'em_andamento', ativa, cumpriram: 3 })
      }
      if (alvo.endsWith('/api/v1/missoes/gestao')) {
        return respostaJson({ missoes: [{ ...base(), status: 'em_andamento', ativa, cumpriram: 3 }] })
      }
      return gestaoBase(alvo, metodo)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar Maratona de aulas' }))
    await screen.findByRole('button', { name: 'Ativar Maratona de aulas' })
    expect(screen.getByText('Desativada')).toBeTruthy()
    const patch = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PATCH')
    expect(JSON.parse((patch?.[1] as { body: string }).body)).toEqual({ ativa: false })
  })

  it('sem missões mostra a mensagem de vazio', async () => {
    await abrir('professor', (alvo, metodo) =>
      alvo.endsWith('/api/v1/missoes/gestao') ? respostaJson({ missoes: [] }) : gestaoBase(alvo, metodo)
    )
    await waitFor(() => expect(screen.getByText('Nenhuma missão criada ainda.')).toBeTruthy())
  })
})
