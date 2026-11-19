import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import {
  ROTULO_CATEGORIA,
  descreverEstoque,
  formatarMoedas,
  type ItemDaLoja,
} from '../tiposLoja'

// SPEC/2026-11-19-moedas-loja-inventario.md §6 — loja do estudante (F8-01, F8-02, F8-03).
// O servidor decide tudo (saldo, estoque, posse); a tela só habilita ou não o botão.

interface Moedas {
  saldo: number
}

interface RespostaCompra {
  saldo: number
  item: ItemDaLoja
}

export function PaginaLoja() {
  const [saldo, setSaldo] = useState<number | null>(null)
  const [itens, setItens] = useState<ItemDaLoja[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [comprando, setComprando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [moedas, loja] = await Promise.all([
        api<Moedas>('/api/v1/moedas'),
        api<{ itens: ItemDaLoja[] }>('/api/v1/loja/itens'),
      ])
      setSaldo(moedas.saldo)
      setItens(loja.itens)
    } catch (erroCarga) {
      setErro(mensagemDeErro(erroCarga))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function comprar(item: ItemDaLoja) {
    setErro(null)
    setMensagem(null)
    setComprando(item.itemId)
    try {
      const resposta = await api<RespostaCompra>(`/api/v1/loja/itens/${item.itemId}/comprar`, {
        metodo: 'POST',
      })
      setSaldo(resposta.saldo)
      setItens((atuais) =>
        (atuais ?? []).map((atual) =>
          atual.itemId === item.itemId
            ? { ...atual, possui: true, estoque: resposta.item.estoque }
            : atual
        )
      )
      setMensagem(`Você comprou ${item.nome}. Ele já está no seu inventário.`)
    } catch (erroCompra) {
      setErro(mensagemDeErro(erroCompra))
      // a loja pode ter mudado (estoque, preço): recarrega para refletir o servidor
      void carregar()
    } finally {
      setComprando(null)
    }
  }

  return (
    <main>
      <article>
        <div className="cabecalho-perfil">
          <h1>Loja</h1>
          {saldo !== null && (
            <span className="saldo-moedas" aria-label="Saldo de moedas">
              {formatarMoedas(saldo)}
            </span>
          )}
        </div>
        <p className="resumo-estrutura">Ganhe moedas estudando: cada 5 XP rendem 1 moeda.</p>

        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {mensagem && (
          <p role="status" className="alerta alerta-sucesso">
            {mensagem}
          </p>
        )}

        {itens === null ? (
          !erro && <p className="carregando">Carregando loja…</p>
        ) : itens.length === 0 ? (
          <p className="valor-vazio">Nenhum item à venda no momento.</p>
        ) : (
          <ul className="grade-loja">
            {itens.map((item) => {
              const esgotado = item.estoque === 0
              const semSaldo = saldo !== null && saldo < item.preco
              const indisponivel = item.possui === true || esgotado
              return (
                <li key={item.itemId} className="item-loja">
                  <div className="item-loja-topo">
                    <h2>{item.nome}</h2>
                    <span className="item-loja-categoria">{ROTULO_CATEGORIA[item.categoria]}</span>
                  </div>
                  <p className="item-loja-descricao">{item.descricao}</p>
                  <p className="item-loja-preco">{formatarMoedas(item.preco)}</p>
                  <p className="item-loja-estoque">{descreverEstoque(item.estoque)}</p>
                  {item.possui ? (
                    <p className="item-loja-possui">Você já possui este item</p>
                  ) : (
                    <button
                      type="button"
                      disabled={indisponivel || semSaldo || comprando !== null}
                      aria-busy={comprando === item.itemId}
                      onClick={() => void comprar(item)}
                    >
                      {esgotado ? 'Esgotado' : semSaldo ? 'Saldo insuficiente' : 'Comprar'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </main>
  )
}
