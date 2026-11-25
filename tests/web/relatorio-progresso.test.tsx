// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RelatorioProgresso } from '../../src/web/paginas/RelatorioProgresso'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('exibe uma mensagem quando ninguém concluiu uma aula elegível', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '[]',
  }))
  render(<RelatorioProgresso cursoId="curso" />)
  fireEvent.click(screen.getByRole('button', { name: 'Consultar relatório' }))
  expect(await screen.findByText('Nenhum estudante concluiu uma aula publicada neste curso.')).toBeDefined()
})

it('exibe nome, contagens e percentual devolvidos pelo servidor', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify([
      { estudanteId: 'estudante', nome: 'Ana', aulasConcluidas: 1, aulasTotal: 3, percentual: 33 },
    ]),
  }))
  render(<RelatorioProgresso cursoId="curso" />)
  fireEvent.click(screen.getByRole('button', { name: 'Consultar relatório' }))
  expect(await screen.findByRole('rowheader', { name: 'Ana' })).toBeDefined()
  for (const valor of ['1', '3', '33%']) {
    expect(screen.getByRole('cell', { name: valor })).toBeDefined()
  }
})
