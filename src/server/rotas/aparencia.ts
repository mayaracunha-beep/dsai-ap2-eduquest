import { Router } from 'express'
import { exigirSessao } from '../middlewares/sessao'
import { AVATARES, lerAparencia, salvarAparencia } from '../servicos/aparencia'

// SPEC/2026-11-21-nome-avatar-moldura.md §4 (F11-01 a F11-03)
export const rotasAparencia = Router()

// F11-01 — público: o cadastro acontece antes do login (R-AV3)
rotasAparencia.get('/avatares', (_req, res) => {
  res.status(200).json({ avatares: AVATARES })
})

// F11-02 / F11-03 — R-AV5: sempre o próprio usuário, de qualquer papel
rotasAparencia.get('/aparencia', exigirSessao, async (req, res) => {
  res.status(200).json(await lerAparencia(req.usuario!.id))
})

rotasAparencia.put('/aparencia', exigirSessao, async (req, res) => {
  res.status(200).json(await salvarAparencia(req.usuario!.id, req.body))
})
