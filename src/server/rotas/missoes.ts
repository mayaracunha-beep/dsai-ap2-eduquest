import { Router } from 'express'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import { ajustarMissao, criarMissao, listarGestao, listarParaEstudante } from '../servicos/missoes'

// SPEC/2026-11-19-missoes.md §5 (rotas de missões — F6-01 a F6-04)
export const rotasMissoes = Router()

// F6-01 — R-MS10: progresso só do próprio estudante
rotasMissoes.get('/missoes', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await listarParaEstudante(req.usuario!.id))
})

// F6-03 (declarada antes das rotas com :id)
rotasMissoes.get(
  '/missoes/gestao',
  exigirSessao,
  exigirPapel('professor', 'administrador'),
  async (req, res) => {
    res.status(200).json(await listarGestao(req.usuario!))
  }
)

// F6-02
rotasMissoes.post('/missoes', exigirSessao, exigirPapel('professor', 'administrador'), async (req, res) => {
  res.status(201).json(await criarMissao(req.usuario!, req.body))
})

// F6-04
rotasMissoes.patch(
  '/missoes/:id',
  exigirSessao,
  exigirPapel('professor', 'administrador'),
  async (req, res) => {
    res.status(200).json(await ajustarMissao(req.usuario!, req.params.id, req.body))
  }
)
