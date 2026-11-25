import { criarUsuarioComSessao } from './aplicacao'

// curso publicado com módulo e uma aula publicados; devolve o professor dono e os ids
export async function cursoComAula() {
  const professor = await criarUsuarioComSessao('professor')
  const curso = await professor.agente.post('/api/v1/cursos').send({ titulo: 'Curso' })
  const cursoId = curso.body.cursoId as string
  const modulo = await professor.agente.post(`/api/v1/cursos/${cursoId}/modulos`).send({ titulo: 'Modulo' })
  const moduloId = modulo.body.moduloId as string
  await professor.agente.patch(`/api/v1/cursos/${cursoId}`).send({ publicado: true })
  await professor.agente.patch(`/api/v1/modulos/${moduloId}`).send({ publicado: true })
  const aula = await professor.agente.post(`/api/v1/modulos/${moduloId}/aulas`).send({ titulo: 'Aula' })
  await professor.agente.patch(`/api/v1/aulas/${aula.body.aulaId}`).send({ publicado: true })
  return { professor, cursoId, moduloId, aulaId: aula.body.aulaId as string }
}
