import type { OpcaoDeAvatar } from '../tiposAparencia'

// SPEC/2026-11-21-nome-avatar-moldura.md R-AV3 — escolha de um avatar do catálogo (grupo de opções acessível)

interface Props {
  opcoes: OpcaoDeAvatar[]
  valor: string | null
  aoMudar: (id: string) => void
  nomeDoGrupo: string
}

export function SeletorDeAvatar({ opcoes, valor, aoMudar, nomeDoGrupo }: Props) {
  return (
    <fieldset className="seletor-avatar">
      <legend>Avatar</legend>
      <div className="seletor-avatar-opcoes">
        {opcoes.map((opcao) => (
          <label key={opcao.id} className={valor === opcao.id ? 'opcao-avatar opcao-avatar-ativa' : 'opcao-avatar'}>
            <input
              type="radio"
              name={nomeDoGrupo}
              value={opcao.id}
              checked={valor === opcao.id}
              onChange={() => aoMudar(opcao.id)}
            />
            <span className="opcao-avatar-emoji" style={{ background: opcao.cor }} aria-hidden="true">
              {opcao.emoji}
            </span>
            <span className="opcao-avatar-rotulo">{opcao.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
