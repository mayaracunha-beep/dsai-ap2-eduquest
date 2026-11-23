import { useState } from 'react'
import { api, mensagemDeErro } from '../cliente'

interface ProgressoEstudante {
  estudanteId: string
  nome: string
  aulasConcluidas: number
  aulasTotal: number
  percentual: number
}

export function RelatorioProgresso({ cursoId }: { cursoId: string }) {
  const [estudantes, setEstudantes] = useState<ProgressoEstudante[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function consultar() {
    setCarregando(true)
    setErro(null)
    setEstudantes(null)
    try {
      setEstudantes(await api<ProgressoEstudante[]>(`/api/v1/cursos/${cursoId}/relatorio-progresso`))
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="bloco-progresso" aria-label="Relatório de progresso">
      <h2>Relatório de progresso</h2>
      <button type="button" className="botao-secundario" onClick={consultar} disabled={carregando}>
        {estudantes === null ? 'Consultar relatório' : 'Atualizar relatório'}
      </button>
      {carregando && <p role="status">Carregando relatório…</p>}
      {erro && <p role="alert" className="erro">{erro}</p>}
      {estudantes?.length === 0 && <p>Nenhum estudante concluiu uma aula publicada neste curso.</p>}
      {estudantes && estudantes.length > 0 && (
        <table aria-label="Progresso dos estudantes">
          <thead>
            <tr>
              <th scope="col">Estudante</th>
              <th scope="col">Aulas concluídas</th>
              <th scope="col">Aulas publicadas</th>
              <th scope="col">Percentual</th>
            </tr>
          </thead>
          <tbody>
            {estudantes.map((estudante) => (
              <tr key={estudante.estudanteId}>
                <th scope="row">{estudante.nome}</th>
                <td>{estudante.aulasConcluidas}</td>
                <td>{estudante.aulasTotal}</td>
                <td>{estudante.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
