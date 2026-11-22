import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import { abrirCursoNoCatalogo, navegarParaVista } from '../navegacao'
import { formatarMoedas } from '../tiposLoja'
import { ROTULO_TIPO, dataHora } from '../tiposMissao'
import { percentualDoNivel, type RespostaPainel } from '../tiposPainel'
import { ordinal } from '../tiposRanking'

// SPEC/2026-11-19-painel-acessibilidade.md §2 e §4 (F10-01) — visão única do estudante.
// Só exibe o que o servidor devolveu; cada seção leva à página do domínio dono do dado.

function Barra({ nome, atual, maximo }: { nome: string; atual: number; maximo: number }) {
  const percentual = maximo > 0 ? Math.min(100, Math.floor((atual * 100) / maximo)) : 0
  return (
    <div
      className="barra-progresso"
      role="progressbar"
      aria-label={nome}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={Math.min(atual, maximo)}
    >
      <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
    </div>
  )
}

export function PaginaPainel() {
  const [painel, setPainel] = useState<RespostaPainel | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api<RespostaPainel>('/api/v1/painel')
      .then(setPainel)
      .catch((erroCarga) => setErro(mensagemDeErro(erroCarga)))
  }, [])

  return (
    <main>
      <article>
        <h1>Painel</h1>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {painel === null ? (
          !erro && <p className="carregando">Carregando painel…</p>
        ) : (
          <div className="grade-painel">
            <section className="cartao-painel" aria-labelledby="painel-nivel">
              <h2 id="painel-nivel">Seu nível</h2>
              <p className="painel-destaque">Nível {painel.xp.nivel}</p>
              <Barra
                nome="Progresso no nível atual"
                atual={painel.xp.xpTotal - painel.xp.xpNivelAtual}
                maximo={painel.xp.xpProximoNivel - painel.xp.xpNivelAtual}
              />
              <p className="item-loja-estoque">
                {painel.xp.xpTotal.toLocaleString('pt-BR')} XP no total · {painel.xp.xpSemana.toLocaleString('pt-BR')} XP
                nesta semana · {percentualDoNivel(painel.xp)}% do caminho para o nível {painel.xp.nivel + 1}
              </p>
            </section>

            <section className="cartao-painel" aria-labelledby="painel-moedas">
              <h2 id="painel-moedas">Moedas</h2>
              <p className="painel-destaque">{formatarMoedas(painel.moedas.saldo)}</p>
              <button type="button" className="botao-secundario" onClick={() => navegarParaVista('loja')}>
                Ir para a loja
              </button>
            </section>

            <section className="cartao-painel" aria-labelledby="painel-missoes">
              <h2 id="painel-missoes">Missões em andamento</h2>
              {painel.missoes.length === 0 ? (
                <p className="valor-vazio">Nenhuma missão em andamento.</p>
              ) : (
                <ul className="lista-painel">
                  {painel.missoes.map((missao) => (
                    <li key={missao.missaoId}>
                      <strong>{missao.titulo}</strong>
                      <span className="item-loja-estoque">
                        {ROTULO_TIPO[missao.tipo]} · até {dataHora(missao.fim)} · {formatarMoedas(missao.recompensaMoedas)}
                      </span>
                      <Barra nome={`Progresso de ${missao.titulo}`} atual={missao.progresso} maximo={missao.meta} />
                      <span className="item-loja-estoque">
                        {missao.progresso} de {missao.meta}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="botao-secundario" onClick={() => navegarParaVista('missoes')}>
                Ver todas as missões
              </button>
            </section>

            <section className="cartao-painel" aria-labelledby="painel-cursos">
              <h2 id="painel-cursos">Continue estudando</h2>
              {painel.cursos.length === 0 ? (
                <p className="valor-vazio">Você ainda não começou nenhum curso.</p>
              ) : (
                <ul className="lista-painel">
                  {painel.cursos.map((curso) => (
                    <li key={curso.cursoId}>
                      <strong>{curso.titulo}</strong>
                      <Barra nome={`Progresso em ${curso.titulo}`} atual={curso.aulasConcluidas} maximo={curso.aulasTotal} />
                      <span className="item-loja-estoque">
                        {curso.aulasConcluidas} de {curso.aulasTotal} aulas ({curso.percentual}%)
                      </span>
                      <button
                        type="button"
                        className="botao-secundario"
                        onClick={() => abrirCursoNoCatalogo(curso.cursoId)}
                      >
                        Continuar {curso.titulo}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cartao-painel" aria-labelledby="painel-conquistas">
              <h2 id="painel-conquistas">Conquistas</h2>
              <p className="painel-destaque">
                {painel.conquistas.desbloqueadas} de {painel.conquistas.total}
              </p>
              {painel.conquistas.recentes.length === 0 ? (
                <p className="valor-vazio">Nenhuma conquista ainda.</p>
              ) : (
                <ul className="lista-painel">
                  {painel.conquistas.recentes.map((conquista) => (
                    <li key={conquista.codigo}>
                      <strong>{conquista.nome}</strong>
                      <span className="item-loja-estoque">{dataHora(conquista.desbloqueadaEm)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cartao-painel" aria-labelledby="painel-ranking">
              <h2 id="painel-ranking">Ranking da semana</h2>
              {painel.ranking.posicao === null || painel.ranking.valor === null ? (
                <p className="valor-vazio">Sem posição nesta semana.</p>
              ) : (
                <p className="painel-destaque">
                  {ordinal(painel.ranking.posicao)}
                  <span className="item-loja-estoque">
                    {' '}
                    com {painel.ranking.valor.toLocaleString('pt-BR')} XP · {painel.ranking.totalParticipantes}{' '}
                    participante(s)
                  </span>
                </p>
              )}
              <button type="button" className="botao-secundario" onClick={() => navegarParaVista('rankings')}>
                Ver rankings
              </button>
            </section>

            <section className="cartao-painel" aria-labelledby="painel-avisos">
              <h2 id="painel-avisos">Avisos</h2>
              <p className="painel-destaque">
                {painel.notificacoes.naoLidas} {painel.notificacoes.naoLidas === 1 ? 'não lida' : 'não lidas'}
              </p>
              {painel.notificacoes.recentes.length > 0 && (
                <ul className="lista-painel">
                  {painel.notificacoes.recentes.map((aviso) => (
                    <li key={aviso.notificacaoId}>
                      <strong>{aviso.titulo}</strong>
                      <span className="item-loja-estoque">{aviso.mensagem}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="botao-secundario" onClick={() => navegarParaVista('notificacoes')}>
                Ver notificações
              </button>
            </section>
          </div>
        )}
      </article>
    </main>
  )
}
