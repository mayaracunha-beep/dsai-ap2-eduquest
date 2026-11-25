import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import { dataHora } from '../tiposMissao'
import type {
  Notificacao,
  PreferenciaNotificacao,
  RespostaNotificacoes,
} from '../tiposNotificacao'

// SPEC/2026-11-19-notificacoes.md §5 (F9-01–F9-05) — notificações in-app do estudante.
// O servidor decide o que existe e o que foi lido; a tela só lista e envia as ações.

interface Props {
  aoMudarNaoLidas: (naoLidas: number) => void
}

export function PaginaNotificacoes({ aoMudarNaoLidas }: Props) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[] | null>(null)
  const [naoLidas, setNaoLidas] = useState(0)
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false)
  const [preferencias, setPreferencias] = useState<PreferenciaNotificacao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const consulta = apenasNaoLidas ? '?limite=50&apenasNaoLidas=true' : '?limite=50'
      const resposta = await api<RespostaNotificacoes>(`/api/v1/notificacoes${consulta}`)
      setNotificacoes(resposta.notificacoes)
      setNaoLidas(resposta.naoLidas)
      aoMudarNaoLidas(resposta.naoLidas)
    } catch (erroCarga) {
      setErro(mensagemDeErro(erroCarga))
    }
  }, [apenasNaoLidas, aoMudarNaoLidas])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    api<{ preferencias: PreferenciaNotificacao[] }>('/api/v1/notificacoes/preferencias')
      .then((resposta) => setPreferencias(resposta.preferencias))
      .catch((erroCarga) => setErro(mensagemDeErro(erroCarga)))
  }, [])

  async function executar(acao: () => Promise<unknown>) {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
      await carregar()
    } catch (erroAcao) {
      setErro(mensagemDeErro(erroAcao))
    } finally {
      setOcupado(false)
    }
  }

  async function alternarPreferencia(preferencia: PreferenciaNotificacao) {
    setErro(null)
    try {
      const resposta = await api<{ preferencias: PreferenciaNotificacao[] }>('/api/v1/notificacoes/preferencias', {
        metodo: 'PATCH',
        corpo: { tipo: preferencia.tipo, ativa: !preferencia.ativa },
      })
      setPreferencias(resposta.preferencias)
    } catch (erroPreferencia) {
      setErro(mensagemDeErro(erroPreferencia))
    }
  }

  return (
    <main>
      <article>
        <h1>Notificações</h1>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}

        <div className="acoes-notificacoes">
          <label htmlFor="so-nao-lidas">
            <input
              id="so-nao-lidas"
              type="checkbox"
              checked={apenasNaoLidas}
              onChange={(evento) => setApenasNaoLidas(evento.target.checked)}
            />
            Só não lidas
          </label>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado || naoLidas === 0}
            onClick={() => void executar(() => api('/api/v1/notificacoes/marcar-todas-lidas', { metodo: 'POST' }))}
          >
            Marcar todas como lidas
          </button>
        </div>

        {notificacoes === null ? (
          !erro && <p className="carregando">Carregando notificações…</p>
        ) : notificacoes.length === 0 ? (
          <p className="valor-vazio">
            {apenasNaoLidas ? 'Nenhuma notificação não lida.' : 'Você ainda não tem notificações.'}
          </p>
        ) : (
          <ul className="lista-notificacoes">
            {notificacoes.map((notificacao) => (
              <li
                key={notificacao.notificacaoId}
                className={notificacao.lida ? 'notificacao' : 'notificacao notificacao-nova'}
              >
                <div className="item-loja-topo">
                  <h2>{notificacao.titulo}</h2>
                  {!notificacao.lida && <span className="item-loja-categoria">Nova</span>}
                </div>
                <p className="item-loja-descricao">{notificacao.mensagem}</p>
                <p className="item-loja-estoque">{dataHora(notificacao.criadaEm)}</p>
                {!notificacao.lida && (
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() =>
                      void executar(() =>
                        api(`/api/v1/notificacoes/${notificacao.notificacaoId}/lida`, { metodo: 'PATCH' })
                      )
                    }
                  >
                    Marcar como lida
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <section>
          <h2>O que você quer receber</h2>
          <ul className="lista-preferencias">
            {preferencias.map((preferencia) => (
              <li key={preferencia.tipo}>
                <label htmlFor={`pref-${preferencia.tipo}`}>
                  <input
                    id={`pref-${preferencia.tipo}`}
                    type="checkbox"
                    checked={preferencia.ativa}
                    onChange={() => void alternarPreferencia(preferencia)}
                  />
                  {preferencia.rotulo}
                </label>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  )
}
