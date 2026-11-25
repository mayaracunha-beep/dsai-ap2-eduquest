import type { CSSProperties } from 'react'
import {
  classeDaMoldura,
  descreverAvatar,
  iniciaisDe,
  type ItemEquipado,
  type OpcaoDeAvatar,
} from '../tiposAparencia'

// SPEC/2026-11-21-nome-avatar-moldura.md R-AV3/R-AV4/R-AV8 — avatar com a moldura equipada em volta

interface Props {
  nome: string | null
  avatar: OpcaoDeAvatar | null
  moldura?: ItemEquipado | null
  tamanho?: 'sm' | 'md' | 'lg'
}

export function Avatar({ nome, avatar, moldura = null, tamanho = 'md' }: Props) {
  const classes = ['avatar', `avatar-${tamanho}`]
  if (moldura) classes.push('avatar-moldura', classeDaMoldura(moldura.codigo))
  if (!avatar) classes.push('avatar-iniciais')
  const estilo = avatar ? ({ '--avatar-cor': avatar.cor } as CSSProperties) : undefined
  return (
    <span className={classes.join(' ')} role="img" aria-label={descreverAvatar(nome, avatar, moldura)} style={estilo}>
      <span aria-hidden="true">{avatar ? avatar.emoji : iniciaisDe(nome)}</span>
    </span>
  )
}
