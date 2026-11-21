import { randomUUID } from 'node:crypto'
import type { OrigemXp } from '@prisma/client'
import { prisma } from '../../src/server/prisma'
import { concederXp } from '../../src/server/servicos/xp'

// evento de XP verificado, pela mesma função que as ações usam (dispara moedas, missões e avisos)
export async function registrarEvento(usuarioId: string, cursoId: string, origem: OrigemXp, xp = 0) {
  return prisma.$transaction((tx) =>
    concederXp(tx, usuarioId, cursoId, () => [
      { origem, referenciaId: randomUUID(), cursoId, chave: `teste:${randomUUID()}`, xp },
    ])
  )
}
