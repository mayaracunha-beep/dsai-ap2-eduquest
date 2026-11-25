import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import type { Sessao } from '../App'
import {
  ROTULO_STATUS,
  ROTULO_TIPO,
  TIPOS_MISSAO,
  dataHora,
  descreverEscopo,
  paraCampoDataHora,
  type MissaoDeGestao,
  type TipoMissao,
} from '../tiposMissao'
import { formatarMoedas } from '../tiposLoja'

// SPEC/2026-11-19-missoes.md §5 (F6-02–F6-04) — professor e administrador criam e ajustam missões.
// O servidor valida tudo (faixas, autoria do curso, janela); a tela só envia e mostra o resultado.

interface CursoResumo {
  id: string
  titulo: string
  donoId?: string
}

interface Formulario {
  titulo: string
  descricao: string
  tipo: TipoMissao
  meta: string
  inicio: string
  fim: string
  recompensa: string
  cursoId: string
}

function formularioInicial(): Formulario {
  const agora = new Date()
  return {
    titulo: '',
    descricao: '',
    tipo: 'aulas_concluidas',
    meta: '1',
    inicio: paraCampoDataHora(agora),
    fim: paraCampoDataHora(new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)),
    recompensa: '10',
    cursoId: '',
  }
}

function numero(valor: string): number {
  return valor.trim() === '' ? Number.NaN : Number(valor)
}

function corpoDe(form: Formulario) {
  return {
    titulo: form.titulo,
    descricao: form.descricao,
    tipo: form.tipo,
    meta: numero(form.meta),
    inicio: new Date(form.inicio).toISOString(),
    fim: new Date(form.fim).toISOString(),
    recompensaMoedas: numero(form.recompensa),
    ...(form.cursoId ? { cursoId: form.cursoId } : {}),
  }
}

export function PaginaGestaoMissoes({ sessao }: { sessao: Sessao }) {
  const administrador = sessao.papel === 'administrador'
  const [missoes, setMissoes] = useState<MissaoDeGestao[] | null>(null)
  const [cursos, setCursos] = useState<CursoResumo[]>([])
  const [form, setForm] = useState<Formulario>(formularioInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [lista, todosCursos] = await Promise.all([
        api<{ missoes: MissaoDeGestao[] }>('/api/v1/missoes/gestao'),
        api<CursoResumo[]>('/api/v1/cursos'),
      ])
      setMissoes(lista.missoes)
      // professor só cria de curso próprio (R-MS6); administrador, de qualquer um
      setCursos(administrador ? todosCursos : todosCursos.filter((curso) => curso.donoId === sessao.usuarioId))
    } catch (erroCarga) {
      setErro(mensagemDeErro(erroCarga))
    }
  }, [administrador, sessao.usuarioId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function alterar(parcial: Partial<Formulario>) {
    setForm((atual) => ({ ...atual, ...parcial }))
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setMensagem(null)
    setOcupado(true)
    try {
      await api('/api/v1/missoes', { metodo: 'POST', corpo: corpoDe(form) })
      setMensagem('Missão criada.')
      setForm(formularioInicial())
      await carregar()
    } catch (erroCriar) {
      setErro(mensagemDeErro(erroCriar))
    } finally {
      setOcupado(false)
    }
  }

  async function alternarAtiva(missao: MissaoDeGestao) {
    setErro(null)
    setMensagem(null)
    setOcupado(true)
    try {
      await api(`/api/v1/missoes/${missao.missaoId}`, { metodo: 'PATCH', corpo: { ativa: !missao.ativa } })
      await carregar()
    } catch (erroAjuste) {
      setErro(mensagemDeErro(erroAjuste))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main>
      <article>
        <h1>Gestão de missões</h1>
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

        <section>
          <h2>Nova missão</h2>
          <form onSubmit={criar} className="form-missao">
            <label htmlFor="missao-titulo">Título</label>
            <input
              id="missao-titulo"
              required
              maxLength={80}
              value={form.titulo}
              onChange={(evento) => alterar({ titulo: evento.target.value })}
            />
            <label htmlFor="missao-descricao">Descrição</label>
            <textarea
              id="missao-descricao"
              maxLength={300}
              value={form.descricao}
              onChange={(evento) => alterar({ descricao: evento.target.value })}
            />
            <label htmlFor="missao-tipo">Tipo</label>
            <select
              id="missao-tipo"
              value={form.tipo}
              onChange={(evento) => alterar({ tipo: evento.target.value as TipoMissao })}
            >
              {TIPOS_MISSAO.map(({ valor, rotulo }) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
            <label htmlFor="missao-meta">Meta</label>
            <input
              id="missao-meta"
              type="number"
              min={1}
              max={10000}
              step={1}
              required
              value={form.meta}
              onChange={(evento) => alterar({ meta: evento.target.value })}
            />
            <label htmlFor="missao-curso">Curso</label>
            <select
              id="missao-curso"
              required={!administrador}
              value={form.cursoId}
              onChange={(evento) => alterar({ cursoId: evento.target.value })}
            >
              {administrador ? (
                <option value="">Todos os cursos</option>
              ) : (
                <option value="">Escolha um curso</option>
              )}
              {cursos.map((curso) => (
                <option key={curso.id} value={curso.id}>
                  {curso.titulo}
                </option>
              ))}
            </select>
            <label htmlFor="missao-inicio">Início</label>
            <input
              id="missao-inicio"
              type="datetime-local"
              required
              value={form.inicio}
              onChange={(evento) => alterar({ inicio: evento.target.value })}
            />
            <label htmlFor="missao-fim">Fim</label>
            <input
              id="missao-fim"
              type="datetime-local"
              required
              value={form.fim}
              onChange={(evento) => alterar({ fim: evento.target.value })}
            />
            <label htmlFor="missao-recompensa">Recompensa (moedas)</label>
            <input
              id="missao-recompensa"
              type="number"
              min={0}
              max={1000}
              step={1}
              required
              value={form.recompensa}
              onChange={(evento) => alterar({ recompensa: evento.target.value })}
            />
            <button type="submit" disabled={ocupado} aria-busy={ocupado}>
              Criar missão
            </button>
          </form>
        </section>

        <section>
          <h2>Missões</h2>
          {missoes === null ? (
            !erro && <p className="carregando">Carregando missões…</p>
          ) : missoes.length === 0 ? (
            <p className="valor-vazio">Nenhuma missão criada ainda.</p>
          ) : (
            <ul className="lista-config-loja">
              {missoes.map((missao) => (
                <li key={missao.missaoId} className="linha-config-loja">
                  <strong>{missao.titulo}</strong>
                  <span className="item-loja-categoria">
                    {missao.ativa ? ROTULO_STATUS[missao.status] : 'Desativada'}
                  </span>
                  <span className="item-loja-estoque">
                    {ROTULO_TIPO[missao.tipo]}: meta {missao.meta} · {descreverEscopo(missao.escopo)}
                  </span>
                  <span className="item-loja-estoque">
                    {dataHora(missao.inicio)} a {dataHora(missao.fim)} · {formatarMoedas(missao.recompensaMoedas)} ·{' '}
                    {missao.cumpriram} cumpriram
                  </span>
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() => void alternarAtiva(missao)}
                  >
                    {missao.ativa ? `Desativar ${missao.titulo}` : `Ativar ${missao.titulo}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  )
}
