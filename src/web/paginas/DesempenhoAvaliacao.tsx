import { useState } from 'react'
import { api, mensagemDeErro } from '../cliente'

interface DesempenhoQuestao {
  questaoId: string
  enunciado: string
  corrigidas: number
  acertos: number
  percentual: number
}

export function DesempenhoAvaliacao({ avaliacaoId }: { avaliacaoId: string }) {
  const [questoes, setQuestoes] = useState<DesempenhoQuestao[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function consultar() {
    setCarregando(true)
    setErro('')
    try {
      setQuestoes(await api<DesempenhoQuestao[]>(`/api/v1/avaliacoes/${avaliacaoId}/desempenho`))
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <section className="bloco-progresso" aria-label="Desempenho por questão" aria-busy={carregando}>
      <h2>Desempenho por questão</h2>
      <button type="button" onClick={consultar} disabled={carregando}>
        {questoes === null ? 'Consultar desempenho' : 'Atualizar desempenho'}
      </button>
      {erro && <p role="alert" className="erro">{erro}</p>}
      {questoes?.length === 0 && <p>Nenhuma questão nesta avaliação.</p>}
      {questoes && questoes.length > 0 && (
        <table aria-label="Métricas por questão">
          <thead>
            <tr>
              <th scope="col">Questão</th>
              <th scope="col">Respostas corrigidas</th>
              <th scope="col">Acertos</th>
              <th scope="col">Percentual de acertos</th>
            </tr>
          </thead>
          <tbody>
            {questoes.map((questao) => (
              <tr key={questao.questaoId}>
                <th scope="row">{questao.enunciado}</th>
                <td>{questao.corrigidas}</td>
                <td>{questao.acertos}</td>
                <td>{questao.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
