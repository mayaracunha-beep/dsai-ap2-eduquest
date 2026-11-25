import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { OrigemXp, TipoMissao } from '@prisma/client'
import { prisma } from '../../src/server/prisma'
import { listarParaEstudante } from '../../src/server/servicos/missoes'
import { api, criarUsuarioComSessao } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'
import { registrarEvento } from '../utilidades/eventos'

// SPEC/2026-11-19-missoes.md (D9) — T6.2: missões (MS-01–MS-12)

type Usuario = Awaited<ReturnType<typeof criarUsuarioComSessao>>

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const depois = (ms: number) => new Date(Date.now() + ms)

async function missaoNoBanco(
  criadorId: string,
  parcial: Partial<{
    tipo: TipoMissao
    meta: number
    inicio: Date
    fim: Date
    recompensa: number
    cursoId: string | null
    ativa: boolean
  }> = {}
) {
  return prisma.missao.create({
    data: {
      id: randomUUID(),
      titulo: `Missão ${randomUUID().slice(0, 8)}`,
      descricao: '',
      tipo: parcial.tipo ?? 'aulas_concluidas',
      meta: parcial.meta ?? 1,
      inicio: parcial.inicio ?? depois(-HORA),
      fim: parcial.fim ?? depois(DIA),
      recompensa_moedas: parcial.recompensa ?? 10,
      ativa: parcial.ativa ?? true,
      curso_id: parcial.cursoId === undefined ? null : parcial.cursoId,
      criador_id: criadorId,
    },
  })
}

async function ganhosDeMissao(estudante: Usuario): Promise<number> {
  const resposta = await estudante.agente.get('/api/v1/moedas')
  const extrato = resposta.body.extrato as { origem: string; valor: number }[]
  return extrato.filter((m) => m.origem === 'missao').reduce((soma, m) => soma + m.valor, 0)
}

async function daLista(estudante: Usuario, missaoId: string) {
  const resposta = await estudante.agente.get('/api/v1/missoes')
  return (resposta.body.missoes as { missaoId: string }[]).find((m) => m.missaoId === missaoId) as
    | { progresso: number; cumprida: boolean; status: string; meta: number; cumpridaEm: string | null }
    | undefined
}

function corpoValido(cursoId?: string) {
  return {
    titulo: 'Estudo da semana',
    descricao: 'Conclua aulas.',
    tipo: 'aulas_concluidas',
    meta: 10_000,
    inicio: depois(-HORA).toISOString(),
    fim: depois(DIA).toISOString(),
    recompensaMoedas: 0,
    ...(cursoId ? { cursoId } : {}),
  }
}

describe('autorização (MS-08, R-MS10)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const id = randomUUID()
    expect((await api.get('/api/v1/missoes')).status).toBe(401)
    expect((await api.get('/api/v1/missoes/gestao')).status).toBe(401)
    expect((await api.post('/api/v1/missoes').send({})).status).toBe(401)
    expect((await api.patch(`/api/v1/missoes/${id}`).send({})).status).toBe(401)
  })

  it('a lista do estudante é só do estudante', async () => {
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.get('/api/v1/missoes')).status).toBe(403)
    }
  })

  it('estudante não cria, não gerencia e não ajusta missões', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.get('/api/v1/missoes/gestao')).status).toBe(403)
    expect((await estudante.agente.post('/api/v1/missoes').send(corpoValido())).status).toBe(403)
    expect((await estudante.agente.patch(`/api/v1/missoes/${randomUUID()}`).send({ ativa: false })).status).toBe(403)
  })
})

describe('F6-02 — criação (MS-06, MS-07, R-MS6)', () => {
  it('administrador cria missão global e de qualquer curso', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    const { cursoId } = await cursoComAula()
    const global = await admin.agente.post('/api/v1/missoes').send(corpoValido())
    expect(global.status).toBe(201)
    expect(global.body).toMatchObject({ escopo: null, ativa: true, status: 'em_andamento', cumpriram: 0, meta: 10_000 })
    const doCurso = await admin.agente.post('/api/v1/missoes').send(corpoValido(cursoId))
    expect(doCurso.status).toBe(201)
    expect(doCurso.body.escopo).toEqual({ cursoId, cursoTitulo: 'Curso' })
  })

  it('professor cria missão do próprio curso', async () => {
    const { professor, cursoId } = await cursoComAula()
    const resposta = await professor.agente.post('/api/v1/missoes').send(corpoValido(cursoId))
    expect(resposta.status).toBe(201)
    expect(resposta.body.escopo.cursoId).toBe(cursoId)
  })

  it('professor não cria de curso alheio (403), sem curso (403) nem de curso inexistente (404)', async () => {
    const { cursoId } = await cursoComAula()
    const outro = await criarUsuarioComSessao('professor')
    expect((await outro.agente.post('/api/v1/missoes').send(corpoValido(cursoId))).status).toBe(403)
    expect((await outro.agente.post('/api/v1/missoes').send(corpoValido())).status).toBe(403)
    expect((await outro.agente.post('/api/v1/missoes').send(corpoValido(randomUUID()))).status).toBe(404)
    expect((await outro.agente.post('/api/v1/missoes').send({ ...corpoValido(), cursoId: 'xyz' })).status).toBe(404)
  })

  it('corpo inválido: 400 e nada é criado', async () => {
    const { professor, cursoId } = await cursoComAula()
    const antes = await prisma.missao.count({ where: { criador_id: professor.id } })
    for (const alteracao of [{ meta: 0 }, { tipo: 'x' }, { titulo: '' }, { recompensaMoedas: 5000 }, { fim: depois(-HORA).toISOString() }]) {
      const resposta = await professor.agente.post('/api/v1/missoes').send({ ...corpoValido(cursoId), ...alteracao })
      expect(resposta.status).toBe(400)
    }
    expect(await prisma.missao.count({ where: { criador_id: professor.id } })).toBe(antes)
  })
})

describe('progresso e cumprimento (MS-01–MS-05, R-MS2, R-MS4)', () => {
  it.each([
    ['aulas_concluidas', 'conclusao_aula'],
    ['questoes_acertadas', 'acerto_questao'],
    ['avaliacoes_entregues', 'entrega_avaliacao'],
  ] as const)('%s: conta só eventos de %s e paga ao atingir a meta, uma única vez', async (tipo, origem) => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { tipo, meta: 2, recompensa: 7, cursoId })
    const outraOrigem: OrigemXp = origem === 'conclusao_aula' ? 'acerto_questao' : 'conclusao_aula'

    await registrarEvento(estudante.id, cursoId, outraOrigem)
    expect(await daLista(estudante, missao.id)).toMatchObject({ progresso: 0, cumprida: false })

    await registrarEvento(estudante.id, cursoId, origem)
    expect(await daLista(estudante, missao.id)).toMatchObject({ progresso: 1, cumprida: false })
    expect(await ganhosDeMissao(estudante)).toBe(0)

    await registrarEvento(estudante.id, cursoId, origem)
    const cumprida = await daLista(estudante, missao.id)
    expect(cumprida).toMatchObject({ progresso: 2, cumprida: true })
    expect(cumprida?.cumpridaEm).not.toBeNull()
    expect(await ganhosDeMissao(estudante)).toBe(7)

    await registrarEvento(estudante.id, cursoId, origem)
    expect(await ganhosDeMissao(estudante)).toBe(7)
    expect(await prisma.cumprimentoMissao.count({ where: { missao_id: missao.id } })).toBe(1)
  })

  it('xp_ganho soma o XP de qualquer origem e limita o progresso à meta', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { tipo: 'xp_ganho', meta: 50, recompensa: 3, cursoId })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 30)
    expect(await daLista(estudante, missao.id)).toMatchObject({ progresso: 30, cumprida: false })
    await registrarEvento(estudante.id, cursoId, 'acerto_questao', 40)
    expect(await daLista(estudante, missao.id)).toMatchObject({ progresso: 50, meta: 50, cumprida: true })
    expect(await ganhosDeMissao(estudante)).toBe(3)
  })

  it('evento anterior ao início da janela não conta (MS-03)', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { meta: 2, cursoId, inicio: depois(-HORA) })
    await prisma.eventoXp.create({
      data: {
        id: randomUUID(),
        usuario_id: estudante.id,
        origem: 'conclusao_aula',
        referencia_id: randomUUID(),
        curso_id: cursoId,
        chave: `antigo:${randomUUID()}`,
        xp: 0,
        concedido_em: depois(-2 * HORA),
      },
    })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    expect(await daLista(estudante, missao.id)).toMatchObject({ progresso: 1, cumprida: false })
    expect(await ganhosDeMissao(estudante)).toBe(0)
  })

  it('missão encerrada, futura ou desativada não paga (MS-04, R-MS5)', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const encerrada = await missaoNoBanco(professor.id, { cursoId, inicio: depois(-2 * HORA), fim: depois(-HORA) })
    const futura = await missaoNoBanco(professor.id, { cursoId, inicio: depois(HORA), fim: depois(2 * HORA) })
    const desativada = await missaoNoBanco(professor.id, { cursoId, ativa: false })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    expect(await ganhosDeMissao(estudante)).toBe(0)
    expect(await prisma.cumprimentoMissao.count({ where: { missao_id: { in: [encerrada.id, futura.id, desativada.id] } } })).toBe(0)
  })

  it('missão de curso só conta eventos do curso; a global conta de qualquer curso (MS-05)', async () => {
    const a = await cursoComAula()
    const b = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const doCursoA = await missaoNoBanco(a.professor.id, { cursoId: a.cursoId, meta: 1 })
    // tipo avaliacoes_entregues e meta 1: só eventos de entrega a atingem, sem afetar testes de outros arquivos
    const global = await missaoNoBanco(a.professor.id, { tipo: 'avaliacoes_entregues', meta: 1, recompensa: 4 })
    try {
      await registrarEvento(estudante.id, b.cursoId, 'conclusao_aula')
      expect(await daLista(estudante, doCursoA.id)).toMatchObject({ progresso: 0, cumprida: false })
      await registrarEvento(estudante.id, b.cursoId, 'entrega_avaliacao')
      expect(await daLista(estudante, global.id)).toMatchObject({ progresso: 1, cumprida: true })
      expect(await ganhosDeMissao(estudante)).toBe(4)
      await registrarEvento(estudante.id, a.cursoId, 'conclusao_aula')
      expect(await daLista(estudante, doCursoA.id)).toMatchObject({ cumprida: true })
    } finally {
      await prisma.missao.delete({ where: { id: global.id } })
    }
  })

  it('eventos simultâneos pagam a recompensa uma única vez (MS-02)', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { meta: 1, recompensa: 9, cursoId })
    await Promise.all([1, 2, 3, 4].map(() => registrarEvento(estudante.id, cursoId, 'conclusao_aula')))
    expect(await prisma.cumprimentoMissao.count({ where: { missao_id: missao.id } })).toBe(1)
    expect(await ganhosDeMissao(estudante)).toBe(9)
  })

  it('missão com recompensa 0 é cumprida sem movimentar moedas', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { meta: 1, recompensa: 0, cursoId })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    expect(await daLista(estudante, missao.id)).toMatchObject({ cumprida: true })
    expect(await ganhosDeMissao(estudante)).toBe(0)
  })

  it('fluxo real: concluir a aula do curso cumpre a missão e paga em moedas', async () => {
    const { professor, cursoId, aulaId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const criada = await professor.agente.post('/api/v1/missoes').send({ ...corpoValido(cursoId), meta: 1, recompensaMoedas: 12 })
    expect(criada.status).toBe(201)
    expect((await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})).status).toBeLessThan(300)
    expect(await daLista(estudante, criada.body.missaoId)).toMatchObject({ progresso: 1, cumprida: true })
    expect(await ganhosDeMissao(estudante)).toBe(12)
  })
})

describe('F6-01 — listagem do estudante (MS-11, R-MS9)', () => {
  it('mostra só missões ativas e já iniciadas, com status e progresso', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    // fim bem distante para ficar entre as 50 primeiras mesmo com missões de outros testes
    const longe = depois(400 * DIA)
    const visivel = await missaoNoBanco(professor.id, { cursoId, fim: longe })
    const futura = await missaoNoBanco(professor.id, { cursoId, inicio: depois(HORA), fim: longe })
    const inativa = await missaoNoBanco(professor.id, { cursoId, ativa: false, fim: longe })
    const resposta = await estudante.agente.get('/api/v1/missoes')
    const ids = (resposta.body.missoes as { missaoId: string }[]).map((m) => m.missaoId)
    expect(ids).toContain(visivel.id)
    expect(ids).not.toContain(futura.id)
    expect(ids).not.toContain(inativa.id)
    expect(await daLista(estudante, visivel.id)).toMatchObject({ status: 'em_andamento', progresso: 0, cumprida: false })
    expect(resposta.body.missoes.length).toBeLessThanOrEqual(50)
  })

  it('depois do fim a missão continua visível com status encerrada e o que o estudante cumpriu', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { cursoId, meta: 1, fim: depois(300 * DIA) })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    // relógio injetado: 500 dias adiante, a missão já encerrou
    const { missoes } = await listarParaEstudante(estudante.id, depois(500 * DIA))
    const item = missoes.find((m) => m.missaoId === missao.id)
    expect(item).toMatchObject({ status: 'encerrada', cumprida: true, progresso: 1 })
  })

  it('missão de curso não publicado fica oculta', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { cursoId, fim: depois(401 * DIA) })
    await prisma.curso.update({ where: { id: cursoId }, data: { publicado: false } })
    expect(await daLista(estudante, missao.id)).toBeUndefined()
  })
})

describe('F6-03 — gestão (MS-12, R-MS10)', () => {
  it('o professor vê só as missões que criou ou de seus cursos, com a contagem de cumprimentos', async () => {
    const { professor, cursoId } = await cursoComAula()
    const outro = await cursoComAula()
    const minha = await missaoNoBanco(professor.id, { cursoId, meta: 1 })
    const alheia = await missaoNoBanco(outro.professor.id, { cursoId: outro.cursoId })
    const doMeuCursoPorAdmin = await missaoNoBanco(outro.professor.id, { cursoId })
    const estudante = await criarUsuarioComSessao('estudante')
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')

    const resposta = await professor.agente.get('/api/v1/missoes/gestao')
    expect(resposta.status).toBe(200)
    const lista = resposta.body.missoes as { missaoId: string; cumpriram: number }[]
    const ids = lista.map((m) => m.missaoId)
    expect(ids).toContain(minha.id)
    expect(ids).toContain(doMeuCursoPorAdmin.id)
    expect(ids).not.toContain(alheia.id)
    expect(lista.find((m) => m.missaoId === minha.id)?.cumpriram).toBe(1)
  })

  it('o administrador vê todas, inclusive as de outros professores', async () => {
    const { professor, cursoId } = await cursoComAula()
    const admin = await criarUsuarioComSessao('administrador')
    const missao = await missaoNoBanco(professor.id, { cursoId })
    const resposta = await admin.agente.get('/api/v1/missoes/gestao')
    expect((resposta.body.missoes as { missaoId: string }[]).some((m) => m.missaoId === missao.id)).toBe(true)
  })
})

describe('F6-04 — ajuste (MS-09, MS-10, R-MS7, R-MS8)', () => {
  it('ajusta título, descrição, recompensa, fim e disponibilidade', async () => {
    const { professor, cursoId } = await cursoComAula()
    const missao = await missaoNoBanco(professor.id, { cursoId })
    const novoFim = depois(5 * DIA).toISOString()
    const resposta = await professor.agente
      .patch(`/api/v1/missoes/${missao.id}`)
      .send({ titulo: 'Novo título', descricao: 'Nova', recompensaMoedas: 25, fim: novoFim, ativa: false })
    expect(resposta.status).toBe(200)
    expect(resposta.body).toMatchObject({ titulo: 'Novo título', descricao: 'Nova', recompensaMoedas: 25, ativa: false, fim: novoFim })
  })

  it('rejeita campos imutáveis e corpo vazio com 400', async () => {
    const { professor, cursoId } = await cursoComAula()
    const missao = await missaoNoBanco(professor.id, { cursoId, meta: 3 })
    for (const corpo of [{}, { tipo: 'xp_ganho' }, { meta: 9 }, { inicio: depois(0).toISOString() }, { cursoId: null }]) {
      expect((await professor.agente.patch(`/api/v1/missoes/${missao.id}`).send(corpo)).status).toBe(400)
    }
    expect(await prisma.missao.findUniqueOrThrow({ where: { id: missao.id } })).toMatchObject({ meta: 3, tipo: 'aulas_concluidas' })
  })

  it('recompensa nova não é retroativa (MS-09)', async () => {
    const { professor, cursoId } = await cursoComAula()
    const antigo = await criarUsuarioComSessao('estudante')
    const novo = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { cursoId, meta: 1, recompensa: 5 })
    await registrarEvento(antigo.id, cursoId, 'conclusao_aula')
    await professor.agente.patch(`/api/v1/missoes/${missao.id}`).send({ recompensaMoedas: 50 })
    await registrarEvento(novo.id, cursoId, 'conclusao_aula')
    expect(await ganhosDeMissao(antigo)).toBe(5)
    expect(await ganhosDeMissao(novo)).toBe(50)
  })

  it('missão desativada deixa de pagar', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await missaoNoBanco(professor.id, { cursoId, meta: 1, recompensa: 5 })
    await professor.agente.patch(`/api/v1/missoes/${missao.id}`).send({ ativa: false })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    expect(await ganhosDeMissao(estudante)).toBe(0)
  })

  it('alterar o fim de missão encerrada responde 409; desativar continua permitido (MS-10)', async () => {
    const { professor, cursoId } = await cursoComAula()
    const missao = await missaoNoBanco(professor.id, { cursoId, inicio: depois(-3 * DIA), fim: depois(-DIA) })
    const reaberta = await professor.agente.patch(`/api/v1/missoes/${missao.id}`).send({ fim: depois(DIA).toISOString() })
    expect(reaberta.status).toBe(409)
    expect((await professor.agente.patch(`/api/v1/missoes/${missao.id}`).send({ ativa: false })).status).toBe(200)
  })

  it('404 para inexistente ou id malformado; 403 para outro professor; administrador pode', async () => {
    const { professor, cursoId } = await cursoComAula()
    const outro = await criarUsuarioComSessao('professor')
    const admin = await criarUsuarioComSessao('administrador')
    const missao = await missaoNoBanco(professor.id, { cursoId })
    expect((await professor.agente.patch(`/api/v1/missoes/${randomUUID()}`).send({ ativa: false })).status).toBe(404)
    expect((await professor.agente.patch('/api/v1/missoes/abc').send({ ativa: false })).status).toBe(404)
    expect((await outro.agente.patch(`/api/v1/missoes/${missao.id}`).send({ ativa: false })).status).toBe(403)
    expect((await admin.agente.patch(`/api/v1/missoes/${missao.id}`).send({ titulo: 'Pelo admin' })).status).toBe(200)
  })
})

describe('R-MS5 — o banco também protege a missão', () => {
  it('rejeita meta não positiva e janela invertida por CHECK', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    await expect(missaoNoBanco(admin.id, { meta: 0 })).rejects.toThrow()
    await expect(missaoNoBanco(admin.id, { inicio: depois(DIA), fim: depois(HORA) })).rejects.toThrow()
  })
})
