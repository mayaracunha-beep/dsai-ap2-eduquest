import { createHash } from 'node:crypto'
import { Prisma, type ParticipacaoRanking } from '@prisma/client'
import { erroNaoEncontrado, erroValidacao } from '../erros'
import { prisma } from '../prisma'
import { uuidValido } from '../tipos'
import { ehDonoOuAdmin, type UsuarioSessao } from './catalogo'
import { semanaDe } from './xp'

// SPEC/2026-11-19-rankings.md (D11) — rankings calculados no servidor, com empate fixo e privacidade

export const LIMITE_DO_RANKING = 20
export const APELIDO_MAXIMO = 30

export type Metrica = 'xp' | 'aulas_concluidas'
export type Escopo = 'global' | 'curso'
export type Periodo = 'semana' | 'total'

export const METRICAS: Record<Metrica, { rotulo: string; unidade: string }> = {
  xp: { rotulo: 'XP', unidade: 'XP' },
  aulas_concluidas: { rotulo: 'Aulas concluídas', unidade: 'aulas' },
}

const ESCOPOS: readonly Escopo[] = ['global', 'curso']
const PERIODOS: readonly Periodo[] = ['semana', 'total']
const PARTICIPACOES: readonly ParticipacaoRanking[] = ['anonimo', 'apelido', 'oculto']

export interface ConsultaDeRanking {
  metrica: Metrica
  escopo: Escopo
  cursoId: string | null
  periodo: Periodo
}

function opcao<T extends string>(valor: unknown, validos: readonly T[], padrao: T, rotulo: string): T {
  if (valor === undefined) return padrao
  if (typeof valor !== 'string' || !validos.includes(valor as T)) {
    throw erroValidacao(`${rotulo} deve ser um entre ${validos.join(', ')}`)
  }
  return valor as T
}

// R-RK11: parâmetros desconhecidos ou inválidos são 400
export function validarConsulta(query: unknown): ConsultaDeRanking {
  const entrada = (query ?? {}) as Record<string, unknown>
  const permitidos = ['metrica', 'escopo', 'cursoId', 'periodo']
  if (Object.keys(entrada).some((chave) => !permitidos.includes(chave))) {
    throw erroValidacao('parametro desconhecido')
  }
  const metrica = opcao(entrada.metrica, Object.keys(METRICAS) as Metrica[], 'xp', 'metrica')
  const escopo = opcao(entrada.escopo, ESCOPOS, 'global', 'escopo')
  const periodo = opcao(entrada.periodo, PERIODOS, 'semana', 'periodo')
  let cursoId: string | null = null
  if (escopo === 'curso') {
    if (typeof entrada.cursoId !== 'string' || !uuidValido.test(entrada.cursoId)) {
      throw erroValidacao('cursoId e obrigatorio e deve ser um UUID quando o escopo e curso')
    }
    cursoId = entrada.cursoId
  } else if (entrada.cursoId !== undefined) {
    throw erroValidacao('cursoId so vale com escopo curso')
  }
  return { metrica, escopo, cursoId, periodo }
}

// R-RK6: rótulo estável derivado de um hash do identificador; não revela nem permite recuperar o id
export function pseudonimo(usuarioId: string): string {
  const codigo = createHash('sha256').update(`ranking:${usuarioId}`).digest('hex').slice(0, 6).toUpperCase()
  return `Estudante ${codigo}`
}

interface LinhaDoRanking {
  usuario_id: string
  valor: bigint
  posicao: number
  participacao: ParticipacaoRanking | null
  apelido: string | null
  total: number
}

function nomeDeExibicao(linha: LinhaDoRanking): string {
  return linha.participacao === 'apelido' && linha.apelido ? linha.apelido : pseudonimo(linha.usuario_id)
}

async function cursoParaRanking(cursoId: string, usuario: UsuarioSessao) {
  const curso = await prisma.curso.findUnique({
    where: { id: cursoId },
    select: { id: true, titulo: true, dono_id: true, publicado: true },
  })
  if (!curso || (!curso.publicado && !ehDonoOuAdmin(curso.dono_id, usuario))) {
    throw erroNaoEncontrado('curso nao encontrado')
  }
  return curso
}

// F7-01 — R-RK1–R-RK9: tudo calculado aqui, a partir dos eventos de XP verificados
export async function consultarRanking(
  usuario: UsuarioSessao,
  query: unknown,
  opcoes: { agora?: Date; limite?: number } = {}
) {
  const consulta = validarConsulta(query)
  const agora = opcoes.agora ?? new Date()
  const limite = opcoes.limite ?? LIMITE_DO_RANKING
  const curso = consulta.cursoId ? await cursoParaRanking(consulta.cursoId, usuario) : null
  const janela = consulta.periodo === 'semana' ? semanaDe(agora) : null

  const condicoes: Prisma.Sql[] = [Prisma.sql`COALESCE(c."participacao", 'anonimo') <> 'oculto'`]
  if (janela) condicoes.push(Prisma.sql`e."concedido_em" >= ${janela.inicio} AND e."concedido_em" < ${janela.fim}`)
  if (curso) condicoes.push(Prisma.sql`e."curso_id" = ${curso.id}::uuid`)
  const contaAulas = consulta.metrica === 'aulas_concluidas'
  if (contaAulas) condicoes.push(Prisma.sql`e."origem" = 'conclusao_aula'`)
  const valor = contaAulas ? Prisma.sql`COUNT(*)` : Prisma.sql`SUM(e."xp")`

  const linhas = await prisma.$queryRaw<LinhaDoRanking[]>`
    WITH base AS (
      SELECT e."usuario_id", ${valor}::bigint AS valor, MAX(e."concedido_em") AS ultimo,
             c."participacao", c."apelido"
      FROM "evento_xp" e
      LEFT JOIN "config_ranking" c ON c."usuario_id" = e."usuario_id"
      WHERE ${Prisma.join(condicoes, ' AND ')}
      GROUP BY e."usuario_id", c."participacao", c."apelido"
      HAVING ${valor} > 0
    ),
    ordenado AS (
      SELECT base.*, (SELECT COUNT(*) FROM base)::int AS total,
             ROW_NUMBER() OVER (ORDER BY valor DESC, ultimo ASC, "usuario_id" ASC)::int AS posicao
      FROM base
    )
    SELECT "usuario_id", valor, posicao, "participacao", "apelido", total
    FROM ordenado
    WHERE posicao <= ${limite} OR "usuario_id" = ${usuario.id}::uuid
    ORDER BY posicao`

  const proprio = linhas.find((linha) => linha.usuario_id === usuario.id)
  return {
    metrica: { chave: consulta.metrica, ...METRICAS[consulta.metrica] },
    escopo: curso ? { tipo: 'curso' as const, cursoId: curso.id, cursoTitulo: curso.titulo } : { tipo: 'global' as const },
    periodo: janela
      ? { tipo: 'semana' as const, inicio: janela.inicio.toISOString(), fim: janela.fim.toISOString() }
      : { tipo: 'total' as const },
    geradoEm: agora.toISOString(),
    totalParticipantes: linhas[0]?.total ?? 0,
    entradas: linhas
      .filter((linha) => linha.posicao <= limite)
      .map((linha) => ({
        posicao: linha.posicao,
        nome: nomeDeExibicao(linha),
        valor: Number(linha.valor),
        voce: linha.usuario_id === usuario.id,
      })),
    voce: proprio ? { posicao: proprio.posicao, valor: Number(proprio.valor) } : null,
  }
}

export interface PreferenciaDeRanking {
  participacao: ParticipacaoRanking
  apelido: string | null
}

// F7-02
export async function lerPreferencia(usuarioId: string): Promise<PreferenciaDeRanking> {
  const config = await prisma.configRanking.findUnique({ where: { usuario_id: usuarioId } })
  return { participacao: config?.participacao ?? 'anonimo', apelido: config?.apelido ?? null }
}

function apelidoValido(valor: unknown): string {
  if (typeof valor !== 'string') throw erroValidacao('apelido deve ser texto')
  const limpo = valor.trim()
  if (limpo.length === 0 || limpo.length > APELIDO_MAXIMO) {
    throw erroValidacao(`apelido deve ter de 1 a ${APELIDO_MAXIMO} caracteres`)
  }
  // eslint-disable-next-line no-control-regex
  if (limpo.includes('@') || /[\u0000-\u001f\u007f]/.test(limpo)) {
    throw erroValidacao('apelido nao pode conter @ nem caracteres de controle')
  }
  return limpo
}

// F7-03 — R-RK6: o apelido só existe junto com a participação por apelido
export async function salvarPreferencia(usuarioId: string, corpo: unknown): Promise<PreferenciaDeRanking> {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  const entrada = corpo as Record<string, unknown>
  if (Object.keys(entrada).some((chave) => chave !== 'participacao' && chave !== 'apelido')) {
    throw erroValidacao('campo desconhecido')
  }
  const participacao = opcao(entrada.participacao, PARTICIPACOES, 'anonimo', 'participacao')
  if (entrada.participacao === undefined) throw erroValidacao('participacao e obrigatoria')
  let apelido: string | null = null
  if (participacao === 'apelido') apelido = apelidoValido(entrada.apelido)
  else if (entrada.apelido !== undefined && entrada.apelido !== null) {
    throw erroValidacao('apelido so vale com participacao apelido')
  }
  const salvo = await prisma.configRanking.upsert({
    where: { usuario_id: usuarioId },
    create: { usuario_id: usuarioId, participacao, apelido },
    update: { participacao, apelido },
  })
  return { participacao: salvo.participacao, apelido: salvo.apelido }
}
