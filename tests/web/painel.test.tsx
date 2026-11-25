// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/web/App'
import { percentualDoNivel, type RespostaPainel } from '../../src/web/tiposPainel'
import { fetchSimulado, respostaJson, type Especifico } from './auxiliar'

// SPEC/2026-11-19-painel-acessibilidade.md — painel do estudante (F10-01) e acessibilidade da navegação (AC-01, AC-02)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cursoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function painel(parcial: Partial<RespostaPainel> = {}): RespostaPainel {
  return {
    geradoEm: '2026-11-19T12:00:00.000Z',
    xp: { xpTotal: 150, xpSemana: 40, nivel: 2, xpNivelAtual: 100, xpProximoNivel: 200 },
    moedas: { saldo: 30 },
    missoes: [
      { missaoId: 'm1', titulo: 'Maratona', tipo: 'aulas_concluidas', meta: 4, progresso: 1, fim: '2026-12-01T12:00:00.000Z', recompensaMoedas: 15 },
    ],
    conquistas: { desbloqueadas: 2, total: 10, recentes: [{ codigo: 'c1', nome: 'Primeira aula', desbloqueadaEm: '2026-11-10T12:00:00.000Z' }] },
    notificacoes: { naoLidas: 1, recentes: [{ notificacaoId: 'n1', titulo: 'Novo nível!', mensagem: 'Você chegou ao nível 2.', criadaEm: '2026-11-19T11:00:00.000Z' }] },
    ranking: { posicao: 3, valor: 40, totalParticipantes: 12 },
    cursos: [{ cursoId, titulo: 'Álgebra', aulasConcluidas: 1, aulasTotal: 4, percentual: 25 }],
    ...parcial,
  }
}

async function abrirPainel(corpo: unknown, extra: Especifico = () => undefined, status = 200) {
  const fetchMock = fetchSimulado('estudante', (alvo, metodo) =>
    alvo.endsWith('/api/v1/painel') ? respostaJson(corpo, status) : extra(alvo, metodo)
  )
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Painel' }))
  return fetchMock
}

describe('percentualDoNivel (unidade)', () => {
  const xp = { xpTotal: 150, xpSemana: 0, nivel: 2, xpNivelAtual: 100, xpProximoNivel: 200 }

  it('calcula o avanço dentro do nível', () => {
    expect(percentualDoNivel(xp)).toBe(50)
    expect(percentualDoNivel({ ...xp, xpTotal: 100 })).toBe(0)
    expect(percentualDoNivel({ ...xp, xpTotal: 199 })).toBe(99)
  })

  it('limita entre 0 e 100 e nunca divide por zero', () => {
    expect(percentualDoNivel({ ...xp, xpTotal: 50 })).toBe(0)
    expect(percentualDoNivel({ ...xp, xpTotal: 900 })).toBe(100)
    expect(percentualDoNivel({ ...xp, xpProximoNivel: 100 })).toBe(0)
  })
})

describe('menu', () => {
  it('Painel é o primeiro item do estudante e não existe para os outros papéis', async () => {
    vi.stubGlobal('fetch', fetchSimulado('estudante'))
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: 'Painel' })
    const itens = screen.getAllByRole('button').filter((b) => b.classList.contains('nav-item'))
    expect(itens[0].textContent).toBe('Painel')
    unmount()
    for (const papel of ['professor', 'administrador']) {
      vi.stubGlobal('fetch', fetchSimulado(papel))
      const renderizado = render(<App />)
      await screen.findByRole('button', { name: 'Catálogo' })
      expect(screen.queryByRole('button', { name: 'Painel' })).toBeNull()
      renderizado.unmount()
    }
  })
})

describe('Painel (F10-01)', () => {
  it('mostra nível, moedas, missões, cursos, conquistas, ranking e avisos', async () => {
    await abrirPainel(painel())
    await screen.findByRole('heading', { name: 'Seu nível' })
    expect(screen.getByText('Nível 2')).toBeTruthy()
    const nivel = screen.getByRole('progressbar', { name: 'Progresso no nível atual' })
    expect(nivel.getAttribute('aria-valuenow')).toBe('50')
    expect(nivel.getAttribute('aria-valuemax')).toBe('100')
    expect(screen.getByText(/150 XP no total · 40 XP nesta semana · 50% do caminho para o nível 3/)).toBeTruthy()
    expect(screen.getByText('30 moedas')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Progresso de Maratona' }).getAttribute('aria-valuenow')).toBe('1')
    expect(screen.getByText('1 de 4')).toBeTruthy()
    expect(screen.getByText('1 de 4 aulas (25%)')).toBeTruthy()
    expect(screen.getByText('2 de 10')).toBeTruthy()
    expect(screen.getByText('Primeira aula')).toBeTruthy()
    expect(screen.getByText('3º')).toBeTruthy()
    expect(screen.getByText(/com 40 XP · 12 participante\(s\)/)).toBeTruthy()
    expect(screen.getByText('1 não lida')).toBeTruthy()
    expect(screen.getByText('Você chegou ao nível 2.')).toBeTruthy()
  })

  it('painel de estudante novo mostra os estados vazios', async () => {
    await abrirPainel(
      painel({
        xp: { xpTotal: 0, xpSemana: 0, nivel: 1, xpNivelAtual: 0, xpProximoNivel: 100 },
        moedas: { saldo: 0 },
        missoes: [],
        cursos: [],
        conquistas: { desbloqueadas: 0, total: 10, recentes: [] },
        notificacoes: { naoLidas: 0, recentes: [] },
        ranking: { posicao: null, valor: null, totalParticipantes: 0 },
      })
    )
    await screen.findByText('Nenhuma missão em andamento.')
    expect(screen.getByText('Você ainda não começou nenhum curso.')).toBeTruthy()
    expect(screen.getByText('Nenhuma conquista ainda.')).toBeTruthy()
    expect(screen.getByText('Sem posição nesta semana.')).toBeTruthy()
    expect(screen.getByText('0 não lidas')).toBeTruthy()
    expect(screen.getByText('0 moedas')).toBeTruthy()
  })

  it('cada seção leva à página do domínio dono do dado', async () => {
    await abrirPainel(painel())
    fireEvent.click(await screen.findByRole('button', { name: 'Ver todas as missões' }))
    await screen.findByRole('heading', { name: 'Missões', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Painel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ir para a loja' }))
    await screen.findByRole('heading', { name: 'Loja', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Painel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver rankings' }))
    await screen.findByRole('heading', { name: 'Rankings', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Painel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver notificações' }))
    await screen.findByRole('heading', { name: 'Notificações', level: 1 })
  })

  it('"Continuar" abre o curso no catálogo', async () => {
    const fetchMock = await abrirPainel(painel())
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar Álgebra' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(`/api/v1/cursos/${cursoId}`))).toBe(true)
    )
  })

  it('erro do servidor vira alerta', async () => {
    await abrirPainel({ erro: { codigo: 'erro_interno', mensagem: 'falhou' } }, undefined, 500)
    expect((await screen.findByRole('alert')).textContent).toBe('falhou')
  })
})

describe('acessibilidade da navegação (AC-01, AC-02)', () => {
  it('o link de pular é o primeiro elemento focável e leva o foco ao título da página', async () => {
    vi.stubGlobal('fetch', fetchSimulado('estudante', (alvo) => (alvo.includes('/api/v1/missoes') ? respostaJson({ missoes: [] }) : undefined)))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Missões' }))
    await screen.findByRole('heading', { name: 'Missões', level: 1 })
    const primeiro = document.querySelector<HTMLElement>('a[href], button, input, select, textarea')
    expect(primeiro?.textContent).toBe('Pular para o conteúdo')
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.click(screen.getByText('Pular para o conteúdo'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Missões', level: 1 }))
  })

  it('trocar de página move o foco ao título, atualiza o título do documento e anuncia', async () => {
    vi.stubGlobal('fetch', fetchSimulado('estudante', (alvo) => (alvo.includes('/api/v1/missoes') ? respostaJson({ missoes: [] }) : undefined)))
    render(<App />)
    await screen.findByRole('button', { name: 'Missões' })
    await waitFor(() => expect(document.title).toBe('Perfil — EduQuest'))
    expect(screen.getByTestId('anuncio-de-rota').textContent).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Missões' }))
    const titulo = await screen.findByRole('heading', { name: 'Missões', level: 1 })
    await waitFor(() => expect(document.activeElement).toBe(titulo))
    expect(document.title).toBe('Missões — EduQuest')
    expect(screen.getByTestId('anuncio-de-rota').textContent).toBe('Página: Missões')
  })

  it('a carga inicial não rouba o foco nem anuncia', async () => {
    vi.stubGlobal('fetch', fetchSimulado('estudante'))
    render(<App />)
    await screen.findByRole('button', { name: 'Painel' })
    await waitFor(() => expect(document.title).toBe('Perfil — EduQuest'))
    expect(document.activeElement).toBe(document.body)
    expect(screen.getByTestId('anuncio-de-rota').textContent).toBe('')
  })

  it('sem sessão, o título do documento é o da página de entrada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaJson({ erro: { codigo: 'nao_autenticado', mensagem: 'sem sessao' } }, 401)))
    render(<App />)
    await waitFor(() => expect(document.title).toBe('Entrar — EduQuest'))
  })
})
