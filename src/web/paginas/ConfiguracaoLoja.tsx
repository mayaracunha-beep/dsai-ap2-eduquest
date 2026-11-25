import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import { ROTULO_CATEGORIA, type ItemDaLoja } from '../tiposLoja'

// SPEC/2026-11-19-moedas-loja-inventario.md §6 (F8-06, F8-07) — preço, estoque e disponibilidade
// dos itens, só administrador. O servidor valida as faixas (R-M9).

interface Rascunho {
  preco: string
  estoque: string
  ativo: boolean
}

function rascunhoDe(item: ItemDaLoja): Rascunho {
  return {
    preco: String(item.preco),
    estoque: item.estoque === null ? '' : String(item.estoque),
    ativo: item.ativo !== false,
  }
}

// campo de estoque vazio = ilimitado (null)
function corpoDe(rascunho: Rascunho) {
  return {
    preco: rascunho.preco.trim() === '' ? Number.NaN : Number(rascunho.preco),
    estoque: rascunho.estoque.trim() === '' ? null : Number(rascunho.estoque),
    ativo: rascunho.ativo,
  }
}

export function SecaoLoja() {
  const [itens, setItens] = useState<ItemDaLoja[] | null>(null)
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    api<{ itens: ItemDaLoja[] }>('/api/v1/config/loja')
      .then(({ itens: recebidos }) => {
        setItens(recebidos)
        setRascunhos(Object.fromEntries(recebidos.map((item) => [item.itemId, rascunhoDe(item)])))
      })
      .catch((erroCarga) => setErro(mensagemDeErro(erroCarga)))
  }, [])

  function alterar(itemId: string, parcial: Partial<Rascunho>) {
    setRascunhos((atuais) => ({ ...atuais, [itemId]: { ...atuais[itemId], ...parcial } }))
  }

  async function salvar(item: ItemDaLoja) {
    setErro(null)
    setMensagem(null)
    setSalvando(item.itemId)
    try {
      const atualizado = await api<ItemDaLoja>(`/api/v1/config/loja/itens/${item.itemId}`, {
        metodo: 'PATCH',
        corpo: corpoDe(rascunhos[item.itemId]),
      })
      setItens((atuais) => (atuais ?? []).map((atual) => (atual.itemId === item.itemId ? atualizado : atual)))
      alterar(item.itemId, rascunhoDe(atualizado))
      setMensagem(`${item.nome} atualizado. A mudança vale para as próximas compras.`)
    } catch (erroSalvar) {
      setErro(mensagemDeErro(erroSalvar))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <section className="config-loja">
      <h2>Loja — itens</h2>
      <p className="resumo-estrutura">
        Preço de 0 a 10.000; estoque de 0 a 100.000 (vazio = ilimitado). Não altera compras já feitas.
      </p>
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
        !erro && <p className="carregando">Carregando itens…</p>
      ) : (
        <ul className="lista-config-loja">
          {itens.map((item) => {
            const rascunho = rascunhos[item.itemId] ?? rascunhoDe(item)
            return (
              <li key={item.itemId} className="linha-config-loja">
                <strong>{item.nome}</strong>
                <span className="item-loja-categoria">{ROTULO_CATEGORIA[item.categoria]}</span>
                <label htmlFor={`preco-${item.itemId}`}>Preço de {item.nome}</label>
                <input
                  id={`preco-${item.itemId}`}
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={rascunho.preco}
                  onChange={(evento) => alterar(item.itemId, { preco: evento.target.value })}
                />
                <label htmlFor={`estoque-${item.itemId}`}>Estoque de {item.nome}</label>
                <input
                  id={`estoque-${item.itemId}`}
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  placeholder="ilimitado"
                  value={rascunho.estoque}
                  onChange={(evento) => alterar(item.itemId, { estoque: evento.target.value })}
                />
                <label htmlFor={`ativo-${item.itemId}`}>
                  <input
                    id={`ativo-${item.itemId}`}
                    type="checkbox"
                    checked={rascunho.ativo}
                    onChange={(evento) => alterar(item.itemId, { ativo: evento.target.checked })}
                  />
                  À venda
                </label>
                <button
                  type="button"
                  disabled={salvando !== null}
                  aria-busy={salvando === item.itemId}
                  onClick={() => void salvar(item)}
                >
                  Salvar {item.nome}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
