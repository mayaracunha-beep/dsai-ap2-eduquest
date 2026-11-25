import { Router } from 'express'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import { montarPainel } from '../servicos/painel'

// SPEC/2026-11-19-painel-acessibilidade.md §4 (F10-01) — R-PN1: só o próprio estudante
export const rotasPainel = Router()

rotasPainel.get('/painel', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await montarPainel(req.usuario!.id))
})
