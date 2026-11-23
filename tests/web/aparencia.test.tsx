// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/web/App'
import { Avatar } from '../../src/web/componentes/Avatar'
import { classeDaMoldura, descreverAvatar, iniciaisDe } from '../../src/web/tiposAparencia'
import { fetchSimulado, respostaJson, usuarioId, type Especifico } from './auxiliar'

// SPEC/2026-11-21-nome-avatar-moldura.md — web: cadastro, perfil, cabeçalho e avatar (AV-11, AV-12)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const raposa = { id: 'raposa', rotulo: 'Raposa', emoji: '🦊', cor: '#ffedd5' }
const coruja = { id: 'coruja', rotulo: 'Coruja', emoji: '🦉', cor: '#dbeafe' }
const catalogo = { avatares: [raposa, coruja] }
const moldura = { codigo: 'moldura-ouro', nome: 'Moldura Ouro' }
const titulo = { codigo: 'titulo-lenda', nome: 'Título Lenda do EduQuest' }

const semAparencia = { nome: null, avatar: null, moldura: null, titulo: null }

function perfilDe(papel: string, extra: object = {}) {
  return { id: usuarioId, papel, nivel: papel === 'estudante' ? 1 : null, conquistas: [], inventario: [], ...semAparencia, ...extra }
}

describe('funções de exibição (unidade)', () => {
  it.each([
    ['Maria da Conceição Silva', 'MS'],
    ['  ana   souza ', 'AS'],
    ['Zé', 'Z'],
    ['élida', 'É'],
    ['😀 Silva', '😀S'],
    ['𝐀na Souza', '𝐀S'],
    ['', '?'],
    ['   ', '?'],
    [null, '?'],
    [undefined, '?'],
  ])('iniciaisDe(%j) = %s', (nome, esperado) => {
    expect(iniciaisDe(nome as string | null)).toBe(esperado)
  })

  it('classeDaMoldura usa uma lista fechada: o código do servidor nunca vira classe arbitrária', () => {
    expect(classeDaMoldura('moldura-bronze')).toBe('moldura-bronze')
    expect(classeDaMoldura('moldura-prata')).toBe('moldura-prata')
    expect(classeDaMoldura('moldura-ouro')).toBe('moldura-ouro')
    expect(classeDaMoldura('moldura-galaxia')).toBe('moldura-galaxia')
    expect(classeDaMoldura('qualquer-outra')).toBe('moldura-generica')
    expect(classeDaMoldura('x" onclick="alert(1)')).toBe('moldura-generica')
  })

  it('descreverAvatar cita nome, avatar e moldura quando existem', () => {
    expect(descreverAvatar('Ana', raposa, moldura)).toBe('Avatar de Ana, Raposa, com Moldura Ouro')
    expect(descreverAvatar('Ana', null, null)).toBe('Avatar de Ana')
    expect(descreverAvatar(null, null, null)).toBe('Avatar de usuário')
    expect(descreverAvatar('  ', coruja, null)).toBe('Avatar de usuário, Coruja')
  })
})

describe('Avatar (AV-12, R-AV8)', () => {
  it('sem avatar mostra as iniciais; com avatar mostra o emoji e a cor escolhida', () => {
    const { rerender } = render(<Avatar nome="Ana Souza" avatar={null} />)
    expect(screen.getByRole('img', { name: 'Avatar de Ana Souza' }).textContent).toBe('AS')
    rerender(<Avatar nome="Ana Souza" avatar={raposa} />)
    const imagem = screen.getByRole('img', { name: 'Avatar de Ana Souza, Raposa' })
    expect(imagem.textContent).toBe('🦊')
    expect(imagem.style.getPropertyValue('--avatar-cor')).toBe('#ffedd5')
    expect(imagem.classList.contains('avatar-iniciais')).toBe(false)
  })

  it('a moldura equipada vira a classe do anel e entra no nome acessível', () => {
    render(<Avatar nome="Ana" avatar={raposa} moldura={moldura} tamanho="lg" />)
    const imagem = screen.getByRole('img', { name: 'Avatar de Ana, Raposa, com Moldura Ouro' })
    expect(imagem.classList.contains('avatar-moldura')).toBe(true)
    expect(imagem.classList.contains('moldura-ouro')).toBe(true)
    expect(imagem.classList.contains('avatar-lg')).toBe(true)
  })

  it('sem moldura não há classe de moldura', () => {
    render(<Avatar nome="Ana" avatar={null} />)
    const imagem = screen.getByRole('img')
    expect(imagem.classList.contains('avatar-moldura')).toBe(false)
    expect(imagem.classList.contains('avatar-md')).toBe(true)
  })

  it('o conteúdo visual é escondido dos leitores de tela (o nome acessível está no contêiner)', () => {
    render(<Avatar nome="Ana" avatar={raposa} />)
    expect(screen.getByText('🦊').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Cadastro com nome e avatar (AV-11, R-AV1)', () => {
  async function abrirCadastro(extra: Especifico = () => undefined) {
    const fetchMock = fetchSimulado('estudante', (alvo, metodo) => {
      if (alvo.includes('/auth/sessao')) return respostaJson({ erro: { codigo: 'nao_autenticado', mensagem: 'x' } }, 401)
      const especifico = extra(alvo, metodo)
      if (especifico) return especifico
      if (alvo.endsWith('/auth/registro')) return respostaJson({ usuarioId, papel: 'estudante' }, 201)
      return undefined
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    fireEvent.click(await screen.findByText('Criar conta'))
    return fetchMock
  }

  const preencher = async () => {
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana Souza' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemplo.test' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-larga-123' } })
  }

  const corpoDoRegistro = (fetchMock: ReturnType<typeof fetchSimulado>) => {
    const chamada = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/registro'))
    return JSON.parse((chamada?.[1] as { body: string }).body)
  }

  it('o nome é obrigatório e limitado a 60 caracteres no formulário', async () => {
    await abrirCadastro()
    const nome = (await screen.findByLabelText('Nome')) as HTMLInputElement
    expect(nome.required).toBe(true)
    expect(nome.maxLength).toBe(60)
  })

  it('mostra o catálogo de avatares, a prévia muda e o avatar escolhido vai no corpo', async () => {
    const fetchMock = await abrirCadastro((alvo) => (alvo.endsWith('/api/v1/avatares') ? respostaJson(catalogo) : undefined))
    await preencher()
    fireEvent.click(await screen.findByRole('radio', { name: 'Raposa' }))
    expect(screen.getByRole('img', { name: 'Avatar de Ana Souza, Raposa' })).toBeTruthy()
    fireEvent.submit(screen.getByLabelText('E-mail').closest('form')!)
    await screen.findByText('Conta criada')
    expect(corpoDoRegistro(fetchMock)).toEqual({
      nome: 'Ana Souza',
      email: 'ana@exemplo.test',
      senha: 'senha-larga-123',
      avatar: 'raposa',
    })
  })

  it('sem escolher avatar, o corpo não leva o campo e a prévia usa as iniciais', async () => {
    const fetchMock = await abrirCadastro((alvo) => (alvo.endsWith('/api/v1/avatares') ? respostaJson(catalogo) : undefined))
    await preencher()
    await screen.findByRole('radio', { name: 'Coruja' })
    expect(screen.getByRole('img', { name: 'Avatar de Ana Souza' }).textContent).toBe('AS')
    fireEvent.submit(screen.getByLabelText('E-mail').closest('form')!)
    await screen.findByText('Conta criada')
    expect('avatar' in corpoDoRegistro(fetchMock)).toBe(false)
  })

  it('se o catálogo não carregar, o cadastro continua sem o seletor', async () => {
    const fetchMock = await abrirCadastro()
    await preencher()
    expect(screen.queryByText('Avatar')).toBeNull()
    fireEvent.submit(screen.getByLabelText('E-mail').closest('form')!)
    await screen.findByText('Conta criada')
    expect(corpoDoRegistro(fetchMock)).toEqual({ nome: 'Ana Souza', email: 'ana@exemplo.test', senha: 'senha-larga-123' })
  })

  it('erro do servidor aparece como alerta e o formulário permanece', async () => {
    await abrirCadastro((alvo) =>
      alvo.endsWith('/auth/registro') ? respostaJson({ erro: { codigo: 'validacao', mensagem: 'nome invalido' } }, 400) : undefined
    )
    await preencher()
    fireEvent.submit(screen.getByLabelText('E-mail').closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toBe('nome invalido')
  })
})

describe('Perfil com identidade e editor (AV-12)', () => {
  async function abrirPerfil(papel: string, perfil: object, extra: Especifico = () => undefined) {
    const fetchMock = fetchSimulado(papel, (alvo, metodo) => {
      if (alvo.includes('/perfis/')) return respostaJson(perfil)
      if (alvo.endsWith('/api/v1/avatares')) return respostaJson(catalogo)
      return extra(alvo, metodo)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await screen.findByText('Aparência')
    return fetchMock
  }

  it('mostra nome, título e o avatar com a moldura equipada', async () => {
    await abrirPerfil('estudante', perfilDe('estudante', { nome: 'Ana Souza', avatar: raposa, moldura, titulo }))
    expect(screen.getByText('Ana Souza', { selector: '.identidade-nome' })).toBeTruthy()
    expect(screen.getByText('Título Lenda do EduQuest')).toBeTruthy()
    const avatares = screen.getAllByRole('img', { name: 'Avatar de Ana Souza, Raposa, com Moldura Ouro' })
    expect(avatares.length).toBeGreaterThan(0)
  })

  it('sem nome mostra um texto neutro e as iniciais viram interrogação', async () => {
    await abrirPerfil('estudante', perfilDe('estudante'))
    expect(screen.getByText('Sem nome ainda')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: 'Avatar de usuário' })[0].textContent).toBe('?')
  })

  it('salvar envia nome e avatar escolhidos e atualiza a identidade com o que o servidor devolveu', async () => {
    const fetchMock = await abrirPerfil('estudante', perfilDe('estudante', { nome: 'Ana', avatar: raposa }), (alvo, metodo) =>
      metodo === 'PUT' && alvo.endsWith('/api/v1/aparencia')
        ? respostaJson({ nome: 'Ana Souza', avatar: coruja, moldura, titulo: null })
        : undefined
    )
    fireEvent.change(await screen.findByLabelText('Nome', { selector: '#aparencia-nome' }), { target: { value: 'Ana Souza' } })
    fireEvent.click(await screen.findByRole('radio', { name: 'Coruja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aparência' }))
    await screen.findByText('Aparência salva.')
    const put = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PUT')
    expect(JSON.parse((put?.[1] as { body: string }).body)).toEqual({ nome: 'Ana Souza', avatar: 'coruja' })
    expect(screen.getByText('Ana Souza', { selector: '.identidade-nome' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: 'Avatar de Ana Souza, Coruja, com Moldura Ouro' }).length).toBeGreaterThan(0)
  })

  it('erro do servidor ao salvar aparece como alerta', async () => {
    await abrirPerfil('estudante', perfilDe('estudante'), (alvo, metodo) =>
      metodo === 'PUT' ? respostaJson({ erro: { codigo: 'validacao', mensagem: 'nome nao pode conter @' } }, 400) : undefined
    )
    fireEvent.change(await screen.findByLabelText('Nome', { selector: '#aparencia-nome' }), { target: { value: 'a@b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aparência' }))
    expect((await screen.findByRole('alert')).textContent).toBe('nome nao pode conter @')
  })

  it('só o estudante vê o atalho para trocar moldura ou título, que abre o inventário', async () => {
    await abrirPerfil('estudante', perfilDe('estudante'), (alvo) => (alvo.endsWith('/api/v1/inventario') ? respostaJson({ itens: [] }) : undefined))
    fireEvent.click(screen.getByRole('button', { name: 'Trocar moldura ou título' }))
    await screen.findByRole('heading', { name: 'Inventário', level: 1 })
    cleanup()
    await abrirPerfil('professor', perfilDe('professor', { bio: null }))
    expect(screen.queryByRole('button', { name: 'Trocar moldura ou título' })).toBeNull()
  })
})

describe('Cabeçalho com avatar e nome', () => {
  it('mostra o avatar com a moldura e o nome do usuário logado', async () => {
    vi.stubGlobal(
      'fetch',
      fetchSimulado('estudante', (alvo) =>
        alvo.endsWith('/api/v1/aparencia') ? respostaJson({ nome: 'Ana Souza', avatar: raposa, moldura, titulo: null }) : undefined
      )
    )
    render(<App />)
    await waitFor(() => expect(document.querySelector('.usuario-topo-nome')?.textContent).toBe('Ana Souza'))
    const chip = document.querySelector('.usuario-topo') as HTMLElement
    expect(chip.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Avatar de Ana Souza, Raposa, com Moldura Ouro')
  })

  it('sem nome mostra só o avatar de iniciais; se a consulta falhar, o cabeçalho segue sem o chip', async () => {
    vi.stubGlobal('fetch', fetchSimulado('estudante', (alvo) => (alvo.endsWith('/api/v1/aparencia') ? respostaJson(semAparencia) : undefined)))
    const { unmount } = render(<App />)
    await waitFor(() => expect(document.querySelector('.usuario-topo')).not.toBeNull())
    expect(document.querySelector('.usuario-topo-nome')).toBeNull()
    unmount()
    vi.stubGlobal('fetch', fetchSimulado('estudante'))
    render(<App />)
    await screen.findByRole('button', { name: 'Sair' })
    expect(document.querySelector('.usuario-topo')).toBeNull()
  })
})
