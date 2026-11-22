import { prisma } from '../prisma'
import { catalogoDoEstudante } from './conquistas'
import { listarParaEstudante } from './missoes'
import { lerSaldo } from './moedas'
import { listarNotificacoes } from './notificacoes'
import { consultarRanking } from './rankings'
import { lerXp } from './xp'

// SPEC/2026-11-19-painel-acessibilidade.md (R-PN1–R-PN7) — painel do estudante: só reúne o que cada domínio já decide

export const ITENS_POR_SECAO = 3

export interface CursoEmAndamento {
  cursoId: string
  titulo: string
  aulasConcluidas: number
  aulasTotal: number
  percentual: number
}

// R-PN4: conclusões em aulas publicadas de módulos e cursos publicados; arredonda para baixo (R-D6-3)
export async function cursosEmAndamento(usuarioId: string): Promise<CursoEmAndamento[]> {
  const conclusoes = await prisma.conclusaoAula.findMany({
    where: {
      usuario_id: usuarioId,
      aula: { publicado: true, modulo: { publicado: true, curso: { publicado: true } } },
    },
    select: { concluida_em: true, aula: { select: { modulo: { select: { curso_id: true } } } } },
  })
  const porCurso = new Map<string, { concluidas: number; ultima: number }>()
  for (const conclusao of conclusoes) {
    const cursoId = conclusao.aula.modulo.curso_id
    const atual = porCurso.get(cursoId) ?? { concluidas: 0, ultima: 0 }
    porCurso.set(cursoId, {
      concluidas: atual.concluidas + 1,
      ultima: Math.max(atual.ultima, conclusao.concluida_em.getTime()),
    })
  }
  if (porCurso.size === 0) return []

  const ids = [...porCurso.keys()]
  const [cursos, totais] = await Promise.all([
    prisma.curso.findMany({ where: { id: { in: ids } }, select: { id: true, titulo: true } }),
    Promise.all(
      ids.map((cursoId) =>
        prisma.aula.count({ where: { publicado: true, modulo: { publicado: true, curso_id: cursoId } } })
      )
    ),
  ])
  const titulos = new Map(cursos.map((curso) => [curso.id, curso.titulo]))
  return ids
    .map((cursoId, indice) => {
      const { concluidas, ultima } = porCurso.get(cursoId)!
      const total = totais[indice]
      return {
        cursoId,
        titulo: titulos.get(cursoId) ?? '',
        aulasConcluidas: concluidas,
        aulasTotal: total,
        percentual: total === 0 ? 0 : Math.floor((concluidas * 100) / total),
        ultima,
      }
    })
    .filter((curso) => curso.aulasTotal > 0 && curso.percentual < 100)
    .sort((a, b) => b.ultima - a.ultima || a.cursoId.localeCompare(b.cursoId))
    .slice(0, ITENS_POR_SECAO)
    .map(({ ultima: _ultima, ...curso }) => curso)
}

// F10-01
export async function montarPainel(usuarioId: string, agora = new Date()) {
  const [xp, saldo, missoes, conquistas, notificacoes, ranking, cursos] = await Promise.all([
    lerXp(prisma, usuarioId, agora),
    lerSaldo(prisma, usuarioId),
    listarParaEstudante(usuarioId, agora),
    catalogoDoEstudante(usuarioId),
    listarNotificacoes(usuarioId, { limite: String(ITENS_POR_SECAO), apenasNaoLidas: 'true' }),
    consultarRanking({ id: usuarioId, papel: 'estudante' }, {}, { agora, limite: 1 }),
    cursosEmAndamento(usuarioId),
  ])

  const desbloqueadas = conquistas
    .filter((conquista) => conquista.desbloqueada && conquista.desbloqueadaEm)
    .sort((a, b) => (b.desbloqueadaEm! < a.desbloqueadaEm! ? -1 : b.desbloqueadaEm! > a.desbloqueadaEm! ? 1 : 0))

  return {
    geradoEm: agora.toISOString(),
    xp,
    moedas: { saldo },
    missoes: missoes.missoes
      .filter((missao) => missao.status === 'em_andamento' && !missao.cumprida)
      .sort((a, b) => (a.fim < b.fim ? -1 : a.fim > b.fim ? 1 : a.missaoId.localeCompare(b.missaoId)))
      .slice(0, ITENS_POR_SECAO)
      .map((missao) => ({
        missaoId: missao.missaoId,
        titulo: missao.titulo,
        tipo: missao.tipo,
        meta: missao.meta,
        progresso: missao.progresso,
        fim: missao.fim,
        recompensaMoedas: missao.recompensaMoedas,
      })),
    conquistas: {
      desbloqueadas: desbloqueadas.length,
      total: conquistas.length,
      recentes: desbloqueadas
        .slice(0, ITENS_POR_SECAO)
        .map(({ codigo, nome, desbloqueadaEm }) => ({ codigo, nome, desbloqueadaEm })),
    },
    notificacoes: {
      naoLidas: notificacoes.naoLidas,
      recentes: notificacoes.notificacoes.map(({ notificacaoId, titulo, mensagem, criadaEm }) => ({
        notificacaoId,
        titulo,
        mensagem,
        criadaEm,
      })),
    },
    ranking: {
      posicao: ranking.voce?.posicao ?? null,
      valor: ranking.voce?.valor ?? null,
      totalParticipantes: ranking.totalParticipantes,
    },
    cursos,
  }
}
