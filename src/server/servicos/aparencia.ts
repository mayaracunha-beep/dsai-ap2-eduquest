import { erroNaoEncontrado, erroValidacao } from '../erros'
import { prisma } from '../prisma'
import { itensDoPerfil } from './loja'

// SPEC/2026-11-21-nome-avatar-moldura.md — nome, avatar (catálogo fixo) e itens equipados exibidos no perfil

export const NOME_MAXIMO = 60

export interface AvatarDto {
  id: string
  rotulo: string
  emoji: string
  cor: string
}

// R-AV3: catálogo fixo; não há envio de imagem
export const AVATARES: readonly AvatarDto[] = [
  { id: 'coruja', rotulo: 'Coruja', emoji: '🦉', cor: '#dbeafe' },
  { id: 'raposa', rotulo: 'Raposa', emoji: '🦊', cor: '#ffedd5' },
  { id: 'gato', rotulo: 'Gato', emoji: '🐱', cor: '#fef3c7' },
  { id: 'panda', rotulo: 'Panda', emoji: '🐼', cor: '#e5e7eb' },
  { id: 'robo', rotulo: 'Robô', emoji: '🤖', cor: '#e0e7ff' },
  { id: 'foguete', rotulo: 'Foguete', emoji: '🚀', cor: '#fce7f3' },
  { id: 'planeta', rotulo: 'Planeta', emoji: '🪐', cor: '#ede9fe' },
  { id: 'livro', rotulo: 'Livros', emoji: '📚', cor: '#dcfce7' },
  { id: 'estrela', rotulo: 'Estrela', emoji: '⭐', cor: '#fef9c3' },
  { id: 'dragao', rotulo: 'Dragão', emoji: '🐲', cor: '#d1fae5' },
  { id: 'cacto', rotulo: 'Cacto', emoji: '🌵', cor: '#ecfccb' },
  { id: 'onda', rotulo: 'Onda', emoji: '🌊', cor: '#cffafe' },
]

export function avatarPorId(id: string | null | undefined): AvatarDto | null {
  return AVATARES.find((avatar) => avatar.id === id) ?? null
}

// R-AV2: 1 a 60 caracteres úteis, sem `@` e sem caracteres de controle
export function validarNome(valor: unknown): string {
  if (typeof valor !== 'string') throw erroValidacao('nome deve ser texto')
  const limpo = valor.trim()
  if (limpo.length === 0 || limpo.length > NOME_MAXIMO) {
    throw erroValidacao(`nome deve ter de 1 a ${NOME_MAXIMO} caracteres`)
  }
  // eslint-disable-next-line no-control-regex
  if (limpo.includes('@') || /[\u0000-\u001f\u007f]/.test(limpo)) {
    throw erroValidacao('nome nao pode conter @ nem caracteres de controle')
  }
  return limpo
}

// R-AV3: o código precisa existir no catálogo
export function validarAvatar(valor: unknown): string {
  if (typeof valor !== 'string' || !avatarPorId(valor)) {
    throw erroValidacao(`avatar deve ser um entre ${AVATARES.map((avatar) => avatar.id).join(', ')}`)
  }
  return valor
}

export interface ItemEquipado {
  codigo: string
  nome: string
}

// R-AV4: o equipado de cada categoria, ou null
export function equipadosDe(
  inventario: { codigo: string; nome: string; categoria: string; equipado: boolean }[]
): { moldura: ItemEquipado | null; titulo: ItemEquipado | null } {
  const equipado = (categoria: string): ItemEquipado | null => {
    const item = inventario.find((posse) => posse.equipado && posse.categoria === categoria)
    return item ? { codigo: item.codigo, nome: item.nome } : null
  }
  return { moldura: equipado('moldura'), titulo: equipado('titulo') }
}

export interface Aparencia {
  nome: string | null
  avatar: AvatarDto | null
  moldura: ItemEquipado | null
  titulo: ItemEquipado | null
}

// F11-02 — R-AV7: moldura e título só existem para estudantes
export async function lerAparencia(usuarioId: string): Promise<Aparencia> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { nome: true, avatar: true, papel: true },
  })
  if (!usuario) throw erroNaoEncontrado('usuario nao encontrado')
  const equipados =
    usuario.papel === 'estudante' ? equipadosDe(await itensDoPerfil(usuarioId)) : { moldura: null, titulo: null }
  return { nome: usuario.nome, avatar: avatarPorId(usuario.avatar), ...equipados }
}

// F11-03 — R-AV5: parcial, com ao menos um campo; só o próprio usuário (a rota usa o id da sessão)
export async function salvarAparencia(usuarioId: string, corpo: unknown): Promise<Aparencia> {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('corpo da requisicao invalido')
  }
  const entrada = corpo as Record<string, unknown>
  const chaves = Object.keys(entrada)
  if (chaves.length === 0 || chaves.some((chave) => chave !== 'nome' && chave !== 'avatar')) {
    throw erroValidacao('informe nome e/ou avatar')
  }
  const data: { nome?: string; avatar?: string | null } = {}
  if ('nome' in entrada) data.nome = validarNome(entrada.nome)
  if ('avatar' in entrada) data.avatar = entrada.avatar === null ? null : validarAvatar(entrada.avatar)
  await prisma.usuario.update({ where: { id: usuarioId }, data })
  return lerAparencia(usuarioId)
}
