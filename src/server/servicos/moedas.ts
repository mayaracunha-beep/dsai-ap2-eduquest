import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

// SPEC/2026-11-19-moedas-loja-inventario.md (D12) — moedas ganhas a partir do XP (R-M1) e consulta (F8-01)

type Tx = Prisma.TransactionClient
type Db = Tx | PrismaClient

// R-M1: 1 moeda a cada 5 XP concedidos
export const XP_POR_MOEDA = 5
export const TAMANHO_EXTRATO = 20

export function moedasPorXp(xp: number): number {
  return xp > 0 ? Math.floor(xp / XP_POR_MOEDA) : 0
}

/**
 * R-M1: credita as moedas de um evento de XP recém-gravado, na mesma transação.
 * A chave única (usuário + chave) impede pagar duas vezes o mesmo evento.
 */
export async function creditarPorXp(
  tx: Tx,
  usuarioId: string,
  chaveEventoXp: string,
  referenciaId: string,
  xp: number
): Promise<number> {
  const moedas = moedasPorXp(xp)
  if (moedas === 0) return 0
  const criado = await tx.eventoMoeda.createMany({
    data: [
      {
        id: randomUUID(),
        usuario_id: usuarioId,
        origem: 'xp',
        referencia_id: referenciaId,
        chave: `xp:${chaveEventoXp}`,
        valor: moedas,
      },
    ],
    skipDuplicates: true,
  })
  if (criado.count === 0) return 0
  await tx.saldoMoeda.upsert({
    where: { usuario_id: usuarioId },
    create: { usuario_id: usuarioId, saldo: moedas },
    update: { saldo: { increment: moedas } },
  })
  return moedas
}

export interface MovimentoMoeda {
  origem: 'xp' | 'compra'
  valor: number
  criadoEm: string
}

export interface MoedasDoEstudante {
  saldo: number
  extrato: MovimentoMoeda[]
}

export async function lerSaldo(db: Db, usuarioId: string): Promise<number> {
  const saldo = await db.saldoMoeda.findUnique({ where: { usuario_id: usuarioId } })
  return saldo?.saldo ?? 0
}

// F8-01: saldo (0 se nunca ganhou) e as últimas movimentações, da mais recente para a mais antiga
export async function lerMoedas(db: Db, usuarioId: string): Promise<MoedasDoEstudante> {
  const [saldo, eventos] = await Promise.all([
    lerSaldo(db, usuarioId),
    db.eventoMoeda.findMany({
      where: { usuario_id: usuarioId },
      orderBy: [{ criado_em: 'desc' }, { id: 'asc' }],
      take: TAMANHO_EXTRATO,
    }),
  ])
  return {
    saldo,
    extrato: eventos.map((evento) => ({
      origem: evento.origem,
      valor: evento.valor,
      criadoEm: evento.criado_em.toISOString(),
    })),
  }
}
