import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import {
  ROTULO_CATEGORIA_PLURAL,
  type CategoriaItem,
  type ItemDoInventario,
} from '../tiposLoja'

// SPEC/2026-11-19-moedas-loja-inventario.md §6 — inventário do estudante (F8-04, F8-05)

const CATEGORIAS: CategoriaItem[] = ['moldura', 'titulo']

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function PaginaInventario({ aoIrParaLoja }: { aoIrParaLoja: () => void }) {
  const [itens, setItens] = useState<ItemDoInventario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setItens((await api<{ itens: ItemDoInventario[] }>('/api/v1/inventario')).itens)
    } catch (erroCarga) {
      setErro(mensagemDeErro(erroCarga))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function alternar(item: ItemDoInventario) {
    setErro(null)
    setAlterando(item.itemId)
    try {
      await api(`/api/v1/inventario/${item.itemId}/equipado`, {
        metodo: 'PUT',
        corpo: { equipado: !item.equipado },
      })
      // R-M6: equipar substitui o da mesma categoria; recarrega o estado verdadeiro do servidor
      await carregar()
    } catch (erroAlterar) {
      setErro(mensagemDeErro(erroAlterar))
    } finally {
      setAlterando(null)
    }
  }

  return (
    <main>
      <article>
        <h1>Inventário</h1>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {itens === null ? (
          !erro && <p className="carregando">Carregando inventário…</p>
        ) : itens.length === 0 ? (
          <div>
            <p className="valor-vazio">Inventário vazio.</p>
            <button type="button" className="botao-secundario" onClick={aoIrParaLoja}>
              Ir para a loja
            </button>
          </div>
        ) : (
          CATEGORIAS.map((categoria) => {
            const daCategoria = itens.filter((item) => item.categoria === categoria)
            if (daCategoria.length === 0) return null
            return (
              <section key={categoria}>
                <h2>{ROTULO_CATEGORIA_PLURAL[categoria]}</h2>
                <ul className="grade-loja">
                  {daCategoria.map((item) => (
                    <li
                      key={item.itemId}
                      className={item.equipado ? 'item-loja item-equipado' : 'item-loja'}
                    >
                      <div className="item-loja-topo">
                        <h3>{item.nome}</h3>
                        {item.equipado && <span className="item-loja-categoria">Equipado</span>}
                      </div>
                      <p className="item-loja-estoque">Adquirido em {dataCurta(item.adquiridoEm)}</p>
                      <button
                        type="button"
                        aria-pressed={item.equipado}
                        disabled={alterando !== null}
                        aria-busy={alterando === item.itemId}
                        onClick={() => void alternar(item)}
                      >
                        {item.equipado ? 'Desequipar' : 'Equipar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </article>
    </main>
  )
}
