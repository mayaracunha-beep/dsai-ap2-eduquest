import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/server/prisma'
import { creditarPorXp } from '../../src/server/servicos/moedas'
import { ITENS_POR_SECAO } from '../../src/server/servicos/painel'
import { api, criarUsuarioComSessao } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'
import { registrarEvento } from '../utilidades/eventos'

// SPEC/2026-11-19-painel-acessibilidade.md (F10-01) — PN-01–PN-09

type Usuario = Awaited<ReturnType<typeof criarUsuarioComSessao>>

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

async function painel(estudante: Usuario) {
  const resposta = await estudante.agente.get('/api/v1/painel')
  expect(resposta.status).toBe(200)
  return resposta.body
}

async function aulaExtra(professor: Usuario['agente'] extends never ? never : Usuario, moduloId: string) {
  const aula = await professor.agente.post(`/api/v1/modulos/${moduloId}/aulas`).send({ titulo: 'Aula extra' })
  await professor.agente.patch(`/api/v1/aulas/${aula.body.aulaId}`).send({ publicado: true })
  return aula.body.aulaId as string
}

describe('autorização (PN-01, R-PN1)', () => {
  it('sem sessão 401; professor e administrador 403', async () => {
    expect((await api.get('/api/v1/painel')).status).toBe(401)
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.get('/api/v1/painel')).status).toBe(403)
    }
  })
})

describe('painel do estudante novo (PN-02, R-PN6)', () => {
  it('traz zeros, listas vazias e posição nula', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const corpo = await painel(estudante)
    expect(Number.isNaN(new Date(corpo.geradoEm).getTime())).toBe(false)
    expect(corpo.xp).toMatchObject({ xpTotal: 0, xpSemana: 0, nivel: 1 })
    expect(corpo.moedas).toEqual({ saldo: 0 })
    expect(corpo.conquistas.desbloqueadas).toBe(0)
    expect(corpo.conquistas.total).toBeGreaterThan(0)
    expect(corpo.conquistas.recentes).toEqual([])
    expect(corpo.notificacoes).toEqual({ naoLidas: 0, recentes: [] })
    expect(corpo.ranking).toMatchObject({ posicao: null, valor: null })
    expect(corpo.cursos).toEqual([])
  })
})

describe('XP, moedas e ranking (PN-03, PN-07)', () => {
  it('refletem os dados reais do estudante', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 100_000)
    await prisma.$transaction((tx) => creditarPorXp(tx, estudante.id, `teste:${randomUUID()}`, randomUUID(), 50))
    const corpo = await painel(estudante)
    expect(corpo.xp.xpTotal).toBe(100_000)
    expect(corpo.xp.xpSemana).toBe(100_000)
    expect(corpo.xp.nivel).toBeGreaterThan(1)
    expect(corpo.moedas.saldo).toBe(20_000 + 10)
    expect(corpo.ranking.valor).toBe(100_000)
    expect(corpo.ranking.posicao).toBeGreaterThanOrEqual(1)
    expect(corpo.ranking.totalParticipantes).toBeGreaterThanOrEqual(1)
  })

  it('estudante oculto no ranking recebe posição e valor nulos (R-PN5)', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula', 700)
    await estudante.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'oculto' })
    const corpo = await painel(estudante)
    expect(corpo.ranking.posicao).toBeNull()
    expect(corpo.ranking.valor).toBeNull()
    expect(corpo.xp.xpTotal).toBe(700)
  })
})

describe('missões (PN-04, R-PN2)', () => {
  it('só em andamento e não cumpridas, no máximo 3, prazo mais próximo primeiro', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const agora = Date.now()
    const criar = (fimEmMin: number, parcial: { inicioEmMin?: number; ativa?: boolean; meta?: number } = {}) =>
      prisma.missao.create({
        data: {
          id: randomUUID(),
          titulo: `Painel ${fimEmMin}`,
          descricao: '',
          tipo: 'aulas_concluidas',
          meta: parcial.meta ?? 5,
          inicio: new Date(agora + (parcial.inicioEmMin ?? -60) * MINUTO),
          fim: new Date(agora + fimEmMin * MINUTO),
          recompensa_moedas: 1,
          ativa: parcial.ativa ?? true,
          curso_id: cursoId,
          criador_id: professor.id,
        },
      })
    const ordem = [await criar(40), await criar(10), await criar(30), await criar(20)]
    await criar(5, { ativa: false })
    await criar(3, { inicioEmMin: 2 })
    await criar(-10, { inicioEmMin: -120 })
    const corpo = await painel(estudante)
    const mias = (corpo.missoes as { missaoId: string }[]).map((m) => m.missaoId)
    // as mais próximas do prazo vêm primeiro; inativa, futura e encerrada ficam de fora
    const esperadas = [ordem[1], ordem[3], ordem[2]].map((m) => m.id)
    expect(mias.slice(0, ITENS_POR_SECAO)).toEqual(esperadas)
    expect(corpo.missoes.length).toBeLessThanOrEqual(ITENS_POR_SECAO)
    expect(Object.keys(corpo.missoes[0]).sort()).toEqual(['fim', 'meta', 'missaoId', 'progresso', 'recompensaMoedas', 'tipo', 'titulo'])
  })

  it('missão já cumprida não aparece', async () => {
    const { professor, cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    const missao = await prisma.missao.create({
      data: {
        id: randomUUID(),
        titulo: 'Já cumprida',
        descricao: '',
        tipo: 'aulas_concluidas',
        meta: 1,
        inicio: new Date(Date.now() - HORA),
        fim: new Date(Date.now() + 5 * MINUTO),
        recompensa_moedas: 0,
        curso_id: cursoId,
        criador_id: professor.id,
      },
    })
    await registrarEvento(estudante.id, cursoId, 'conclusao_aula')
    const ids = (await painel(estudante)).missoes.map((m: { missaoId: string }) => m.missaoId)
    expect(ids).not.toContain(missao.id)
  })
})

describe('conquistas e notificações (PN-05, PN-06)', () => {
  it('conta, informa o total e lista as 3 conquistas mais recentes em ordem', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const catalogo = await prisma.conquista.findMany({ orderBy: { ordem: 'asc' }, take: 4 })
    const base = Date.now() - 10 * DIA
    for (const [indice, conquista] of catalogo.entries()) {
      await prisma.desbloqueioConquista.create({
        data: { id: randomUUID(), usuario_id: estudante.id, conquista_id: conquista.id, desbloqueada_em: new Date(base + indice * DIA) },
      })
    }
    const corpo = await painel(estudante)
    expect(corpo.conquistas.desbloqueadas).toBe(4)
    expect(corpo.conquistas.total).toBe(await prisma.conquista.count())
    expect(corpo.conquistas.recentes.map((c: { codigo: string }) => c.codigo)).toEqual([catalogo[3], catalogo[2], catalogo[1]].map((c) => c.codigo))
  })

  it('total de não lidas e as 3 não lidas mais recentes', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const agora = Date.now()
    const criar = (minAtras: number, lida: boolean) =>
      prisma.notificacao.create({
        data: {
          id: randomUUID(),
          usuario_id: estudante.id,
          tipo: 'nivel_alcancado',
          titulo: `N${minAtras}`,
          mensagem: 'Você chegou ao nível 2.',
          chave: `painel:${randomUUID()}`,
          criado_em: new Date(agora - minAtras * MINUTO),
          lida_em: lida ? new Date() : null,
        },
      })
    for (const minutos of [50, 40, 30, 20, 10]) await criar(minutos, false)
    await criar(1, true)
    const corpo = await painel(estudante)
    expect(corpo.notificacoes.naoLidas).toBe(5)
    expect(corpo.notificacoes.recentes.map((n: { titulo: string }) => n.titulo)).toEqual(['N10', 'N20', 'N30'])
  })
})

describe('cursos em andamento (PN-08, R-PN3, R-PN4)', () => {
  it('o percentual é o mesmo do catálogo e usa só aulas publicadas', async () => {
    const { professor, cursoId, moduloId, aulaId } = await cursoComAula()
    const segunda = await aulaExtra(professor, moduloId)
    await aulaExtra(professor, moduloId)
    const rascunho = await professor.agente.post(`/api/v1/modulos/${moduloId}/aulas`).send({ titulo: 'Rascunho' })
    expect(rascunho.status).toBeLessThan(300)
    const estudante = await criarUsuarioComSessao('estudante')
    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    await estudante.agente.post(`/api/v1/aulas/${segunda}/conclusao`).send({})
    const corpo = await painel(estudante)
    expect(corpo.cursos).toHaveLength(1)
    expect(corpo.cursos[0]).toMatchObject({ cursoId, titulo: 'Curso', aulasConcluidas: 2, aulasTotal: 3, percentual: 66 })
    const catalogo = await estudante.agente.get(`/api/v1/cursos/${cursoId}`)
    expect(catalogo.body.progresso.percentual).toBe(corpo.cursos[0].percentual)
    expect(catalogo.body.progresso.aulasConcluidas).toBe(corpo.cursos[0].aulasConcluidas)
  })

  it('curso 100% concluído sai da lista e curso sem atividade nunca entra', async () => {
    const completo = await cursoComAula()
    const intocado = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await estudante.agente.post(`/api/v1/aulas/${completo.aulaId}/conclusao`).send({})
    const ids = (await painel(estudante)).cursos.map((c: { cursoId: string }) => c.cursoId)
    expect(ids).not.toContain(completo.cursoId)
    expect(ids).not.toContain(intocado.cursoId)
  })

  it('no máximo 3 cursos, o de atividade mais recente primeiro', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const cursos = []
    for (let i = 0; i < 4; i++) {
      const curso = await cursoComAula()
      await aulaExtra(curso.professor, curso.moduloId)
      await estudante.agente.post(`/api/v1/aulas/${curso.aulaId}/conclusao`).send({})
      cursos.push(curso)
    }
    const corpo = await painel(estudante)
    expect(corpo.cursos.map((c: { cursoId: string }) => c.cursoId)).toEqual([cursos[3], cursos[2], cursos[1]].map((c) => c.cursoId))
  })

  it('aula despublicada depois da conclusão deixa de contar', async () => {
    const { professor, moduloId, aulaId } = await cursoComAula()
    await aulaExtra(professor, moduloId)
    await aulaExtra(professor, moduloId)
    const estudante = await criarUsuarioComSessao('estudante')
    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    expect((await painel(estudante)).cursos).toHaveLength(1)
    // com a aula concluída fora do ar restam 2 publicadas e nenhuma concluída: o curso não está em andamento
    await professor.agente.patch(`/api/v1/aulas/${aulaId}`).send({ publicado: false })
    expect((await painel(estudante)).cursos).toEqual([])
  })
})

describe('isolamento (PN-09, R-PN5)', () => {
  it('o painel de um estudante não contém dados de outro', async () => {
    const { cursoId } = await cursoComAula()
    const a = await criarUsuarioComSessao('estudante')
    const b = await criarUsuarioComSessao('estudante')
    await registrarEvento(a.id, cursoId, 'conclusao_aula', 12_345)
    await prisma.notificacao.create({
      data: { id: randomUUID(), usuario_id: a.id, tipo: 'nivel_alcancado', titulo: 'só do A', mensagem: 'x', chave: `iso:${randomUUID()}` },
    })
    const doB = await painel(b)
    expect(doB.xp.xpTotal).toBe(0)
    expect(doB.notificacoes).toEqual({ naoLidas: 0, recentes: [] })
    const texto = JSON.stringify(doB)
    expect(texto).not.toContain(a.id)
    expect(texto).not.toContain('só do A')
    expect(texto).not.toContain('@')
  })
})
