import { randomUUID } from 'node:crypto'
import { Prisma, type CategoriaItem, type ItemLoja } from '@prisma/client'
import { Erro, erroConflito, erroNaoEncontrado, erroValidacao } from '../erros'
import { prisma } from '../prisma'
import { uuidValido } from '../tipos'
import { lerSaldo } from './moedas'
import { notificar } from './notificacoes'

// SPEC/2026-11-19-moedas-loja-inventario.md (D12) — loja, compra, inventário e configuração

export const PRECO_MAXIMO = 10_000
export const ESTOQUE_MAXIMO = 100_000

export interface ItemDaLoja {
  itemId: string
  codigo: string
  nome: string
  descricao: string
  categoria: CategoriaItem
  preco: number
  estoque: number | null
  possui?: boolean
}

export interface ItemDoInventario {
  itemId: string
  codigo: string
  nome: string
  categoria: CategoriaItem
  equipado: boolean
  adquiridoEm: string
}

export interface ItemDoPerfil {
  itemId: string
  codigo: string
  nome: string
  categoria: CategoriaItem
  equipado: boolean
}

function paraItemDaLoja(item: ItemLoja, possui?: boolean): ItemDaLoja {
  return {
    itemId: item.id,
    codigo: item.codigo,
    nome: item.nome,
    descricao: item.descricao,
    categoria: item.categoria,
    preco: item.preco,
    estoque: item.estoque,
    ...(possui === undefined ? {} : { possui }),
  }
}

function idValido(id: unknown): id is string {
  return typeof id === 'string' && uuidValido.test(id)
}

// F8-02: só itens ativos; para o estudante, marca os que ele já possui
export async function listarLoja(usuario: { id: string; papel: string }) {
  const itens = await prisma.itemLoja.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } })
  let possuidos = new Set<string>()
  if (usuario.papel === 'estudante') {
    const posses = await prisma.itemInventario.findMany({
      where: { usuario_id: usuario.id },
      select: { item_id: true },
    })
    possuidos = new Set(posses.map((posse) => posse.item_id))
  }
  const marcar = usuario.papel === 'estudante'
  return { itens: itens.map((item) => paraItemDaLoja(item, marcar ? possuidos.has(item.id) : undefined)) }
}

// F8-03 — R-M3: compra atômica; as baixas condicionais impedem estoque ou saldo negativos
export async function comprarItem(usuarioId: string, itemIdRecebido: unknown) {
  if (!idValido(itemIdRecebido)) throw erroNaoEncontrado('item nao encontrado')
  const itemId = itemIdRecebido
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.itemLoja.findUnique({ where: { id: itemId } })
      if (!item || !item.ativo) throw erroNaoEncontrado('item nao encontrado')

      const jaPossui = await tx.itemInventario.findUnique({
        where: { usuario_id_item_id: { usuario_id: usuarioId, item_id: itemId } },
      })
      if (jaPossui) throw erroConflito('item ja adquirido')

      if (item.estoque !== null) {
        const baixa = await tx.itemLoja.updateMany({
          where: { id: itemId, estoque: { gt: 0 } },
          data: { estoque: { decrement: 1 } },
        })
        if (baixa.count === 0) throw erroConflito('item esgotado')
      }

      if (item.preco > 0) {
        const debito = await tx.saldoMoeda.updateMany({
          where: { usuario_id: usuarioId, saldo: { gte: item.preco } },
          data: { saldo: { decrement: item.preco } },
        })
        if (debito.count === 0) throw erroConflito('saldo insuficiente')
      }

      const agora = new Date()
      await tx.eventoMoeda.create({
        data: {
          id: randomUUID(),
          usuario_id: usuarioId,
          origem: 'compra',
          referencia_id: itemId,
          chave: `compra:${itemId}`,
          valor: -item.preco,
          criado_em: agora,
        },
      })
      const posse = await tx.itemInventario.create({
        data: { id: randomUUID(), usuario_id: usuarioId, item_id: itemId, adquirido_em: agora },
      })
      // D13 (R-NT2): aviso na mesma transação da compra
      await notificar(tx, usuarioId, {
        tipo: 'item_comprado',
        chave: `compra:${itemId}`,
        referenciaId: itemId,
        dados: { nome: item.nome },
      })
      const atualizado = await tx.itemLoja.findUniqueOrThrow({ where: { id: itemId } })
      return {
        saldo: await lerSaldo(tx, usuarioId),
        item: {
          ...paraItemDaLoja(atualizado, true),
          equipado: posse.equipado,
        },
      }
    })
  } catch (erro) {
    // compras simultâneas do mesmo item: a unicidade do inventário desfaz a perdedora
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw erroConflito('item ja adquirido')
    }
    throw erro
  }
}

type PosseComItem = Prisma.ItemInventarioGetPayload<{ include: { item: true } }>

function paraItemDoInventario(posse: PosseComItem): ItemDoInventario {
  return {
    itemId: posse.item_id,
    codigo: posse.item.codigo,
    nome: posse.item.nome,
    categoria: posse.item.categoria,
    equipado: posse.equipado,
    adquiridoEm: posse.adquirido_em.toISOString(),
  }
}

// F8-04: itens do estudante, os mais antigos primeiro (desempate pelo catálogo)
export async function listarInventario(usuarioId: string) {
  const posses = await prisma.itemInventario.findMany({
    where: { usuario_id: usuarioId },
    include: { item: true },
    orderBy: [{ adquirido_em: 'asc' }, { item: { ordem: 'asc' } }],
  })
  return { itens: posses.map(paraItemDoInventario) }
}

// R-M10: itens possuídos exibidos no perfil
export async function itensDoPerfil(usuarioId: string): Promise<ItemDoPerfil[]> {
  const { itens } = await listarInventario(usuarioId)
  return itens.map(({ itemId, codigo, nome, categoria, equipado }) => ({
    itemId,
    codigo,
    nome,
    categoria,
    equipado,
  }))
}

// F8-05 — R-M6: no máximo um equipado por categoria
export async function definirEquipado(usuarioId: string, itemId: unknown, corpo: unknown) {
  if (!idValido(itemId)) throw erroNaoEncontrado('item nao encontrado no inventario')
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  const campos = Object.keys(corpo)
  const equipado = (corpo as { equipado?: unknown }).equipado
  if (campos.length !== 1 || typeof equipado !== 'boolean') {
    throw erroValidacao('informe apenas equipado (booleano)')
  }
  return prisma.$transaction(async (tx) => {
    // serializa trocas concorrentes do mesmo estudante
    await tx.$queryRaw`SELECT "id" FROM "item_inventario" WHERE "usuario_id" = ${usuarioId}::uuid FOR UPDATE`
    const posse = await tx.itemInventario.findUnique({
      where: { usuario_id_item_id: { usuario_id: usuarioId, item_id: itemId } },
      include: { item: true },
    })
    if (!posse) throw erroNaoEncontrado('item nao encontrado no inventario')
    if (equipado) {
      await tx.itemInventario.updateMany({
        where: { usuario_id: usuarioId, equipado: true, item: { categoria: posse.item.categoria } },
        data: { equipado: false },
      })
    }
    const atualizada = await tx.itemInventario.update({
      where: { id: posse.id },
      data: { equipado },
      include: { item: true },
    })
    return paraItemDoInventario(atualizada)
  })
}

// F8-06: todos os itens, inclusive os inativos
export async function lerConfigLoja() {
  const itens = await prisma.itemLoja.findMany({ orderBy: { ordem: 'asc' } })
  return { itens: itens.map((item) => ({ ...paraItemDaLoja(item), ativo: item.ativo })) }
}

function inteiroEntre(valor: unknown, minimo: number, maximo: number, rotulo: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw erroValidacao(`${rotulo} deve ser inteiro entre ${minimo} e ${maximo}`)
  }
  return valor
}

// F8-07 — R-M9: ajuste parcial; qualquer campo desconhecido ou corpo vazio é 400
export async function ajustarItem(itemId: unknown, corpo: unknown) {
  if (!idValido(itemId)) throw erroNaoEncontrado('item nao encontrado')
  const existente = await prisma.itemLoja.findUnique({ where: { id: itemId } })
  if (!existente) throw erroNaoEncontrado('item nao encontrado')
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  const entrada = corpo as Record<string, unknown>
  const permitidos = ['preco', 'estoque', 'ativo']
  const chaves = Object.keys(entrada)
  if (chaves.length === 0 || chaves.some((chave) => !permitidos.includes(chave))) {
    throw new Erro(400, 'validacao', 'informe ao menos um entre preco, estoque e ativo')
  }
  const data: Prisma.ItemLojaUpdateInput = {}
  if ('preco' in entrada) data.preco = inteiroEntre(entrada.preco, 0, PRECO_MAXIMO, 'preco')
  if ('estoque' in entrada) {
    data.estoque =
      entrada.estoque === null ? null : inteiroEntre(entrada.estoque, 0, ESTOQUE_MAXIMO, 'estoque')
  }
  if ('ativo' in entrada) {
    if (typeof entrada.ativo !== 'boolean') throw erroValidacao('ativo deve ser booleano')
    data.ativo = entrada.ativo
  }
  const atualizado = await prisma.itemLoja.update({ where: { id: itemId }, data })
  return { ...paraItemDaLoja(atualizado), ativo: atualizado.ativo }
}
