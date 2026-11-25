import { Router } from 'express'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import { consultarRanking, lerPreferencia, salvarPreferencia } from '../servicos/rankings'

// SPEC/2026-11-19-rankings.md §4 (rotas de rankings — F7-01 a F7-03)
export const rotasRankings = Router()

// F7-01 — qualquer autenticado (R-RK10)
rotasRankings.get('/rankings', exigirSessao, async (req, res) => {
  res.status(200).json(await consultarRanking(req.usuario!, req.query))
})

// F7-02 / F7-03 — a preferência é só do estudante, sobre si mesmo
rotasRankings.get('/rankings/preferencia', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await lerPreferencia(req.usuario!.id))
})

rotasRankings.put('/rankings/preferencia', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await salvarPreferencia(req.usuario!.id, req.body))
})
