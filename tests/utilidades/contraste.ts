// WCAG 2.x: luminância relativa e razão de contraste entre duas cores hexadecimais (#rrggbb)

function canal(valor: number): number {
  const c = valor / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminancia(hex: string): number {
  const limpo = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) throw new Error(`cor invalida: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(limpo.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (maior + 0.05) / (menor + 0.05)
}

// lê os tokens de cor declarados em `:root` do CSS real
export function tokensDeCor(css: string): Record<string, string> {
  const inicio = css.indexOf(':root')
  const bloco = css.slice(inicio, css.indexOf('}', inicio))
  const tokens: Record<string, string> = {}
  for (const [, nome, valor] of bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[nome] = valor
  return tokens
}
