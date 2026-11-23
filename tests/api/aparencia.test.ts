import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CategoriaItem } from '@prisma/client'
import { prisma } from '../../src/server/prisma'
import { AVATARES } from '../../src/server/servicos/aparencia'
import { api, criarUsuarioComSessao, emailUnico } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'
import { registrarEvento } from '../utilidades/eventos'

// SPEC/2026-11-21-nome-avatar-moldura.md — nome, avatar e moldura (AV-01–AV-10)

type Usuario = Awaited<ReturnType<typeof criarUsuarioComSessao>>

// item inativo (fora da vitrine) para não interferir nos testes da loja, que leem o catálogo
async function darItem(usuarioId: string, categoria: CategoriaItem, equipado: boolean) {
  const item = await prisma.itemLoja.create({
    data: {
      id: randomUUID(),
      codigo: `teste-av-${randomUUID()}`,
      nome: categoria === 'moldura' ? 'Moldura de teste' : 'Título de teste',
      descricao: 'Item do teste.',
      categoria,
      preco: 1,
      ativo: false,
      ordem: 3_000_000 + Math.floor(Math.random() * 1_000_000_000),
    },
  })
  await prisma.itemInventario.create({
    data: { id: randomUUID(), usuario_id: usuarioId, item_id: item.id, equipado, adquirido_em: new Date() },
  })
  return item
}

const senha = 'senha-larga-123'

describe('F11-01 — catálogo de avatares público (AV-03)', () => {
  it('responde sem sessão com as 12 opções', async () => {
    const resposta = await api.get('/api/v1/avatares')
    expect(resposta.status).toBe(200)
    expect(resposta.body.avatares).toHaveLength(12)
    expect(resposta.body.avatares).toEqual(AVATARES)
    expect(new Set(resposta.body.avatares.map((a: { id: string }) => a.id)).size).toBe(12)
  })
})

describe('cadastro com nome e avatar (AV-01, AV-02, R-AV1)', () => {
  it('grava nome e avatar e os mostra no perfil, sem e-mail', async () => {
    const email = emailUnico()
    const registro = await api.post('/api/v1/auth/registro').send({ email, senha, nome: '  Ana Souza  ', avatar: 'raposa' })
    expect(registro.status).toBe(201)
    expect(Object.keys(registro.body).sort()).toEqual(['papel', 'usuarioId'])
    const observador = await criarUsuarioComSessao('estudante')
    const perfil = await observador.agente.get(`/api/v1/perfis/${registro.body.usuarioId}`)
    expect(perfil.body).toMatchObject({
      nome: 'Ana Souza',
      avatar: { id: 'raposa', rotulo: 'Raposa', emoji: '🦊' },
      moldura: null,
      titulo: null,
    })
    expect(JSON.stringify(perfil.body)).not.toContain(email)
  })

  it('continua funcionando sem nome e sem avatar (compatibilidade)', async () => {
    const registro = await api.post('/api/v1/auth/registro').send({ email: emailUnico(), senha })
    expect(registro.status).toBe(201)
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: registro.body.usuarioId } })
    expect(usuario.nome).toBeNull()
    expect(usuario.avatar).toBeNull()
  })

  it.each([
    ['nome vazio', { nome: '' }],
    ['nome só com espaços', { nome: '   ' }],
    ['nome com @', { nome: 'ana@exemplo.com' }],
    ['nome longo demais', { nome: 'x'.repeat(61) }],
    ['nome não textual', { nome: 7 }],
    ['avatar fora do catálogo', { avatar: 'dinossauro' }],
    ['avatar não textual', { avatar: 3 }],
  ])('%s: 400 e nenhuma conta é criada', async (_rotulo, extra) => {
    const email = emailUnico()
    const resposta = await api.post('/api/v1/auth/registro').send({ email, senha, ...extra })
    expect(resposta.status).toBe(400)
    expect(await prisma.usuario.count({ where: { email } })).toBe(0)
  })

  it('o papel continua sendo decidido pelo servidor, mesmo com nome e avatar', async () => {
    const registro = await api.post('/api/v1/auth/registro').send({ email: emailUnico(), senha, nome: 'Admin', papel: 'administrador' })
    expect(registro.status).toBe(201)
    expect(registro.body.papel).toBe('estudante')
  })
})

describe('GET/PUT /aparencia (AV-04, AV-05, R-AV5)', () => {
  it('sem sessão: 401', async () => {
    expect((await api.get('/api/v1/aparencia')).status).toBe(401)
    expect((await api.put('/api/v1/aparencia').send({ nome: 'X' })).status).toBe(401)
  })

  it('qualquer papel lê e altera a própria aparência', async () => {
    for (const papel of ['estudante', 'professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.get('/api/v1/aparencia')).body).toEqual({ nome: null, avatar: null, moldura: null, titulo: null })
      const resposta = await usuario.agente.put('/api/v1/aparencia').send({ nome: `Pessoa ${papel}`, avatar: 'coruja' })
      expect(resposta.status).toBe(200)
      expect(resposta.body).toMatchObject({ nome: `Pessoa ${papel}`, avatar: { id: 'coruja' }, moldura: null, titulo: null })
    }
  })

  it('é parcial: altera só o que foi enviado; avatar null remove', async () => {
    const usuario = await criarUsuarioComSessao('estudante')
    await usuario.agente.put('/api/v1/aparencia').send({ nome: 'Beatriz', avatar: 'gato' })
    const soNome = await usuario.agente.put('/api/v1/aparencia').send({ nome: '  Beatriz Lima ' })
    expect(soNome.body).toMatchObject({ nome: 'Beatriz Lima', avatar: { id: 'gato' } })
    const semAvatar = await usuario.agente.put('/api/v1/aparencia').send({ avatar: null })
    expect(semAvatar.body).toMatchObject({ nome: 'Beatriz Lima', avatar: null })
  })

  it.each([
    ['corpo vazio', {}],
    ['nome vazio', { nome: '' }],
    ['nome nulo', { nome: null }],
    ['nome com @', { nome: 'a@b.com' }],
    ['nome longo demais', { nome: 'x'.repeat(61) }],
    ['avatar fora do catálogo', { avatar: 'dinossauro' }],
    ['campo desconhecido', { nome: 'Ok', papel: 'administrador' }],
  ])('rejeita %s com 400 e não altera nada', async (_rotulo, corpo) => {
    const usuario = await criarUsuarioComSessao('estudante')
    await usuario.agente.put('/api/v1/aparencia').send({ nome: 'Original', avatar: 'panda' })
    expect((await usuario.agente.put('/api/v1/aparencia').send(corpo)).status).toBe(400)
    expect((await usuario.agente.get('/api/v1/aparencia')).body).toMatchObject({ nome: 'Original', avatar: { id: 'panda' } })
  })

  it('corpo que não é objeto responde 400', async () => {
    const usuario = await criarUsuarioComSessao('estudante')
    expect((await usuario.agente.put('/api/v1/aparencia').send([1])).status).toBe(400)
  })

  it('cada usuário só altera o próprio perfil', async () => {
    const a = await criarUsuarioComSessao('estudante')
    const b = await criarUsuarioComSessao('estudante')
    await a.agente.put('/api/v1/aparencia').send({ nome: 'Só da A' })
    expect((await b.agente.get('/api/v1/aparencia')).body.nome).toBeNull()
  })

  it('o banco também recusa nome vazio', async () => {
    const usuario = await criarUsuarioComSessao('estudante')
    await expect(prisma.usuario.update({ where: { id: usuario.id }, data: { nome: '   ' } })).rejects.toThrow()
  })
})

describe('moldura e título equipados (AV-06, AV-07, AV-08, R-AV4, R-AV7)', () => {
  it('aparecem em aparencia e no perfil; desequipar remove', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const moldura = await darItem(estudante.id, 'moldura', true)
    const titulo = await darItem(estudante.id, 'titulo', true)
    const esperado = {
      moldura: { codigo: moldura.codigo, nome: 'Moldura de teste' },
      titulo: { codigo: titulo.codigo, nome: 'Título de teste' },
    }
    expect((await estudante.agente.get('/api/v1/aparencia')).body).toMatchObject(esperado)
    const observador = await criarUsuarioComSessao('professor')
    expect((await observador.agente.get(`/api/v1/perfis/${estudante.id}`)).body).toMatchObject(esperado)

    await estudante.agente.put(`/api/v1/inventario/${moldura.id}/equipado`).send({ equipado: false })
    expect((await estudante.agente.get('/api/v1/aparencia')).body).toMatchObject({ moldura: null, titulo: esperado.titulo })
  })

  it('item possuído mas não equipado não aparece', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await darItem(estudante.id, 'moldura', false)
    expect((await estudante.agente.get('/api/v1/aparencia')).body).toMatchObject({ moldura: null, titulo: null })
  })

  it('a moldura de um estudante nunca aparece no perfil de outro', async () => {
    const dono = await criarUsuarioComSessao('estudante')
    const outro = await criarUsuarioComSessao('estudante')
    await darItem(dono.id, 'moldura', true)
    expect((await outro.agente.get(`/api/v1/perfis/${outro.id}`)).body.moldura).toBeNull()
    expect((await outro.agente.get('/api/v1/aparencia')).body.moldura).toBeNull()
  })

  it('professor e administrador têm moldura e título nulos mesmo que existam registros', async () => {
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      await darItem(usuario.id, 'moldura', true)
      expect((await usuario.agente.get('/api/v1/aparencia')).body).toMatchObject({ moldura: null, titulo: null })
      expect((await usuario.agente.get(`/api/v1/perfis/${usuario.id}`)).body).toMatchObject({ moldura: null, titulo: null })
    }
  })
})

describe('privacidade do nome (AV-09, AV-10, R-AV2, R-AV6)', () => {
  it('o perfil mostra o nome mas nunca o e-mail', async () => {
    const registro = await api.post('/api/v1/auth/registro').send({ email: 'privado-xyz@exemplo.test', senha, nome: 'Carla Dias' })
    const observador = await criarUsuarioComSessao('estudante')
    const texto = JSON.stringify((await observador.agente.get(`/api/v1/perfis/${registro.body.usuarioId}`)).body)
    expect(texto).toContain('Carla Dias')
    expect(texto).not.toContain('@')
    expect(texto).not.toContain('privado-xyz')
  })

  it('o nome não aparece nos rankings, nem com avatar escolhido', async () => {
    const { cursoId } = await cursoComAula()
    const estudante: Usuario = await criarUsuarioComSessao('estudante')
    await estudante.agente.put('/api/v1/aparencia').send({ nome: 'Nome Secreto Ranking', avatar: 'robo' })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 500)
    const observador = await criarUsuarioComSessao('estudante')
    const ranking = await observador.agente.get(`/api/v1/rankings?escopo=curso&cursoId=${cursoId}`)
    expect(ranking.status).toBe(200)
    expect(ranking.body.entradas).toHaveLength(1)
    const texto = JSON.stringify(ranking.body)
    expect(texto).not.toContain('Secreto')
    expect(texto).not.toContain('robo')
    expect(ranking.body.entradas[0].nome).toMatch(/^Estudante [0-9A-F]{6}$/)
  })
})
