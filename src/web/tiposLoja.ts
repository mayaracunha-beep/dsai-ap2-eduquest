// SPEC/2026-11-19-moedas-loja-inventario.md §6 — tipos e rótulos compartilhados da economia (D12)

export type CategoriaItem = 'moldura' | 'titulo'

export interface ItemDaLoja {
  itemId: string
  codigo: string
  nome: string
  descricao: string
  categoria: CategoriaItem
  preco: number
  estoque: number | null
  possui?: boolean
  ativo?: boolean
}

export interface ItemDoInventario {
  itemId: string
  codigo: string
  nome: string
  categoria: CategoriaItem
  equipado: boolean
  adquiridoEm: string
}

export const ROTULO_CATEGORIA: Record<CategoriaItem, string> = {
  moldura: 'Moldura',
  titulo: 'Título',
}

export const ROTULO_CATEGORIA_PLURAL: Record<CategoriaItem, string> = {
  moldura: 'Molduras',
  titulo: 'Títulos',
}

export function formatarMoedas(valor: number): string {
  return `${valor.toLocaleString('pt-BR')} ${valor === 1 ? 'moeda' : 'moedas'}`
}

// R-M8: estoque nulo é ilimitado; zero é esgotado
export function descreverEstoque(estoque: number | null): string {
  if (estoque === null) return 'Estoque ilimitado'
  if (estoque === 0) return 'Esgotado'
  return `${estoque} em estoque`
}
