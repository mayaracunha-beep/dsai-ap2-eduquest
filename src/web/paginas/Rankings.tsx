import { FormEvent, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import type { Sessao } from '../App'
import {
  METRICAS_RANKING,
  OPCOES_PARTICIPACAO,
  PERIODOS_RANKING,
  montarConsulta,
  ordinal,
  type MetricaRanking,
  type ParticipacaoRanking,
  type PeriodoRanking,
  type PreferenciaRanking,
  type RespostaRanking,
} from '../tiposRanking'

// SPEC/2026-11-19-rankings.md §4 (F7-01–F7-03). O servidor calcula tudo (posição, empate, privacidade);
// a tela só escolhe o recorte e mostra o resultado, sempre declarando a métrica.

interface CursoResumo {
  id: string
  titulo: string
  publicado?: boolean
}

function Privacidade() {
  const [participacao, setParticipacao] = useState<ParticipacaoRanking>('anonimo')
  const [apelido, setApelido] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api<PreferenciaRanking>('/api/v1/rankings/preferencia')
      .then((preferencia) => {
        setParticipacao(preferencia.participacao)
        setApelido(preferencia.apelido ?? '')
      })
      .catch((erroCarga) => setErro(mensagemDeErro(erroCarga)))
  }, [])

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setMensagem(null)
    setSalvando(true)
    try {
      const corpo = participacao === 'apelido' ? { participacao, apelido } : { participacao }
      const salvo = await api<PreferenciaRanking>('/api/v1/rankings/preferencia', { metodo: 'PUT', corpo })
      setApelido(salvo.apelido ?? '')
      setMensagem('Privacidade salva. Vale para as próximas consultas.')
    } catch (erroSalvar) {
      setErro(mensagemDeErro(erroSalvar))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section>
      <h2>Privacidade nos rankings</h2>
      <form onSubmit={salvar} className="form-missao">
        <fieldset>
          <legend>Como você aparece</legend>
          {OPCOES_PARTICIPACAO.map((opcao) => (
            <div key={opcao.valor}>
              <label htmlFor={`participacao-${opcao.valor}`}>
                <input
                  id={`participacao-${opcao.valor}`}
                  type="radio"
                  name="participacao"
                  checked={participacao === opcao.valor}
                  onChange={() => setParticipacao(opcao.valor)}
                />
                {opcao.rotulo} — {opcao.ajuda}
              </label>
            </div>
          ))}
        </fieldset>
        {participacao === 'apelido' && (
          <>
            <label htmlFor="ranking-apelido">Apelido</label>
            <input
              id="ranking-apelido"
              maxLength={30}
              required
              value={apelido}
              onChange={(evento) => setApelido(evento.target.value)}
            />
          </>
        )}
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
        <button type="submit" disabled={salvando} aria-busy={salvando}>
          Salvar privacidade
        </button>
      </form>
    </section>
  )
}

export function PaginaRankings({ sessao }: { sessao: Sessao }) {
  const [metrica, setMetrica] = useState<MetricaRanking>('xp')
  const [periodo, setPeriodo] = useState<PeriodoRanking>('semana')
  const [porCurso, setPorCurso] = useState(false)
  const [cursoId, setCursoId] = useState('')
  const [cursos, setCursos] = useState<CursoResumo[]>([])
  const [ranking, setRanking] = useState<RespostaRanking | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api<CursoResumo[]>('/api/v1/cursos')
      .then((lista) => setCursos(lista.filter((curso) => curso.publicado !== false)))
      .catch(() => setCursos([]))
  }, [])

  const aguardandoCurso = porCurso && cursoId === ''

  useEffect(() => {
    if (aguardandoCurso) {
      setRanking(null)
      return
    }
    let atual = true
    setErro(null)
    api<RespostaRanking>(montarConsulta(metrica, periodo, porCurso ? cursoId : null))
      .then((resposta) => {
        if (atual) setRanking(resposta)
      })
      .catch((erroCarga) => {
        if (atual) setErro(mensagemDeErro(erroCarga))
      })
    return () => {
      atual = false
    }
  }, [metrica, periodo, porCurso, cursoId, aguardandoCurso])

  const periodoRotulo = PERIODOS_RANKING.find((opcao) => opcao.valor === periodo)?.rotulo ?? ''
  const escopoRotulo = ranking?.escopo.tipo === 'curso' ? `Curso: ${ranking.escopo.cursoTitulo}` : 'Todos os cursos'

  return (
    <main>
      <article>
        <h1>Rankings</h1>
        <div className="filtros-ranking">
          <label htmlFor="ranking-metrica">Métrica</label>
          <select
            id="ranking-metrica"
            value={metrica}
            onChange={(evento) => setMetrica(evento.target.value as MetricaRanking)}
          >
            {METRICAS_RANKING.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <label htmlFor="ranking-periodo">Período</label>
          <select
            id="ranking-periodo"
            value={periodo}
            onChange={(evento) => setPeriodo(evento.target.value as PeriodoRanking)}
          >
            {PERIODOS_RANKING.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <label htmlFor="ranking-escopo">Escopo</label>
          <select
            id="ranking-escopo"
            value={porCurso ? 'curso' : 'global'}
            onChange={(evento) => setPorCurso(evento.target.value === 'curso')}
          >
            <option value="global">Todos os cursos</option>
            <option value="curso">Por curso</option>
          </select>
          {porCurso && (
            <>
              <label htmlFor="ranking-curso">Curso</label>
              <select id="ranking-curso" value={cursoId} onChange={(evento) => setCursoId(evento.target.value)}>
                <option value="">Escolha um curso</option>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.titulo}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {aguardandoCurso ? (
          <p className="valor-vazio">Escolha um curso para ver o ranking.</p>
        ) : ranking === null ? (
          !erro && <p className="carregando">Carregando ranking…</p>
        ) : ranking.entradas.length === 0 ? (
          <p className="valor-vazio">Ninguém pontuou neste recorte ainda.</p>
        ) : (
          <>
            <p className="resumo-estrutura">
              Ranking por {ranking.metrica.rotulo} · {periodoRotulo} · {escopoRotulo} ·{' '}
              {ranking.totalParticipantes} participante(s). Empates: quem chegou antes ao valor fica à frente.
            </p>
            <table className="tabela-ranking">
              <caption>
                Ranking por {ranking.metrica.rotulo} ({periodoRotulo})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Posição</th>
                  <th scope="col">Estudante</th>
                  <th scope="col">{ranking.metrica.rotulo}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.entradas.map((entrada) => (
                  <tr key={entrada.posicao} className={entrada.voce ? 'linha-voce' : undefined}>
                    <td>{ordinal(entrada.posicao)}</td>
                    <td>
                      {entrada.nome}
                      {entrada.voce ? ' (você)' : ''}
                    </td>
                    <td>{entrada.valor.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {ranking?.voce && !ranking.entradas.some((entrada) => entrada.voce) && (
          <p className="alerta alerta-sucesso" role="status">
            Sua posição: {ordinal(ranking.voce.posicao)} com {ranking.voce.valor.toLocaleString('pt-BR')}{' '}
            {ranking.metrica.unidade}.
          </p>
        )}

        {sessao.papel === 'estudante' && <Privacidade />}
      </article>
    </main>
  )
}
