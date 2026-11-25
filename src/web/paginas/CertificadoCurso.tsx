import { useState, type FormEvent } from 'react'
import { api, mensagemDeErro } from '../cliente'

interface Requisito {
  percentual: number
  avaliacao_id: string | null
  nota_minima: string | null
}

interface Certificado {
  codigo: string
  estudante: string
  curso: string
  emitido_em: string
}

interface EstadoCertificado {
  requisito: Requisito | null
  certificado: Certificado | null
}

interface Avaliacao {
  id: string
  titulo: string
  publicado: boolean
}

export function CertificadoCurso({ cursoId, podeConfigurar }: { cursoId: string; podeConfigurar: boolean }) {
  const [estado, setEstado] = useState<EstadoCertificado | null>(null)
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [percentual, setPercentual] = useState('100')
  const [avaliacaoId, setAvaliacaoId] = useState('')
  const [notaMinima, setNotaMinima] = useState('7')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const rota = `/api/v1/cursos/${cursoId}/certificado`

  async function executar(acao: () => Promise<void>) {
    setErro('')
    setMensagem('')
    setOcupado(true)
    try {
      await acao()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  function consultar() {
    return executar(async () => {
      const dados = await api<EstadoCertificado>(rota)
      if (podeConfigurar) {
        const lista = await api<Avaliacao[]>(`/api/v1/cursos/${cursoId}/avaliacoes`)
        setAvaliacoes(lista.filter((avaliacao) => avaliacao.publicado))
      }
      setPercentual(String(dados.requisito?.percentual ?? 100))
      setAvaliacaoId(dados.requisito?.avaliacao_id ?? '')
      setNotaMinima(dados.requisito?.nota_minima ?? '7')
      setEstado(dados)
    })
  }

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void executar(async () => {
      const requisito = await api<Requisito>(rota, {
        metodo: 'PUT',
        corpo: { percentual: Number(percentual), avaliacaoId: avaliacaoId || null,
          notaMinima: avaliacaoId ? Number(notaMinima) : null },
      })
      setEstado({ requisito, certificado: null })
      setMensagem('Requisitos salvos.')
    })
  }

  function emitir() {
    return executar(async () => {
      const certificado = await api<Certificado>(rota, { metodo: 'POST' })
      setEstado((atual) => ({ requisito: atual?.requisito ?? null, certificado }))
    })
  }

  const certificado = estado?.certificado
  return (
    <section className="bloco-progresso" aria-label="Certificado de conclusão">
      <h2>Certificado de conclusão</h2>
      {!estado && <button type="button" className="botao-secundario" disabled={ocupado} onClick={consultar}>
        {podeConfigurar ? 'Configurar certificado' : 'Consultar certificado'}
      </button>}
      {ocupado && <p role="status">Carregando…</p>}
      {erro && <p role="alert" className="erro">{erro}</p>}
      {mensagem && <p role="status">{mensagem}</p>}
      {estado && podeConfigurar && (
        <form onSubmit={salvar}>
          <label>Percentual mínimo de aulas
            <input type="number" min="1" max="100" required value={percentual} onChange={(e) => setPercentual(e.target.value)} />
          </label>
          <label>Avaliação exigida
            <select value={avaliacaoId} onChange={(e) => setAvaliacaoId(e.target.value)}>
              <option value="">Nenhuma</option>
              {avaliacoes.map((avaliacao) => <option key={avaliacao.id} value={avaliacao.id}>{avaliacao.titulo}</option>)}
            </select>
          </label>
          {avaliacaoId && <label>Nota mínima
            <input type="number" min="0" max="10" step="0.01" required value={notaMinima} onChange={(e) => setNotaMinima(e.target.value)} />
          </label>}
          <button type="submit" disabled={ocupado}>Salvar requisitos</button>
        </form>
      )}
      {estado && !podeConfigurar && !certificado && (
        estado.requisito ? <>
          <p>Conclua pelo menos {estado.requisito.percentual}% das aulas.
            {estado.requisito.nota_minima !== null && ` Obtenha nota ${estado.requisito.nota_minima} ou superior na avaliação exigida.`}
          </p>
          <button type="button" disabled={ocupado} onClick={emitir}>Emitir certificado</button>
        </> : <p>Este curso ainda não oferece certificado.</p>
      )}
      {certificado && <>
        <article className="certificado-eduquest" aria-label="Certificado emitido">
          <p className="certificado-marca">EduQuest</p>
          <div className="certificado-selo" aria-hidden="true">★</div>
          <h3>Certificado de conclusão</h3>
          <p className="certificado-nome">{certificado.estudante}</p>
          <p>Concluiu o curso</p>
          <p className="certificado-curso">{certificado.curso}</p>
          <p>Emitido em {new Date(certificado.emitido_em).toLocaleDateString('pt-BR')}</p>
          <p>Código de verificação <a href={`/api/v1/certificados/${certificado.codigo}`}>{certificado.codigo}</a></p>
        </article>
        <button type="button" onClick={() => window.print()}>Imprimir certificado</button>
      </>}
    </section>
  )
}
