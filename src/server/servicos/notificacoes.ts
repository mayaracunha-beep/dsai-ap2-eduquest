import { randomUUID } from 'node:crypto'
import type { Notificacao, Prisma, TipoNotificacao } from '@prisma/client'
import { erroNaoEncontrado, erroValidacao } from '../erros'
import { prisma } from '../prisma'
import { uuidValido } from '../tipos'

// SPEC/2026-11-19-notificacoes.md (D13) — notificações in-app disparadas por eventos

type Tx = Prisma.TransactionClient

export const RETENCAO_MAXIMA = 200
export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 50

export const TIPOS_NOTIFICACAO: Record<TipoNotificacao, string> = {
  conquista_desbloqueada: 'Conquistas desbloqueadas',
  missao_cumprida: 'Missões cumpridas',
  item_comprado: 'Compras na loja',
  nivel_alcancado: 'Novos níveis',
}

const TIPOS = Object.keys(TIPOS_NOTIFICACAO) as TipoNotificacao[]

export interface DadosDoEvento {
  nome?: string
  moedas?: number
  nivel?: number
}

function aparar(texto: string): string {
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto
}

function plural(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? 'moeda' : 'moedas'}`
}

// R-NT7: texto composto no servidor, só com dados do próprio evento
export function comporTexto(tipo: TipoNotificacao, dados: DadosDoEvento): { titulo: string; mensagem: string } {
  const nome = aparar(dados.nome ?? '')
  switch (tipo) {
    case 'conquista_desbloqueada':
      return { titulo: 'Nova conquista!', mensagem: `Você desbloqueou "${nome}".` }
    case 'missao_cumprida': {
      const premio = dados.moedas && dados.moedas > 0 ? ` e ganhou ${plural(dados.moedas)}` : ''
      return { titulo: 'Missão cumprida!', mensagem: `Você cumpriu "${nome}"${premio}.` }
    }
    case 'item_comprado':
      return { titulo: 'Compra realizada', mensagem: `${nome} já está no seu inventário.` }
    case 'nivel_alcancado':
      return { titulo: 'Novo nível!', mensagem: `Você chegou ao nível ${dados.nivel ?? 1}.` }
  }
}

// R-NT8: mantém no máximo `limite` por estudante, apagando só as lidas mais antigas
export async function podar(tx: Tx, usuarioId: string, limite = RETENCAO_MAXIMA): Promise<number> {
  const total = await tx.notificacao.count({ where: { usuario_id: usuarioId } })
  if (total <= limite) return 0
  const excedentes = await tx.notificacao.findMany({
    where: { usuario_id: usuarioId, lida_em: { not: null } },
    orderBy: [{ criado_em: 'asc' }, { id: 'asc' }],
    take: total - limite,
    select: { id: true },
  })
  const apagadas = await tx.notificacao.deleteMany({ where: { id: { in: excedentes.map((n) => n.id) } } })
  return apagadas.count
}

export interface Disparo {
  tipo: TipoNotificacao
  chave: string
  referenciaId?: string
  dados: DadosDoEvento
}

/**
 * R-NT2/R-NT3: cria a notificação na transação do evento, se o estudante não desativou o tipo.
 * A chave única (estudante + chave) impede repetir o aviso do mesmo evento.
 */
export async function notificar(tx: Tx, usuarioId: string, disparo: Disparo): Promise<boolean> {
  const preferencia = await tx.preferenciaNotificacao.findUnique({
    where: { usuario_id_tipo: { usuario_id: usuarioId, tipo: disparo.tipo } },
  })
  if (preferencia?.ativa === false) return false
  const { titulo, mensagem } = comporTexto(disparo.tipo, disparo.dados)
  const criada = await tx.notificacao.createMany({
    data: [
      {
        id: randomUUID(),
        usuario_id: usuarioId,
        tipo: disparo.tipo,
        titulo,
        mensagem,
        referencia_id: disparo.referenciaId ?? null,
        chave: disparo.chave,
      },
    ],
    skipDuplicates: true,
  })
  if (criada.count === 0) return false
  await podar(tx, usuarioId)
  return true
}

export interface NotificacaoDto {
  notificacaoId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  lida: boolean
  criadaEm: string
  lidaEm: string | null
}

function paraDto(notificacao: Notificacao): NotificacaoDto {
  return {
    notificacaoId: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    mensagem: notificacao.mensagem,
    lida: notificacao.lida_em !== null,
    criadaEm: notificacao.criado_em.toISOString(),
    lidaEm: notificacao.lida_em ? notificacao.lida_em.toISOString() : null,
  }
}

export interface ConsultaDeNotificacoes {
  limite: number
  apenasNaoLidas: boolean
}

// R-NT6/R-NT9
export function validarConsulta(query: unknown): ConsultaDeNotificacoes {
  const entrada = (query ?? {}) as Record<string, unknown>
  if (Object.keys(entrada).some((chave) => chave !== 'limite' && chave !== 'apenasNaoLidas')) {
    throw erroValidacao('parametro desconhecido')
  }
  let limite = LIMITE_PADRAO
  if (entrada.limite !== undefined) {
    const numero = typeof entrada.limite === 'string' && /^\d+$/.test(entrada.limite) ? Number(entrada.limite) : NaN
    if (!Number.isInteger(numero) || numero < 1 || numero > LIMITE_MAXIMO) {
      throw erroValidacao(`limite deve ser inteiro entre 1 e ${LIMITE_MAXIMO}`)
    }
    limite = numero
  }
  let apenasNaoLidas = false
  if (entrada.apenasNaoLidas !== undefined) {
    if (entrada.apenasNaoLidas !== 'true' && entrada.apenasNaoLidas !== 'false') {
      throw erroValidacao('apenasNaoLidas deve ser true ou false')
    }
    apenasNaoLidas = entrada.apenasNaoLidas === 'true'
  }
  return { limite, apenasNaoLidas }
}

// F9-01
export async function listarNotificacoes(usuarioId: string, query: unknown) {
  const { limite, apenasNaoLidas } = validarConsulta(query)
  const [notificacoes, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { usuario_id: usuarioId, ...(apenasNaoLidas ? { lida_em: null } : {}) },
      orderBy: [{ criado_em: 'desc' }, { id: 'asc' }],
      take: limite,
    }),
    prisma.notificacao.count({ where: { usuario_id: usuarioId, lida_em: null } }),
  ])
  return { naoLidas, notificacoes: notificacoes.map(paraDto) }
}

// F9-02 — R-NT4/R-NT5: a primeira leitura vale; repetir não muda o instante
export async function marcarLida(usuarioId: string, id: unknown): Promise<NotificacaoDto> {
  if (typeof id !== 'string' || !uuidValido.test(id)) throw erroNaoEncontrado('notificacao nao encontrada')
  const propria = await prisma.notificacao.findFirst({ where: { id, usuario_id: usuarioId } })
  if (!propria) throw erroNaoEncontrado('notificacao nao encontrada')
  await prisma.notificacao.updateMany({ where: { id, usuario_id: usuarioId, lida_em: null }, data: { lida_em: new Date() } })
  return paraDto(await prisma.notificacao.findUniqueOrThrow({ where: { id } }))
}

// F9-03
export async function marcarTodasLidas(usuarioId: string) {
  const marcadas = await prisma.notificacao.updateMany({
    where: { usuario_id: usuarioId, lida_em: null },
    data: { lida_em: new Date() },
  })
  return { marcadas: marcadas.count }
}

export interface PreferenciaDeNotificacao {
  tipo: TipoNotificacao
  rotulo: string
  ativa: boolean
}

// F9-04 — R-NT3: sem linha, o tipo está ativo
export async function lerPreferencias(usuarioId: string): Promise<{ preferencias: PreferenciaDeNotificacao[] }> {
  const linhas = await prisma.preferenciaNotificacao.findMany({ where: { usuario_id: usuarioId } })
  const ativas = new Map(linhas.map((linha) => [linha.tipo, linha.ativa]))
  return {
    preferencias: TIPOS.map((tipo) => ({ tipo, rotulo: TIPOS_NOTIFICACAO[tipo], ativa: ativas.get(tipo) ?? true })),
  }
}

// F9-05
export async function alterarPreferencia(usuarioId: string, corpo: unknown) {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  const entrada = corpo as Record<string, unknown>
  if (Object.keys(entrada).some((chave) => chave !== 'tipo' && chave !== 'ativa')) {
    throw erroValidacao('campo desconhecido')
  }
  if (typeof entrada.tipo !== 'string' || !TIPOS.includes(entrada.tipo as TipoNotificacao)) {
    throw erroValidacao(`tipo deve ser um entre ${TIPOS.join(', ')}`)
  }
  if (typeof entrada.ativa !== 'boolean') throw erroValidacao('ativa deve ser booleano')
  const tipo = entrada.tipo as TipoNotificacao
  await prisma.preferenciaNotificacao.upsert({
    where: { usuario_id_tipo: { usuario_id: usuarioId, tipo } },
    create: { usuario_id: usuarioId, tipo, ativa: entrada.ativa },
    update: { ativa: entrada.ativa },
  })
  return lerPreferencias(usuarioId)
}
