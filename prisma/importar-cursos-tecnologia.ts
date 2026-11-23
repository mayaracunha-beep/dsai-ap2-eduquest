import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '../src/server/prisma'
import cursos from './cursos-tecnologia.json'

function idDoCatalogo(chave: string): string {
  const hex = createHash('sha256').update(`eduquest:cursos-tecnologia:${chave}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

async function importar(email: string | undefined) {
  if (!email?.trim()) throw new Error('Informe o e-mail de um professor existente.')
  const professor = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (professor?.papel !== 'professor') throw new Error('Conta de professor não encontrada.')

  const materiais = await Promise.all(cursos.map(async (curso) => {
    const nome = `${curso.slug}.pdf`
    return { ...curso, nome, pdf: await readFile(join(__dirname, 'materiais', nome)) }
  }))

  return prisma.$transaction(async (tx) => {
    const criados: string[] = []
    for (const curso of materiais) {
      const cursoId = idDoCatalogo(curso.slug)
      const insercao = await tx.curso.createMany({
        data: { id: cursoId, titulo: curso.titulo, publicado: true, dono_id: professor.id },
        skipDuplicates: true,
      })
      if (insercao.count === 0) continue

      const inicio = Date.now()
      await tx.modulo.create({
        data: {
          id: idDoCatalogo(`${curso.slug}:modulo`),
          curso_id: cursoId,
          titulo: curso.modulo,
          publicado: true,
          aulas: {
            create: curso.aulas.map(([titulo, texto], indice) => {
              const chaveAula = `${curso.slug}:aula:${indice + 1}`
              const arquivoId = idDoCatalogo(`${curso.slug}:pdf`)
              return {
                id: idDoCatalogo(chaveAula),
                titulo,
                publicado: true,
                criado_em: new Date(inicio + indice),
                arquivos: indice === 0 ? {
                  create: { id: arquivoId, nome: curso.nome, mime: 'application/pdf',
                    tamanho: curso.pdf.length, conteudo: Uint8Array.from(curso.pdf) },
                } : undefined,
                conteudos: {
                  create: [
                    {
                      id: idDoCatalogo(`${chaveAula}:texto`),
                      tipo: 'texto' as const,
                      posicao: 0,
                      dados: { texto: indice === 0 ? texto : `${texto}\n\nPrática: ${curso.exercicio}` },
                    },
                    ...(indice === 0 ? [{
                      id: idDoCatalogo(`${chaveAula}:anexo`),
                      tipo: 'material_anexo' as const,
                      posicao: 1,
                      dados: { arquivoId },
                    }] : []),
                  ],
                },
              }
            }),
          },
        },
      })
      criados.push(curso.titulo)
    }
    return criados
  })
}

importar(process.argv[2])
  .then((criados) => console.log(criados.length > 0 ? `Cursos importados: ${criados.join(', ')}` : 'Os cursos já existem.'))
  .catch((erro: unknown) => {
    console.error(erro)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
