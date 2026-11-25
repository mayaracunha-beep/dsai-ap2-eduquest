import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import {
  ROTULO_STATUS,
  ROTULO_TIPO,
  dataHora,
  descreverEscopo,
  type MissaoDoEstudante,
} from '../tiposMissao'
import { formatarMoedas } from '../tiposLoja'

// SPEC/2026-11-19-missoes.md §5 — missões do estudante (F6-01). Progresso e pagamento vêm do servidor.

function CartaoMissao({ missao }: { missao: MissaoDoEstudante }) {
  const percentual = Math.round((missao.progresso / missao.meta) * 100)
  const classes = ['item-loja', 'cartao-missao']
  if (missao.cumprida) classes.push('missao-cumprida')
  if (missao.status === 'encerrada' && !missao.cumprida) classes.push('missao-encerrada')
  return (
    <li className={classes.join(' ')}>
      <div className="item-loja-topo">
        <h2>{missao.titulo}</h2>
        <span className="item-loja-categoria">
          {missao.cumprida ? 'Cumprida' : ROTULO_STATUS[missao.status]}
        </span>
      </div>
      {missao.descricao && <p className="item-loja-descricao">{missao.descricao}</p>}
      <p className="item-loja-estoque">
        {ROTULO_TIPO[missao.tipo]} · {descreverEscopo(missao.escopo)}
      </p>
      <div
        className="barra-progresso"
        role="progressbar"
        aria-label={`Progresso de ${missao.titulo}`}
        aria-valuemin={0}
        aria-valuemax={missao.meta}
        aria-valuenow={missao.progresso}
      >
        <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
      </div>
      <p className="item-loja-estoque">
        {missao.progresso} de {missao.meta} · até {dataHora(missao.fim)}
      </p>
      <p className="item-loja-preco">Recompensa: {formatarMoedas(missao.recompensaMoedas)}</p>
      {missao.cumprida && missao.cumpridaEm && (
        <p className="item-loja-possui">Cumprida em {dataHora(missao.cumpridaEm)}</p>
      )}
    </li>
  )
}

export function PaginaMissoesEstudante() {
  const [missoes, setMissoes] = useState<MissaoDoEstudante[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api<{ missoes: MissaoDoEstudante[] }>('/api/v1/missoes')
      .then((resposta) => setMissoes(resposta.missoes))
      .catch((erroCarga) => setErro(mensagemDeErro(erroCarga)))
  }, [])

  return (
    <main>
      <article>
        <h1>Missões</h1>
        <p className="resumo-estrutura">
          Cumpra missões dentro do prazo e ganhe moedas. O progresso vem das suas ações na plataforma.
        </p>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {missoes === null ? (
          !erro && <p className="carregando">Carregando missões…</p>
        ) : missoes.length === 0 ? (
          <p className="valor-vazio">Nenhuma missão disponível no momento.</p>
        ) : (
          <ul className="grade-loja">
            {missoes.map((missao) => (
              <CartaoMissao key={missao.missaoId} missao={missao} />
            ))}
          </ul>
        )}
      </article>
    </main>
  )
}
