import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { OrigemXp } from '@prisma/client'
import { prisma } from '../../src/server/prisma'
import { consultarRanking, pseudonimo } from '../../src/server/servicos/rankings'
import { api, criarUsuarioComSessao, emailUnico } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'

// SPEC/2026-11-19-rankings.md (D11) — T7.2/T7.3: rankings (RK-01–RK-12)

const SEMANA = 7 * 24 * 60 * 60 * 1000

async function estudanteSemSessao(): Promise<string> {
  const usuario = await prisma.usuario.create({ data: { id: randomUUID(), email: emailUnico(), papel: 'estudante' } })
  return usuario.id
}

async function evento(
  usuarioId: string,
  cursoId: string,
  xp: number,
  parcial: Partial<{ origem: OrigemXp; quando: Date }> = {}
) {
  await prisma.eventoXp.create({
    data: {
      id: randomUUID(),
      usuario_id: usuarioId,
      origem: parcial.origem ?? 'conclusao_aula',
      referencia_id: randomUUID(),
      curso_id: cursoId,
      chave: `rk:${randomUUID()}`,
      xp,
      concedido_em: parcial.quando ?? new Date(),
    },
  })
}

function consulta(agente: { get: (url: string) => PromiseLike<{ status: number; body: any }> }, cursoId: string, extra = '') {
  return agente.get(`/api/v1/rankings?escopo=curso&cursoId=${cursoId}${extra}`)
}

interface Entrada {
  posicao: number
  nome: string
  valor: number
  voce: boolean
}

describe('autorização (RK-12, R-RK10)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    expect((await api.get('/api/v1/rankings')).status).toBe(401)
    expect((await api.get('/api/v1/rankings/preferencia')).status).toBe(401)
    expect((await api.put('/api/v1/rankings/preferencia').send({ participacao: 'oculto' })).status).toBe(401)
  })

  it('professor e administrador consultam, não aparecem e não têm preferência', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await estudanteSemSessao()
    await evento(estudante, cursoId, 10)
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      const resposta = await consulta(usuario.agente, cursoId)
      expect(resposta.status).toBe(200)
      expect(resposta.body.voce).toBeNull()
      expect((await usuario.agente.get('/api/v1/rankings/preferencia')).status).toBe(403)
      expect((await usuario.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'oculto' })).status).toBe(403)
    }
  })
})

describe('F7-01 — validação e escopo (RK-04, RK-11)', () => {
  it.each([
    ['metrica=x'],
    ['escopo=turma'],
    ['periodo=mes'],
    ['escopo=curso'],
    ['escopo=curso&cursoId=abc'],
    [`cursoId=${randomUUID()}`],
    ['extra=1'],
  ])('consulta ?%s responde 400', async (query) => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.get(`/api/v1/rankings?${query}`)).status).toBe(400)
  })

  it('curso inexistente responde 404; curso não publicado só para dono e administrador', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await consulta(estudante.agente, randomUUID())).status).toBe(404)
    const { professor, cursoId } = await cursoComAula()
    await prisma.curso.update({ where: { id: cursoId }, data: { publicado: false } })
    expect((await consulta(estudante.agente, cursoId)).status).toBe(404)
    expect((await consulta(professor.agente, cursoId)).status).toBe(200)
    const admin = await criarUsuarioComSessao('administrador')
    expect((await consulta(admin.agente, cursoId)).status).toBe(200)
  })

  it('declara métrica, escopo, período, total e instante do cálculo (R-RK8)', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await evento(estudante.id, cursoId, 15)
    const resposta = await consulta(estudante.agente, cursoId)
    expect(resposta.body.metrica).toEqual({ chave: 'xp', rotulo: 'XP', unidade: 'XP' })
    expect(resposta.body.escopo).toEqual({ tipo: 'curso', cursoId, cursoTitulo: 'Curso' })
    expect(resposta.body.periodo.tipo).toBe('semana')
    expect(new Date(resposta.body.periodo.fim) > new Date(resposta.body.periodo.inicio)).toBe(true)
    expect(resposta.body.totalParticipantes).toBe(1)
    expect(Number.isNaN(new Date(resposta.body.geradoEm).getTime())).toBe(false)
    const total = await consulta(estudante.agente, cursoId, '&periodo=total')
    expect(total.body.periodo).toEqual({ tipo: 'total' })
  })
})

describe('ordenação e empate (RK-01, RK-02, R-RK5)', () => {
  it('ordena por valor decrescente em posições sequenciais', async () => {
    const { cursoId } = await cursoComAula()
    const [a, b, c] = [await estudanteSemSessao(), await estudanteSemSessao(), await estudanteSemSessao()]
    await evento(a, cursoId, 50)
    await evento(b, cursoId, 30)
    await evento(c, cursoId, 80)
    await evento(b, cursoId, 15)
    const observador = await criarUsuarioComSessao('estudante')
    const { body } = await consulta(observador.agente, cursoId)
    expect((body.entradas as Entrada[]).map((e) => [e.posicao, e.nome, e.valor])).toEqual([
      [1, pseudonimo(c), 80],
      [2, pseudonimo(a), 50],
      [3, pseudonimo(b), 45],
    ])
    expect(body.totalParticipantes).toBe(3)
  })

  it('empate: quem chegou antes ao valor fica à frente', async () => {
    const { cursoId } = await cursoComAula()
    const [antes, depois] = [await estudanteSemSessao(), await estudanteSemSessao()]
    const agora = Date.now()
    // `depois` é inserido primeiro, mas o último evento de `antes` é mais antigo
    await evento(depois, cursoId, 40, { quando: new Date(agora - 1_000) })
    await evento(antes, cursoId, 40, { quando: new Date(agora - 60_000) })
    const observador = await criarUsuarioComSessao('estudante')
    const { body } = await consulta(observador.agente, cursoId)
    expect((body.entradas as Entrada[]).map((e) => e.nome)).toEqual([pseudonimo(antes), pseudonimo(depois)])
  })

  it('empate no mesmo instante: desempata pelo identificador interno, de forma estável', async () => {
    const { cursoId } = await cursoComAula()
    const ids = [await estudanteSemSessao(), await estudanteSemSessao()]
    const instante = new Date(Date.now() - 5_000)
    for (const id of ids) await evento(id, cursoId, 25, { quando: instante })
    const observador = await criarUsuarioComSessao('estudante')
    const esperado = [...ids].sort().map(pseudonimo)
    for (let i = 0; i < 2; i++) {
      const { body } = await consulta(observador.agente, cursoId)
      expect((body.entradas as Entrada[]).map((e) => e.nome)).toEqual(esperado)
    }
  })
})

describe('período e métrica (RK-03, RK-05, RK-06)', () => {
  it('semana ignora eventos de semanas anteriores; total os inclui', async () => {
    const { cursoId } = await cursoComAula()
    const recente = await estudanteSemSessao()
    const antigo = await estudanteSemSessao()
    await evento(recente, cursoId, 100, { quando: new Date(Date.now() - 3 * SEMANA) })
    await evento(recente, cursoId, 10)
    await evento(antigo, cursoId, 500, { quando: new Date(Date.now() - 3 * SEMANA) })
    const observador = await criarUsuarioComSessao('estudante')
    const semana = (await consulta(observador.agente, cursoId, '&periodo=semana')).body.entradas as Entrada[]
    expect(semana.map((e) => [e.nome, e.valor])).toEqual([[pseudonimo(recente), 10]])
    const total = (await consulta(observador.agente, cursoId, '&periodo=total')).body.entradas as Entrada[]
    expect(total.map((e) => [e.nome, e.valor])).toEqual([
      [pseudonimo(antigo), 500],
      [pseudonimo(recente), 110],
    ])
  })

  it('escopo de curso só conta eventos do curso', async () => {
    const a = await cursoComAula()
    const b = await cursoComAula()
    const estudante = await estudanteSemSessao()
    await evento(estudante, a.cursoId, 20)
    await evento(estudante, b.cursoId, 70)
    const observador = await criarUsuarioComSessao('estudante')
    expect(((await consulta(observador.agente, a.cursoId)).body.entradas as Entrada[])[0].valor).toBe(20)
    expect(((await consulta(observador.agente, b.cursoId)).body.entradas as Entrada[])[0].valor).toBe(70)
  })

  it('aulas_concluidas conta só eventos de conclusão de aula', async () => {
    const { cursoId } = await cursoComAula()
    const [aluno, soAcertos] = [await estudanteSemSessao(), await estudanteSemSessao()]
    await evento(aluno, cursoId, 0, { origem: 'conclusao_aula' })
    await evento(aluno, cursoId, 0, { origem: 'conclusao_aula' })
    await evento(aluno, cursoId, 50, { origem: 'acerto_questao' })
    await evento(soAcertos, cursoId, 50, { origem: 'acerto_questao' })
    const observador = await criarUsuarioComSessao('estudante')
    const { body } = await consulta(observador.agente, cursoId, '&metrica=aulas_concluidas')
    expect(body.metrica).toEqual({ chave: 'aulas_concluidas', rotulo: 'Aulas concluídas', unidade: 'aulas' })
    expect((body.entradas as Entrada[]).map((e) => [e.nome, e.valor])).toEqual([[pseudonimo(aluno), 2]])
  })

  it('quem só tem eventos de 0 XP não aparece no ranking de XP', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await estudanteSemSessao()
    await evento(estudante, cursoId, 0)
    const observador = await criarUsuarioComSessao('estudante')
    const { body } = await consulta(observador.agente, cursoId)
    expect(body.entradas).toEqual([])
    expect(body.totalParticipantes).toBe(0)
  })

  it('ranking global lista o estudante com o maior valor no topo da semana', async () => {
    const { cursoId } = await cursoComAula()
    const lider = await criarUsuarioComSessao('estudante')
    await evento(lider.id, cursoId, 1_000_000_000)
    const { body } = await lider.agente.get('/api/v1/rankings')
    expect(body.escopo).toEqual({ tipo: 'global' })
    expect(body.entradas[0]).toMatchObject({ posicao: 1, valor: 1_000_000_000, voce: true })
    expect(body.voce).toEqual({ posicao: 1, valor: 1_000_000_000 })
  })

  it('fluxo real: concluir a aula coloca o estudante no ranking de aulas do curso', async () => {
    const { cursoId, aulaId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    const { body } = await consulta(estudante.agente, cursoId, '&metrica=aulas_concluidas')
    expect(body.entradas).toEqual([{ posicao: 1, nome: pseudonimo(estudante.id), valor: 1, voce: true }])
  })
})

describe('privacidade (RK-07–RK-10, R-RK6, R-RK7)', () => {
  it('padrão anônimo: rótulo estável, sem e-mail nem identificador', async () => {
    const { cursoId } = await cursoComAula()
    const [a, b] = [await estudanteSemSessao(), await estudanteSemSessao()]
    await evento(a, cursoId, 30)
    await evento(b, cursoId, 20)
    const observador = await criarUsuarioComSessao('estudante')
    const primeira = await consulta(observador.agente, cursoId)
    const segunda = await consulta(observador.agente, cursoId)
    expect(primeira.body.entradas).toEqual(segunda.body.entradas)
    for (const entrada of primeira.body.entradas as Entrada[]) {
      expect(entrada.nome).toMatch(/^Estudante [0-9A-F]{6}$/)
      expect(Object.keys(entrada).sort()).toEqual(['nome', 'posicao', 'valor', 'voce'])
    }
    const texto = JSON.stringify(primeira.body.entradas) + JSON.stringify(primeira.body.voce)
    expect(texto).not.toContain('@')
    expect(texto).not.toContain(a)
    expect(texto).not.toContain(b)
    expect(texto).not.toContain(observador.id)
  })

  it('apelido substitui o rótulo; oculto sai da lista sem deixar vaga', async () => {
    const { cursoId } = await cursoComAula()
    const [a, b, c] = [await criarUsuarioComSessao('estudante'), await criarUsuarioComSessao('estudante'), await criarUsuarioComSessao('estudante')]
    await evento(a.id, cursoId, 90)
    await evento(b.id, cursoId, 60)
    await evento(c.id, cursoId, 30)
    await a.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'apelido', apelido: '  Ada  ' })
    await b.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'oculto' })

    const visto = await consulta(c.agente, cursoId)
    expect((visto.body.entradas as Entrada[]).map((e) => [e.posicao, e.nome, e.valor])).toEqual([
      [1, 'Ada', 90],
      [2, pseudonimo(c.id), 30],
    ])
    expect(visto.body.totalParticipantes).toBe(2)

    const oculto = await consulta(b.agente, cursoId)
    expect(oculto.body.voce).toBeNull()
    expect((oculto.body.entradas as Entrada[]).some((e) => e.voce)).toBe(false)
    expect(JSON.stringify(oculto.body)).not.toContain('60')
  })

  it('voltar para anônimo apaga o apelido e o rótulo volta a ser o pseudônimo', async () => {
    const { cursoId } = await cursoComAula()
    const estudante = await criarUsuarioComSessao('estudante')
    await evento(estudante.id, cursoId, 10)
    await estudante.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'apelido', apelido: 'Zé' })
    await estudante.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'anonimo' })
    expect((await estudante.agente.get('/api/v1/rankings/preferencia')).body).toEqual({ participacao: 'anonimo', apelido: null })
    expect(((await consulta(estudante.agente, cursoId)).body.entradas as Entrada[])[0].nome).toBe(pseudonimo(estudante.id))
  })

  it('estudante fora do limite recebe a própria posição em voce (RK-10)', async () => {
    const { cursoId } = await cursoComAula()
    const ids = [] as string[]
    for (let i = 0; i < 4; i++) ids.push(await estudanteSemSessao())
    for (const [indice, id] of ids.entries()) await evento(id, cursoId, 100 - indice * 10)
    const resultado = await consultarRanking({ id: ids[3], papel: 'estudante' }, { escopo: 'curso', cursoId }, { limite: 2 })
    expect(resultado.entradas.map((e) => e.posicao)).toEqual([1, 2])
    expect(resultado.entradas.some((e) => e.voce)).toBe(false)
    expect(resultado.voce).toEqual({ posicao: 4, valor: 70 })
    expect(resultado.totalParticipantes).toBe(4)
  })

  it('o padrão da API devolve 20 posições mais a do estudante', async () => {
    const { cursoId } = await cursoComAula()
    for (let i = 0; i < 21; i++) await evento(await estudanteSemSessao(), cursoId, 1000 + i)
    const ultimo = await criarUsuarioComSessao('estudante')
    await evento(ultimo.id, cursoId, 1)
    const { body } = await consulta(ultimo.agente, cursoId)
    expect(body.entradas).toHaveLength(20)
    expect(body.entradas[19].posicao).toBe(20)
    expect(body.voce).toEqual({ posicao: 22, valor: 1 })
    expect(body.totalParticipantes).toBe(22)
  })
})

describe('F7-02/F7-03 — preferência (RK-11)', () => {
  it('novo estudante tem o padrão anônimo', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.get('/api/v1/rankings/preferencia')
    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ participacao: 'anonimo', apelido: null })
  })

  it('salva e devolve o estado, com o apelido sem espaços nas pontas', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'apelido', apelido: '  Ada  ' })
    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ participacao: 'apelido', apelido: 'Ada' })
    expect((await estudante.agente.get('/api/v1/rankings/preferencia')).body).toEqual(resposta.body)
  })

  it.each([
    ['sem participação', {}],
    ['participação desconhecida', { participacao: 'publico' }],
    ['apelido ausente', { participacao: 'apelido' }],
    ['apelido vazio', { participacao: 'apelido', apelido: '   ' }],
    ['apelido longo demais', { participacao: 'apelido', apelido: 'x'.repeat(31) }],
    ['apelido com @', { participacao: 'apelido', apelido: 'ada@exemplo.com' }],
    ['apelido com quebra de linha', { participacao: 'apelido', apelido: 'a\nb' }],
    ['apelido não textual', { participacao: 'apelido', apelido: 7 }],
    ['apelido com participação anônima', { participacao: 'anonimo', apelido: 'Ada' }],
    ['campo desconhecido', { participacao: 'oculto', extra: 1 }],
  ])('rejeita %s com 400 e não altera o estado', async (_rotulo, corpo) => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.put('/api/v1/rankings/preferencia').send(corpo)).status).toBe(400)
    expect((await estudante.agente.get('/api/v1/rankings/preferencia')).body).toEqual({ participacao: 'anonimo', apelido: null })
  })

  it('corpo que não é objeto responde 400', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    expect((await estudante.agente.put('/api/v1/rankings/preferencia').send([1])).status).toBe(400)
  })

  it('aceita o apelido no limite de 30 caracteres', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.put('/api/v1/rankings/preferencia').send({ participacao: 'apelido', apelido: 'x'.repeat(30) })
    expect(resposta.status).toBe(200)
  })

  it('o banco também exige apelido quando a participação é por apelido', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await expect(
      prisma.configRanking.create({ data: { usuario_id: estudante.id, participacao: 'apelido', apelido: null } })
    ).rejects.toThrow()
  })
})
