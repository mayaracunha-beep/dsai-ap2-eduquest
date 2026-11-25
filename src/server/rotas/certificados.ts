import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { erroConflito, erroNaoEncontrado, erroProibido, erroValidacao } from '../erros'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import { prisma } from '../prisma'
import { lerCurso } from '../servicos/catalogo'
import { resultadoDoEstudante } from '../servicos/avaliacoes'
import { uuidValido } from '../tipos'

export const rotasCertificados = Router()

rotasCertificados.get('/certificados/:codigo', async (req, res) => {
  if (!uuidValido.test(req.params.codigo)) throw erroNaoEncontrado('Certificado não encontrado.')
  const certificado = await prisma.certificado.findUnique({
    where: { codigo: req.params.codigo },
    select: { codigo: true, curso: true, emitido_em: true },
  })
  if (!certificado) throw erroNaoEncontrado('Certificado não encontrado.')
  res.json(certificado)
})

const rota = '/cursos/:id/certificado'

rotasCertificados.get(rota, exigirSessao, async (req, res) => {
  const usuario = req.usuario!
  const curso = await lerCurso(usuario, req.params.id)
  if (usuario.papel === 'professor' && curso.donoId !== usuario.id) {
    throw erroProibido('Somente o professor dono pode consultar a configuração.')
  }

  const requisito = await prisma.requisitoCertificado.findUnique({ where: { curso_id: curso.id } })
  const certificado = usuario.papel === 'estudante'
    ? await prisma.certificado.findUnique({ where: { curso_id_usuario_id: { curso_id: curso.id, usuario_id: usuario.id } } })
    : null
  res.json({ requisito, certificado })
})

rotasCertificados.put(rota, exigirSessao, exigirPapel('professor', 'administrador'), async (req, res) => {
  const usuario = req.usuario!
  const curso = await lerCurso(usuario, req.params.id)
  if (usuario.papel === 'professor' && curso.donoId !== usuario.id) {
    throw erroProibido('Somente o professor dono pode configurar a emissão.')
  }

  const { percentual, avaliacaoId, notaMinima } = req.body ?? {}
  if (!Number.isInteger(percentual) || percentual < 1 || percentual > 100) {
    throw erroValidacao('Informe um percentual inteiro entre 1 e 100.')
  }
  if (avaliacaoId != null || notaMinima != null) {
    if (typeof avaliacaoId !== 'string' || !uuidValido.test(avaliacaoId) ||
        typeof notaMinima !== 'number' || !Number.isFinite(notaMinima) || notaMinima < 0 || notaMinima > 10 ||
        Number(notaMinima.toFixed(2)) !== notaMinima) {
      throw erroValidacao('Selecione uma avaliação e informe uma nota entre 0 e 10 com até duas casas.')
    }
    const avaliacao = await prisma.avaliacao.findFirst({
      where: { id: avaliacaoId, curso_id: curso.id, publicado: true },
      select: { id: true },
    })
    if (!avaliacao) throw erroValidacao('Selecione uma avaliação publicada deste curso.')
  }

  const dados = { percentual, avaliacao_id: avaliacaoId ?? null, nota_minima: notaMinima ?? null }
  const requisito = await prisma.requisitoCertificado.upsert({
    where: { curso_id: curso.id },
    create: { curso_id: curso.id, ...dados },
    update: dados,
  })
  res.json(requisito)
})

rotasCertificados.post(rota, exigirSessao, exigirPapel('estudante'), async (req, res) => {
  const usuario = req.usuario!
  const curso = await lerCurso(usuario, req.params.id)
  const chave = { curso_id: curso.id, usuario_id: usuario.id }
  const onde = { curso_id_usuario_id: chave }
  const anterior = await prisma.certificado.findUnique({ where: onde })
  if (anterior) {
    res.json(anterior)
    return
  }

  const requisito = await prisma.requisitoCertificado.findUnique({ where: { curso_id: curso.id } })
  if (!requisito) throw erroConflito('Este curso ainda não oferece certificado.')
  if (!curso.progresso?.aulasTotal || curso.progresso.percentual < requisito.percentual) {
    throw erroConflito(`Conclua pelo menos ${requisito.percentual}% das aulas para emitir o certificado.`)
  }
  if (requisito.avaliacao_id && requisito.nota_minima !== null) {
    const { resultado } = await resultadoDoEstudante(usuario, requisito.avaliacao_id)
    if (resultado === null || resultado < requisito.nota_minima.toNumber()) {
      throw erroConflito(`Obtenha pelo menos ${requisito.nota_minima} na avaliação exigida.`)
    }
  }

  const estudante = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { nome: true } })
  if (!estudante?.nome?.trim()) throw erroConflito('Preencha seu nome no Perfil antes de emitir.')
  const insercao = await prisma.certificado.createMany({
    data: { ...chave, codigo: randomUUID(), estudante: estudante.nome.trim(), curso: curso.titulo },
    skipDuplicates: true,
  })
  res.status(insercao.count === 1 ? 201 : 200).json(await prisma.certificado.findUniqueOrThrow({ where: onde }))
})
