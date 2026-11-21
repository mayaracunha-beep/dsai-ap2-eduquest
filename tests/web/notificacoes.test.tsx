// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/web/App'
import { rotuloDoMenu } from '../../src/web/tiposNotificacao'

// SPEC/2026-11-19-notificacoes.md §5 — web de notificações (F9-01–F9-05)

function respostaJson(dados: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(dados) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usuarioId = '44444444-4444-4444-8444-444444444444'
const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function nova(id: string, parcial: object = {}) {
  return {
    notificacaoId: id,
    tipo: 'conquista_desbloqueada',
    titulo: 'Nova conquista!',
    mensagem: 'Você desbloqueou "Primeira aula".',
    lida: false,
    criadaEm: '2026-11-19T12:00:00.000Z',
    lidaEm: null,
    ...parcial,
  }
}

const prefsPadrao = [
  { tipo: 'conquista_desbloqueada', rotulo: 'Conquistas desbloqueadas', ativa: true },
  { tipo: 'missao_cumprida', rotulo: 'Missões cumpridas', ativa: false },
]

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
    if (alvo.endsWith('/notificacoes/preferencias')) return respostaJson({ preferencias: prefsPadrao })
    if (alvo.includes('/api/v1/notificacoes')) return respostaJson({ naoLidas: 2, notificacoes: [nova(idA), nova(idB, { lida: true, lidaEm: '2026-11-19T13:00:00.000Z', mensagem: 'Você chegou ao nível 2.', titulo: 'Novo nível!' })] })
    return respostaJson({ erro: { codigo: 'nao_encontrado', mensagem: 'nao encontrado' } }, 404)
  })
}

async function abrir(extra?: (alvo: string, metodo: string) => unknown) {
  const fetchMock = mock('estudante', extra)
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /^Notificações/ }))
  return fetchMock
}

describe('rotuloDoMenu (unidade)', () => {
  it('cita a contagem só quando há não lidas', () => {
    expect(rotuloDoMenu(0)).toBe('Notificações')
    expect(rotuloDoMenu(-1)).toBe('Notificações')
    expect(rotuloDoMenu(1)).toBe('Notificações (1 não lida)')
    expect(rotuloDoMenu(5)).toBe('Notificações (5 não lidas)')
  })
})

describe('menu e contador', () => {
  it('o estudante vê o contador de não lidas no menu', async () => {
    vi.stubGlobal('fetch', mock('estudante'))
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Notificações (2 não lidas)' })).toBeTruthy()
  })

  it('professor e administrador não veem Notificações nem consultam o servidor', async () => {
    for (const papel of ['professor', 'administrador']) {
      const fetchMock = mock(papel)
      vi.stubGlobal('fetch', fetchMock)
      const { unmount } = render(<App />)
      await screen.findByRole('button', { name: 'Catálogo' })
      expect(screen.queryByRole('button', { name: /^Notificações/ })).toBeNull()
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/notificacoes'))).toBe(false)
      unmount()
    }
  })

  it('falha ao buscar o contador não atrapalha o menu', async () => {
    vi.stubGlobal(
      'fetch',
      mock('estudante', (alvo) =>
        alvo.includes('/api/v1/notificacoes') ? respostaJson({ erro: { codigo: 'erro_interno', mensagem: 'x' } }, 500) : undefined
      )
    )
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Notificações' })).toBeTruthy()
  })
})

describe('Página de notificações (F9-01–F9-03)', () => {
  it('lista as notificações, destacando as novas', async () => {
    await abrir()
    await screen.findByText('Você desbloqueou "Primeira aula".')
    expect(screen.getByText('Você chegou ao nível 2.')).toBeTruthy()
    expect(screen.getAllByText('Nova')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Marcar como lida' })).toHaveLength(1)
  })

  it('marcar como lida envia o PATCH e recarrega a lista', async () => {
    let lida = false
    const fetchMock = await abrir((alvo, metodo) => {
      if (metodo === 'PATCH' && alvo.endsWith(`/notificacoes/${idA}/lida`)) {
        lida = true
        return respostaJson(nova(idA, { lida: true }))
      }
      if (alvo.includes('/api/v1/notificacoes?')) {
        return respostaJson({ naoLidas: lida ? 0 : 1, notificacoes: [nova(idA, lida ? { lida: true, lidaEm: '2026-11-19T14:00:00.000Z' } : {})] })
      }
      return undefined
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como lida' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar como lida' })).toBeNull())
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith(`/${idA}/lida`) && (init as { method?: string }).method === 'PATCH')).toBe(true)
    expect((screen.getByRole('button', { name: 'Marcar todas como lidas' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('marcar todas como lidas usa POST e o botão só habilita com não lidas', async () => {
    let chamou = false
    await abrir((alvo, metodo) => {
      if (metodo === 'POST' && alvo.endsWith('/marcar-todas-lidas')) {
        chamou = true
        return respostaJson({ marcadas: 2 })
      }
      return undefined
    })
    const botao = (await screen.findByRole('button', { name: 'Marcar todas como lidas' })) as HTMLButtonElement
    await waitFor(() => expect(botao.disabled).toBe(false))
    fireEvent.click(botao)
    await waitFor(() => expect(chamou).toBe(true))
  })

  it('o filtro "Só não lidas" refaz a consulta com apenasNaoLidas=true', async () => {
    const fetchMock = await abrir()
    await screen.findByText('Você desbloqueou "Primeira aula".')
    fireEvent.click(screen.getByLabelText('Só não lidas'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('apenasNaoLidas=true'))).toBe(true)
    )
  })

  it('lista vazia mostra a mensagem certa para cada filtro', async () => {
    await abrir((alvo) =>
      alvo.includes('/api/v1/notificacoes?') ? respostaJson({ naoLidas: 0, notificacoes: [] }) : undefined
    )
    await screen.findByText('Você ainda não tem notificações.')
    fireEvent.click(screen.getByLabelText('Só não lidas'))
    await screen.findByText('Nenhuma notificação não lida.')
  })

  it('erro do servidor ao carregar vira alerta', async () => {
    await abrir((alvo) =>
      alvo.includes('/api/v1/notificacoes?limite=50')
        ? respostaJson({ erro: { codigo: 'erro_interno', mensagem: 'falhou' } }, 500)
        : undefined
    )
    expect((await screen.findByRole('alert')).textContent).toBe('falhou')
  })
})

describe('Preferências (F9-04, F9-05)', () => {
  it('mostra cada tipo com o estado atual', async () => {
    await abrir()
    expect(((await screen.findByLabelText('Conquistas desbloqueadas')) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Missões cumpridas') as HTMLInputElement).checked).toBe(false)
  })

  it('alternar envia o PATCH com o tipo e o novo estado e usa a lista devolvida', async () => {
    const fetchMock = await abrir((alvo, metodo) =>
      metodo === 'PATCH' && alvo.endsWith('/notificacoes/preferencias')
        ? respostaJson({ preferencias: [{ ...prefsPadrao[0], ativa: false }, { ...prefsPadrao[1], ativa: true }] })
        : undefined
    )
    fireEvent.click(await screen.findByLabelText('Conquistas desbloqueadas'))
    await waitFor(() => expect((screen.getByLabelText('Conquistas desbloqueadas') as HTMLInputElement).checked).toBe(false))
    expect((screen.getByLabelText('Missões cumpridas') as HTMLInputElement).checked).toBe(true)
    const patch = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/preferencias') && (init as { method?: string }).method === 'PATCH')
    expect(JSON.parse((patch?.[1] as { body: string }).body)).toEqual({ tipo: 'conquista_desbloqueada', ativa: false })
  })

  it('erro ao salvar a preferência aparece como alerta', async () => {
    await abrir((alvo, metodo) =>
      metodo === 'PATCH' && alvo.endsWith('/notificacoes/preferencias')
        ? respostaJson({ erro: { codigo: 'validacao', mensagem: 'tipo invalido' } }, 400)
        : undefined
    )
    fireEvent.click(await screen.findByLabelText('Conquistas desbloqueadas'))
    expect((await screen.findByRole('alert')).textContent).toBe('tipo invalido')
  })
})
