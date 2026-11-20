import { randomUUID } from 'node:crypto'
import { Prisma, type Missao, type OrigemXp, type PrismaClient, type TipoMissao } from '@prisma/client'
import { Erro, erroConflito, erroNaoEncontrado, erroValidacao } from '../erros'
import { prisma } from '../prisma'
import { uuidValido } from '../tipos'
import { ehDonoOuAdmin, exigirAutoria, type UsuarioSessao } from './catalogo'
import { creditar } from './moedas'

// SPEC/2026-11-19-missoes.md (D9) — missões: criação, progresso, cumprimento e gestão

type Tx = Prisma.TransactionClient
type Db = Tx | PrismaClient

export const TIPOS_MISSAO: readonly TipoMissao[] = [
  'aulas_concluidas',
  'questoes_acertadas',
  'avaliacoes_entregues',
  'xp_ganho',
]

// R-MS1 / R-MS9
export const LIMITES = {
  tituloMax: 80,
  descricaoMax: 300,
  metaMax: 10_000,
  recompensaMax: 1_000,
  listagemMax: 50,
} as const

// R-MS2: origem do evento de XP que cada tipo conta (xp_ganho soma qualquer origem)
const ORIGEM_DO_TIPO: Record<Exclude<TipoMissao, 'xp_ganho'>, OrigemXp> = {
  aulas_concluidas: 'conclusao_aula',
  questoes_acertadas: 'acerto_questao',
  avaliacoes_entregues: 'entrega_avaliacao',
}

export type StatusMissao = 'futura' | 'em_andamento' | 'encerrada'

export function statusDaMissao(missao: { inicio: Date; fim: Date }, agora: Date): StatusMissao {
  if (agora < missao.inicio) return 'futura'
  if (agora >= missao.fim) return 'encerrada'
  return 'em_andamento'
}

export interface DadosNovaMissao {
  titulo: string
  descricao: string
  tipo: TipoMissao
  meta: number
  inicio: Date
  fim: Date
  recompensaMoedas: number
  cursoId: string | null
}

function objeto(corpo: unknown): Record<string, unknown> {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  return corpo as Record<string, unknown>
}

function texto(valor: unknown, rotulo: string, maximo: number, obrigatorio: boolean): string {
  if (typeof valor !== 'string') throw erroValidacao(`${rotulo} deve ser texto`)
  const limpo = valor.trim()
  if (obrigatorio && limpo.length === 0) throw erroValidacao(`${rotulo} e obrigatorio`)
  if (limpo.length > maximo) throw erroValidacao(`${rotulo} deve ter no maximo ${maximo} caracteres`)
  return limpo
}

function inteiro(valor: unknown, rotulo: string, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw erroValidacao(`${rotulo} deve ser inteiro entre ${minimo} e ${maximo}`)
  }
  return valor
}

function data(valor: unknown, rotulo: string): Date {
  const instante = typeof valor === 'string' ? new Date(valor) : null
  if (!instante || Number.isNaN(instante.getTime())) {
    throw erroValidacao(`${rotulo} deve ser uma data ISO valida`)
  }
  return instante
}

// R-MS1/R-MS8: valida a criação; o `fim` precisa estar no futuro
export function validarNovaMissao(corpo: unknown, agora: Date): DadosNovaMissao {
  const entrada = objeto(corpo)
  const permitidos = ['titulo', 'descricao', 'tipo', 'meta', 'inicio', 'fim', 'recompensaMoedas', 'cursoId']
  if (Object.keys(entrada).some((chave) => !permitidos.includes(chave))) {
    throw erroValidacao('campo desconhecido')
  }
  if (!TIPOS_MISSAO.includes(entrada.tipo as TipoMissao)) {
    throw erroValidacao(`tipo deve ser um entre ${TIPOS_MISSAO.join(', ')}`)
  }
  const inicio = data(entrada.inicio, 'inicio')
  const fim = data(entrada.fim, 'fim')
  if (fim <= inicio) throw erroValidacao('fim deve ser posterior ao inicio')
  if (fim <= agora) throw erroValidacao('fim deve estar no futuro')
  const cursoId = entrada.cursoId ?? null
  if (cursoId !== null && typeof cursoId !== 'string') throw erroValidacao('cursoId invalido')
  return {
    titulo: texto(entrada.titulo, 'titulo', LIMITES.tituloMax, true),
    descricao: texto(entrada.descricao ?? '', 'descricao', LIMITES.descricaoMax, false),
    tipo: entrada.tipo as TipoMissao,
    meta: inteiro(entrada.meta, 'meta', 1, LIMITES.metaMax),
    inicio,
    fim,
    recompensaMoedas: inteiro(entrada.recompensaMoedas, 'recompensaMoedas', 0, LIMITES.recompensaMax),
    cursoId,
  }
}

export interface AjusteDeMissao {
  titulo?: string
  descricao?: string
  recompensa_moedas?: number
  fim?: Date
  ativa?: boolean
}

// R-MS7/R-MS8: só estes campos mudam; `fim` apenas enquanto a missão não encerrou
export function validarAjuste(
  corpo: unknown,
  missao: { inicio: Date; fim: Date },
  agora: Date
): AjusteDeMissao {
  const entrada = objeto(corpo)
  const permitidos = ['titulo', 'descricao', 'recompensaMoedas', 'fim', 'ativa']
  const chaves = Object.keys(entrada)
  if (chaves.length === 0 || chaves.some((chave) => !permitidos.includes(chave))) {
    throw erroValidacao('informe ao menos um entre titulo, descricao, recompensaMoedas, fim e ativa')
  }
  const ajuste: AjusteDeMissao = {}
  if ('titulo' in entrada) ajuste.titulo = texto(entrada.titulo, 'titulo', LIMITES.tituloMax, true)
  if ('descricao' in entrada) ajuste.descricao = texto(entrada.descricao, 'descricao', LIMITES.descricaoMax, false)
  if ('recompensaMoedas' in entrada) {
    ajuste.recompensa_moedas = inteiro(entrada.recompensaMoedas, 'recompensaMoedas', 0, LIMITES.recompensaMax)
  }
  if ('ativa' in entrada) {
    if (typeof entrada.ativa !== 'boolean') throw erroValidacao('ativa deve ser booleano')
    ajuste.ativa = entrada.ativa
  }
  if ('fim' in entrada) {
    const fim = data(entrada.fim, 'fim')
    if (fim <= missao.inicio) throw erroValidacao('fim deve ser posterior ao inicio')
    if (fim <= agora) throw erroValidacao('fim deve estar no futuro')
    if (statusDaMissao(missao, agora) === 'encerrada') {
      throw erroConflito('missao encerrada nao pode ter o fim alterado')
    }
    ajuste.fim = fim
  }
  return ajuste
}

// R-MS2: progresso derivado dos eventos de XP verificados dentro da janela e do escopo
export async function progressoDaMissao(db: Db, usuarioId: string, missao: Missao): Promise<number> {
  const where: Prisma.EventoXpWhereInput = {
    usuario_id: usuarioId,
    concedido_em: { gte: missao.inicio, lt: missao.fim },
    ...(missao.curso_id ? { curso_id: missao.curso_id } : {}),
  }
  if (missao.tipo === 'xp_ganho') {
    const soma = await db.eventoXp.aggregate({ where, _sum: { xp: true } })
    return soma._sum.xp ?? 0
  }
  return db.eventoXp.count({ where: { ...where, origem: ORIGEM_DO_TIPO[missao.tipo] } })
}

export interface MissaoCumprida {
  missaoId: string
  titulo: string
  moedas: number
}

/**
 * R-MS4/R-MS5: reavalia as missões em andamento do estudante (globais ou do curso do evento)
 * e paga as que atingiram a meta, uma única vez, na transação do evento de XP.
 */
export async function avaliarMissoes(
  tx: Tx,
  usuarioId: string,
  cursoId: string,
  agora: Date
): Promise<MissaoCumprida[]> {
  const candidatas = await tx.missao.findMany({
    where: {
      ativa: true,
      inicio: { lte: agora },
      fim: { gt: agora },
      OR: [{ curso_id: null }, { curso_id: cursoId }],
      cumprimentos: { none: { usuario_id: usuarioId } },
    },
  })
  const cumpridas: MissaoCumprida[] = []
  for (const missao of candidatas) {
    if ((await progressoDaMissao(tx, usuarioId, missao)) < missao.meta) continue
    const criado = await tx.cumprimentoMissao.createMany({
      data: [
        {
          id: randomUUID(),
          missao_id: missao.id,
          usuario_id: usuarioId,
          moedas: missao.recompensa_moedas,
          cumprida_em: agora,
        },
      ],
      skipDuplicates: true,
    })
    if (criado.count === 0) continue
    await creditar(tx, usuarioId, {
      origem: 'missao',
      chave: `missao:${missao.id}`,
      referenciaId: missao.id,
      valor: missao.recompensa_moedas,
    })
    cumpridas.push({ missaoId: missao.id, titulo: missao.titulo, moedas: missao.recompensa_moedas })
  }
  return cumpridas
}

type MissaoComCurso = Missao & { curso: { id: string; titulo: string; dono_id: string } | null }

function escopoDe(missao: MissaoComCurso) {
  return missao.curso ? { cursoId: missao.curso.id, cursoTitulo: missao.curso.titulo } : null
}

function basicoDe(missao: MissaoComCurso) {
  return {
    missaoId: missao.id,
    titulo: missao.titulo,
    descricao: missao.descricao,
    tipo: missao.tipo,
    meta: missao.meta,
    inicio: missao.inicio.toISOString(),
    fim: missao.fim.toISOString(),
    recompensaMoedas: missao.recompensa_moedas,
    escopo: escopoDe(missao),
  }
}

// F6-01 — R-MS9
export async function listarParaEstudante(usuarioId: string, agora = new Date()) {
  const missoes = await prisma.missao.findMany({
    where: {
      ativa: true,
      inicio: { lte: agora },
      OR: [{ curso_id: null }, { curso: { publicado: true } }],
    },
    include: {
      curso: { select: { id: true, titulo: true, dono_id: true } },
      cumprimentos: { where: { usuario_id: usuarioId } },
    },
    orderBy: [{ fim: 'desc' }, { id: 'asc' }],
    take: LIMITES.listagemMax,
  })
  const itens = await Promise.all(
    missoes.map(async (missao) => {
      const cumprimento = missao.cumprimentos[0]
      const atual = cumprimento ? missao.meta : await progressoDaMissao(prisma, usuarioId, missao)
      return {
        ...basicoDe(missao),
        status: statusDaMissao(missao, agora) as Exclude<StatusMissao, 'futura'>,
        progresso: Math.min(atual, missao.meta),
        cumprida: Boolean(cumprimento),
        cumpridaEm: cumprimento ? cumprimento.cumprida_em.toISOString() : null,
      }
    })
  )
  return { missoes: itens }
}

async function cursoParaMissao(cursoId: unknown, usuario: UsuarioSessao) {
  const curso =
    typeof cursoId === 'string' && uuidValido.test(cursoId)
      ? await prisma.curso.findUnique({ where: { id: cursoId }, select: { id: true, dono_id: true, publicado: true } })
      : null
  if (!curso || (!curso.publicado && !ehDonoOuAdmin(curso.dono_id, usuario))) {
    throw erroNaoEncontrado('curso nao encontrado')
  }
  exigirAutoria(curso.dono_id, usuario)
  return curso
}

function paraGestao(missao: MissaoComCurso, cumpriram: number, agora: Date) {
  return {
    ...basicoDe(missao),
    ativa: missao.ativa,
    status: statusDaMissao(missao, agora),
    cumpriram,
  }
}

// F6-02 — R-MS6 (401 → 403 papel → 404 → 403 autoria → 400)
export async function criarMissao(usuario: UsuarioSessao, corpo: unknown, agora = new Date()) {
  const entrada = objeto(corpo)
  const cursoId = entrada.cursoId ?? null
  if (cursoId !== null) await cursoParaMissao(cursoId, usuario)
  else if (usuario.papel !== 'administrador') {
    throw new Erro(403, 'proibido', 'professor so cria missao de curso proprio')
  }
  const dados = validarNovaMissao(corpo, agora)
  const criada = await prisma.missao.create({
    data: {
      id: randomUUID(),
      titulo: dados.titulo,
      descricao: dados.descricao,
      tipo: dados.tipo,
      meta: dados.meta,
      inicio: dados.inicio,
      fim: dados.fim,
      recompensa_moedas: dados.recompensaMoedas,
      curso_id: dados.cursoId,
      criador_id: usuario.id,
    },
    include: { curso: { select: { id: true, titulo: true, dono_id: true } } },
  })
  return paraGestao(criada, 0, agora)
}

// F6-03 — R-MS10: professor vê as que criou ou de seus cursos; administrador vê todas
export async function listarGestao(usuario: UsuarioSessao, agora = new Date()) {
  const missoes = await prisma.missao.findMany({
    where:
      usuario.papel === 'administrador'
        ? {}
        : { OR: [{ criador_id: usuario.id }, { curso: { dono_id: usuario.id } }] },
    include: {
      curso: { select: { id: true, titulo: true, dono_id: true } },
      _count: { select: { cumprimentos: true } },
    },
    orderBy: [{ criado_em: 'desc' }, { id: 'asc' }],
  })
  return { missoes: missoes.map((missao) => paraGestao(missao, missao._count.cumprimentos, agora)) }
}

// F6-04 — R-MS7/R-MS8 (404 → 403 → 400 → 409)
export async function ajustarMissao(usuario: UsuarioSessao, id: unknown, corpo: unknown, agora = new Date()) {
  const missao =
    typeof id === 'string' && uuidValido.test(id)
      ? await prisma.missao.findUnique({
          where: { id },
          include: {
            curso: { select: { id: true, titulo: true, dono_id: true } },
            _count: { select: { cumprimentos: true } },
          },
        })
      : null
  if (!missao) throw erroNaoEncontrado('missao nao encontrada')
  const dono = missao.curso?.dono_id ?? missao.criador_id
  if (usuario.papel !== 'administrador' && missao.criador_id !== usuario.id && dono !== usuario.id) {
    throw new Erro(403, 'proibido', 'somente quem criou a missao ou o administrador pode altera-la')
  }
  const ajuste = validarAjuste(corpo, missao, agora)
  const atualizada = await prisma.missao.update({
    where: { id: missao.id },
    data: ajuste,
    include: { curso: { select: { id: true, titulo: true, dono_id: true } } },
  })
  return paraGestao(atualizada, missao._count.cumprimentos, agora)
}
