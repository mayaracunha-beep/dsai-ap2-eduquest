// SPEC/2026-11-21-nome-avatar-moldura.md §4 — tipos e regras de exibição de nome, avatar e moldura

export interface OpcaoDeAvatar {
  id: string
  rotulo: string
  emoji: string
  cor: string
}

export interface ItemEquipado {
  codigo: string
  nome: string
}

export interface Aparencia {
  nome: string | null
  avatar: OpcaoDeAvatar | null
  moldura: ItemEquipado | null
  titulo: ItemEquipado | null
}

export const NOME_MAXIMO = 60

// sem avatar escolhido, a tela mostra as iniciais (até duas) do nome (R-AV3)
export function iniciaisDe(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length === 1 ? [partes[0]] : [partes[0], partes[partes.length - 1]]
  return letras.map((parte) => Array.from(parte)[0].toUpperCase()).join('')
}

// moldura conhecida → classe própria; qualquer outra (item criado pelo administrador) → moldura genérica.
// Lista fechada de propósito: o código vem do servidor e nunca vira nome de classe sem passar por aqui.
export function classeDaMoldura(codigo: string): string {
  switch (codigo) {
    case 'moldura-bronze':
      return 'moldura-bronze'
    case 'moldura-prata':
      return 'moldura-prata'
    case 'moldura-ouro':
      return 'moldura-ouro'
    case 'moldura-galaxia':
      return 'moldura-galaxia'
    default:
      return 'moldura-generica'
  }
}

// R-AV8: nome acessível do avatar
export function descreverAvatar(nome: string | null, avatar: OpcaoDeAvatar | null, moldura: ItemEquipado | null): string {
  const quem = nome?.trim() ? nome.trim() : 'usuário'
  return `Avatar de ${quem}${avatar ? `, ${avatar.rotulo}` : ''}${moldura ? `, com ${moldura.nome}` : ''}`
}
