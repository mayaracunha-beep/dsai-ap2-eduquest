import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TipoNotificacao } from '@prisma/client'
import { prisma } from '../../src/server/prisma'
import { creditarPorXp } from '../../src/server/servicos/moedas'
import { notificar, podar } from '../../src/server/servicos/notificacoes'
import { api, criarUsuarioComSessao } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'
import { registrarEvento } from '../utilidades/eventos'

// SPEC/2026-11-19-notificacoes.md (D13) — T9.2: notificações in-app (NT-01–NT-09)

type Usuario = Awaited<ReturnType<typeof criarUsuarioComSessao>>

const HORA = 60 * 60 * 1000

interface Dto {
  notificacaoId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  lida: boolean
  criadaEm: string
  lidaEm: string | null
}

async function listar(estudante: Usuario, query = ''): Promise<{ naoLidas: number; notificacoes: Dto[] }> {
  const resposta = await estudante.agente.get(`/api/v1/notificacoes${query}`)
  expect(resposta.status).toBe(200)
  return resposta.body
}

async function dosTipo(estudante: Usuario, tipo: TipoNotificacao): Promise<Dto[]> {
  return (await listar(estudante, '?limite=50')).notificacoes.filter((n) => n.tipo === tipo)
}

async function criarDireto(usuarioId: string, parcial: Partial<{ chave: string; lida: boolean; quando: Date }> = {}) {
  return prisma.notificacao.create({
    data: {
      id: randomUUID(),
      usuario_id: usuarioId,
      tipo: 'nivel_alcancado',
      titulo: 'Novo nível!',
      mensagem: 'Você chegou ao nível 2.',
      chave: parcial.chave ?? `direto:${randomUUID()}`,
      criado_em: parcial.quando ?? new Date(),
      lida_em: parcial.lida ? new Date() : null,
    },
  })
}

describe('autorização (NT-05, R-NT5)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const id = randomUUID()
    expect((await api.get('/api/v1/notificacoes')).status).toBe(401)
    expect((await api.post('/api/v1/notificacoes/marcar-todas-lidas')).status).toBe(401)
    expect((await api.get('/api/v1/notificacoes/preferencias')).status).toBe(401)
    expect((await api.patch('/api/v1/notificacoes/preferencias').send({})).status).toBe(401)
    expect((await api.patch(`/api/v1/notificacoes/${id}/lida`)).status).toBe(401)
  })

  it('professor e administrador recebem 403 em todas as rotas', async () => {
    const id = randomUUID()
    for (const papel of ['professor', 'administrador'] as const) {
      const { agente } = await criarUsuarioComSessao(papel)
      expect((await agente.get('/api/v1/notificacoes')).status).toBe(403)
      expect((await agente.post('/api/v1/notificacoes/marcar-todas-lidas')).status).toBe(403)
      expect((await agente.get('/api/v1/notificacoes/preferencias')).status).toBe(403)
      expect((await agente.patch('/api/v1/notificacoes/preferencias').send({ tipo: 'item_comprado', ativa: false })).status).toBe(403)
      expect((await agente.patch(`/api/v1/notificacoes/${id}/lida`)).status).toBe(403)
    }
  })

  it('não lê nem marca a notificação de outro estudante (404)', async () => {
    const dono = await criarUsuarioComSessao('estudante')
    const outro = await criarUsuarioComSessao('estudante')
    const alheia = await criarDireto(dono.id)
    expect((await outro.agente.patch(`/api/v1/notificacoes/${alheia.id}/lida`)).status).toBe(404)
    expect((await outro.agente.patch(`/api/v1/notificacoes/${randomUUID()}/lida`)).status).toBe(404)
    expect((await outro.agente.patch('/api/v1/notificacoes/abc/lida')).status).toBe(404)
    expect((await listar(outro)).notificacoes).toEqual([])
    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: alheia.id } })).lida_em).toBeNull()
  })
})

describe('eventos disparadores (NT-01, NT-02, R-NT2)', () => {
  it('conquista: o fluxo real de concluir aula avisa cada conquista desbloqueada, uma vez', async () => {
    const { aulaId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    const desbloqueios = await prisma.desbloqueioConquista.findMany({
      where: { usuario_id: estudante.id },
      include: { conquista: true },
    })
    expect(desbloqueios.length).toBeGreaterThan(0)
    const avisos = await dosTipo(estudante, 'conquista_desbloqueada')
    expect(avisos).toHaveLength(desbloqueios.length)
    for (const desbloqueio of desbloqueios) {
      expect(avisos.some((a) => a.mensagem === `Você desbloqueou "${desbloqueio.conquista.nome}".`)).toBe(true)
    }
    expect(avisos[0]).toMatchObject({ titulo: 'Nova conquista!', lida: false, lidaEm: null })
    // repetir a conclusão não cria avisos novos
    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    expect(await dosTipo(estudante, 'conquista_desbloqueada')).toHaveLength(desbloqueios.length)
  })

  it('nível: subir de nível avisa uma vez e eventos sem subida não repetem', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const resultado = await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 100_000)
    expect(resultado.nivel).toBeGreaterThan(1)
    const avisos = await dosTipo(estudante, 'nivel_alcancado')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({ titulo: 'Novo nível!', mensagem: `Você chegou ao nível ${resultado.nivel}.` })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 0)
    expect(await dosTipo(estudante, 'nivel_alcancado')).toHaveLength(1)
  })

  it('missão cumprida: avisa com título e moedas, uma vez', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await prisma.missao.create({
      data: {
        id: randomUUID(),
        titulo: 'Maratona NT',
        descricao: '',
        tipo: 'aulas_concluidas',
        meta: 1,
        inicio: new Date(Date.now() - HORA),
        fim: new Date(Date.now() + 24 * HORA),
        recompensa_moedas: 8,
        curso_id: cursoId,
        criador_id: professor.id,
      },
    })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    const avisos = await dosTipo(estudante, 'missao_cumprida')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].mensagem).toBe('Você cumpriu "Maratona NT" e ganhou 8 moedas.')
    expect(await prisma.notificacao.count({ where: { usuario_id: estudante.id, chave: `missao:${missao.id}` } })).toBe(1)
  })

  it('compra: avisa o item comprado; a segunda compra (409) não avisa de novo', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await prisma.$transaction((tx) => creditarPorXp(tx, estudante.id, `teste:${randomUUID()}`, randomUUID(), 500))
    const item = await prisma.itemLoja.create({
      data: {
        id: randomUUID(),
        codigo: `teste-nt-${randomUUID()}`,
        nome: 'Moldura NT',
        descricao: 'Item do teste.',
        categoria: 'moldura',
        preco: 10,
        ordem: 2_000_000 + Math.floor(Math.random() * 1_000_000_000),
      },
    })
    expect((await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(201)
    expect((await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(409)
    const avisos = await dosTipo(estudante, 'item_comprado')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].mensagem).toBe('Moldura NT já está no seu inventário.')
  })

  it('o mesmo evento nunca avisa duas vezes: a chave é única por estudante (NT-02)', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const outro = await criarUsuarioComSessao('estudante')
    const disparo = { tipo: 'nivel_alcancado' as const, chave: 'nivel:3', dados: { nivel: 3 } }
    expect(await prisma.$transaction((tx) => notificar(tx, estudante.id, disparo))).toBe(true)
    expect(await prisma.$transaction((tx) => notificar(tx, estudante.id, disparo))).toBe(false)
    expect(await dosTipo(estudante, 'nivel_alcancado')).toHaveLength(1)
    // a mesma chave para outro estudante é outro evento
    expect(await prisma.$transaction((tx) => notificar(tx, outro.id, disparo))).toBe(true)
  })

  it('a notificação é atômica com o evento: transação desfeita não deixa aviso (NT-09)', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await expect(
      prisma.$transaction(async (tx) => {
        await notificar(tx, estudante.id, { tipo: 'nivel_alcancado', chave: 'nivel:9', dados: { nivel: 9 } })
        throw new Error('falha depois do aviso')
      })
    ).rejects.toThrow('falha depois do aviso')
    expect(await prisma.notificacao.count({ where: { usuario_id: estudante.id } })).toBe(0)
  })
})

describe('preferências (NT-03, R-NT3)', () => {
  it('por padrão todos os tipos estão ativos, com rótulo', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.get('/api/v1/notificacoes/preferencias')
    expect(resposta.status).toBe(200)
    expect(resposta.body.preferencias).toEqual([
      { tipo: 'conquista_desbloqueada', rotulo: 'Conquistas desbloqueadas', ativa: true },
      { tipo: 'missao_cumprida', rotulo: 'Missões cumpridas', ativa: true },
      { tipo: 'item_comprado', rotulo: 'Compras na loja', ativa: true },
      { tipo: 'nivel_alcancado', rotulo: 'Novos níveis', ativa: true },
    ])
  })

  it('tipo desativado não gera aviso; reativar não recria os suprimidos', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const desligar = await estudante.agente.patch('/api/v1/notificacoes/preferencias').send({ tipo: 'nivel_alcancado', ativa: false })
    expect(desligar.status).toBe(200)
    expect(desligar.body.preferencias.find((p: { tipo: string }) => p.tipo === 'nivel_alcancado').ativa).toBe(false)

    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 100_000)
    expect(await dosTipo(estudante, 'nivel_alcancado')).toHaveLength(0)

    await estudante.agente.patch('/api/v1/notificacoes/preferencias').send({ tipo: 'nivel_alcancado', ativa: true })
    expect(await dosTipo(estudante, 'nivel_alcancado')).toHaveLength(0)
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 5_000_000)
    expect((await dosTipo(estudante, 'nivel_alcancado')).length).toBeGreaterThan(0)
  })

  it('desativar um tipo não afeta os outros nem apaga os já criados', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await prisma.$transaction((tx) => notificar(tx, estudante.id, { tipo: 'item_comprado', chave: 'compra:a', dados: { nome: 'A' } }))
    await estudante.agente.patch('/api/v1/notificacoes/preferencias').send({ tipo: 'item_comprado', ativa: false })
    expect(await dosTipo(estudante, 'item_comprado')).toHaveLength(1)
    await prisma.$transaction((tx) => notificar(tx, estudante.id, { tipo: 'item_comprado', chave: 'compra:b', dados: { nome: 'B' } }))
    expect(await dosTipo(estudante, 'item_comprado')).toHaveLength(1)
    await prisma.$transaction((tx) => notificar(tx, estudante.id, { tipo: 'nivel_alcancado', chave: 'nivel:2', dados: { nivel: 2 } }))
    expect(await dosTipo(estudante, 'nivel_alcancado')).toHaveLength(1)
  })

  it.each([
    ['corpo vazio', {}],
    ['tipo desconhecido', { tipo: 'spam', ativa: false }],
    ['tipo ausente', { ativa: false }],
    ['ativa ausente', { tipo: 'item_comprado' }],
    ['ativa não booleana', { tipo: 'item_comprado', ativa: 'nao' }],
    ['campo desconhecido', { tipo: 'item_comprado', ativa: false, extra: 1 }],
  ])('rejeita %s com 400', async (_rotulo, corpo) => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.patch('/api/v1/notificacoes/preferencias').send(corpo)).status).toBe(400)
    const { body } = await estudante.agente.get('/api/v1/notificacoes/preferencias')
    expect(body.preferencias.every((p: { ativa: boolean }) => p.ativa)).toBe(true)
  })

  it('corpo que não é objeto responde 400', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.patch('/api/v1/notificacoes/preferencias').send([1])).status).toBe(400)
  })
})

describe('leitura (NT-04, R-NT4)', () => {
  it('marcar como lida registra a primeira leitura e é idempotente', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const [a, b] = [await criarDireto(estudante.id), await criarDireto(estudante.id)]
    const primeira = await estudante.agente.patch(`/api/v1/notificacoes/${a.id}/lida`)
    expect(primeira.status).toBe(200)
    expect(primeira.body).toMatchObject({ notificacaoId: a.id, lida: true })
    expect(primeira.body.lidaEm).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 15))
    const segunda = await estudante.agente.patch(`/api/v1/notificacoes/${a.id}/lida`)
    expect(segunda.body.lidaEm).toBe(primeira.body.lidaEm)
    expect((await listar(estudante)).naoLidas).toBe(1)
    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: b.id } })).lida_em).toBeNull()
  })

  it('marcar todas afeta só as não lidas do estudante', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const outro = await criarUsuarioComSessao('estudante')
    const jaLida = await criarDireto(estudante.id, { lida: true })
    await criarDireto(estudante.id)
    await criarDireto(estudante.id)
    await criarDireto(outro.id)
    const lidaAntes = jaLida.lida_em
    const resposta = await estudante.agente.post('/api/v1/notificacoes/marcar-todas-lidas')
    expect(resposta.body).toEqual({ marcadas: 2 })
    expect((await listar(estudante)).naoLidas).toBe(0)
    expect((await listar(outro)).naoLidas).toBe(1)
    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: jaLida.id } })).lida_em).toEqual(lidaAntes)
    expect((await estudante.agente.post('/api/v1/notificacoes/marcar-todas-lidas')).body).toEqual({ marcadas: 0 })
  })
})

describe('listagem (NT-06, NT-07, R-NT6)', () => {
  it('traz as mais recentes primeiro, respeita o limite e informa o total de não lidas', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const agora = Date.now()
    const antiga = await criarDireto(estudante.id, { quando: new Date(agora - 3 * HORA) })
    const meio = await criarDireto(estudante.id, { quando: new Date(agora - 2 * HORA) })
    const recente = await criarDireto(estudante.id, { quando: new Date(agora - HORA) })
    const todas = await listar(estudante)
    expect(todas.notificacoes.map((n) => n.notificacaoId)).toEqual([recente.id, meio.id, antiga.id])
    expect(todas.naoLidas).toBe(3)
    const limitada = await listar(estudante, '?limite=2')
    expect(limitada.notificacoes.map((n) => n.notificacaoId)).toEqual([recente.id, meio.id])
    expect(limitada.naoLidas).toBe(3)
  })

  it('apenasNaoLidas filtra as lidas', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await criarDireto(estudante.id, { lida: true })
    const pendente = await criarDireto(estudante.id)
    const resposta = await listar(estudante, '?apenasNaoLidas=true')
    expect(resposta.notificacoes.map((n) => n.notificacaoId)).toEqual([pendente.id])
    expect((await listar(estudante, '?apenasNaoLidas=false')).notificacoes).toHaveLength(2)
  })

  it('estudante novo tem lista vazia e zero não lidas', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect(await listar(estudante)).toEqual({ naoLidas: 0, notificacoes: [] })
  })

  it.each([['?limite=0'], ['?limite=51'], ['?limite=abc'], ['?apenasNaoLidas=sim'], ['?pagina=2']])(
    'consulta %s responde 400',
    async (query) => {
      const estudante = await criarUsuarioComSessao('estudante')
      expect((await estudante.agente.get(`/api/v1/notificacoes${query}`)).status).toBe(400)
    }
  )

  it('o DTO não expõe e-mail nem identificador de usuário', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await criarDireto(estudante.id)
    const { notificacoes } = await listar(estudante)
    expect(Object.keys(notificacoes[0]).sort()).toEqual(['criadaEm', 'lida', 'lidaEm', 'mensagem', 'notificacaoId', 'tipo', 'titulo'])
    expect(JSON.stringify(notificacoes)).not.toContain(estudante.id)
  })
})

describe('retenção (NT-08, R-NT8)', () => {
  it('apaga só as lidas mais antigas quando excede o limite', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const agora = Date.now()
    const lidaAntiga = await criarDireto(estudante.id, { lida: true, quando: new Date(agora - 5 * HORA) })
    const lidaMeio = await criarDireto(estudante.id, { lida: true, quando: new Date(agora - 4 * HORA) })
    const lidaNova = await criarDireto(estudante.id, { lida: true, quando: new Date(agora - 3 * HORA) })
    const naoLidaAntiga = await criarDireto(estudante.id, { quando: new Date(agora - 6 * HORA) })
    const naoLidaNova = await criarDireto(estudante.id, { quando: new Date(agora - HORA) })
    const apagadas = await prisma.$transaction((tx) => podar(tx, estudante.id, 3))
    expect(apagadas).toBe(2)
    const restantes = (await prisma.notificacao.findMany({ where: { usuario_id: estudante.id } })).map((n) => n.id).sort()
    expect(restantes).toEqual([lidaNova.id, naoLidaAntiga.id, naoLidaNova.id].sort())
    expect(restantes).not.toContain(lidaAntiga.id)
    expect(restantes).not.toContain(lidaMeio.id)
  })

  it('nunca apaga não lidas, mesmo acima do limite', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    for (let i = 0; i < 4; i++) await criarDireto(estudante.id)
    expect(await prisma.$transaction((tx) => podar(tx, estudante.id, 2))).toBe(0)
    expect(await prisma.notificacao.count({ where: { usuario_id: estudante.id } })).toBe(4)
  })

  it('dentro do limite não apaga nada', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await criarDireto(estudante.id, { lida: true })
    expect(await prisma.$transaction((tx) => podar(tx, estudante.id, 5))).toBe(0)
  })
})
