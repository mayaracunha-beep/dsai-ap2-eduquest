import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { prisma } from '../../src/server/prisma'
import { api, criarUsuarioComSessao } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'

it('autoriza somente o autor ou administrador a configurar os requisitos', async () => {
  const { professor, cursoId } = await cursoComAula()
  const outro = await criarUsuarioComSessao('professor')
  const admin = await criarUsuarioComSessao('administrador')
  const rota = `/api/v1/cursos/${cursoId}/certificado`

  await outro.agente.put(rota).send({ percentual: 100 }).expect(403)
  await professor.agente.put(rota).send({ percentual: 0 }).expect(400)
  await professor.agente.put(rota).send({ percentual: 100, avaliacaoId: randomUUID(), notaMinima: 7 }).expect(400)
  await admin.agente.put(rota).send({ percentual: 90 }).expect(200)
  expect((await professor.agente.get(rota).expect(200)).body.requisito.percentual).toBe(90)
})

it('emite uma única vez após conclusão e preserva os dados e a privacidade', async () => {
  const { professor, cursoId, aulaId } = await cursoComAula()
  const estudante = await criarUsuarioComSessao('estudante')
  const rota = `/api/v1/cursos/${cursoId}/certificado`
  await estudante.agente.post(rota).expect(409)
  await professor.agente.put(rota).send({ percentual: 100 }).expect(200)
  await estudante.agente.post(rota).expect(409)
  await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({}).expect(201)
  await estudante.agente.post(rota).expect(409)
  await prisma.usuario.update({ where: { id: estudante.id }, data: { nome: 'Ana EduQuest' } })

  const envios = await Promise.all([estudante.agente.post(rota), estudante.agente.post(rota)])
  expect(envios.map((resposta) => resposta.status).sort()).toEqual([200, 201])
  const [primeira, segunda] = envios
  expect(segunda.body).toEqual(primeira.body)
  expect(primeira.body.estudante).toBe('Ana EduQuest')
  await prisma.usuario.update({ where: { id: estudante.id }, data: { nome: 'Nome novo' } })
  await professor.agente.patch(`/api/v1/cursos/${cursoId}`).send({ titulo: 'Título novo' }).expect(200)
  expect((await estudante.agente.post(rota).expect(200)).body).toEqual(primeira.body)
  const outro = await criarUsuarioComSessao('estudante')
  expect((await outro.agente.get(rota).expect(200)).body.certificado).toBeNull()

  const verificacao = await api.get(`/api/v1/certificados/${primeira.body.codigo}`).expect(200)
  expect(verificacao.body).toEqual({
    codigo: primeira.body.codigo,
    curso: 'Curso',
    emitido_em: primeira.body.emitido_em,
  })
  await api.get(`/api/v1/certificados/${randomUUID()}`).expect(404)
})

it('exige a nota mínima na avaliação selecionada', async () => {
  const { professor, cursoId, aulaId } = await cursoComAula()
  const estudante = await criarUsuarioComSessao('estudante')
  const agora = Date.now()
  const avaliacao = await prisma.avaliacao.create({ data: {
    id: randomUUID(), curso_id: cursoId, titulo: 'Avaliação final', publicado: true, tentativas_max: 2,
    abre_em: new Date(agora - 1000), fecha_em: new Date(agora + 60000),
  } })
  const rota = `/api/v1/cursos/${cursoId}/certificado`
  await prisma.usuario.update({ where: { id: estudante.id }, data: { nome: 'Ana EduQuest' } })
  await professor.agente.put(rota).send({ percentual: 100, avaliacaoId: avaliacao.id, notaMinima: 7 }).expect(200)
  await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({}).expect(201)
  for (const nota of [6, 7]) {
    await prisma.tentativaAvaliacao.create({ data: {
      id: randomUUID(), avaliacao_id: avaliacao.id, usuario_id: estudante.id,
      status: 'corrigida', nota, enviada_em: new Date(),
    } })
    await estudante.agente.post(rota).expect(nota === 6 ? 409 : 201)
  }
})
