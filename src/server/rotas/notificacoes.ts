import { Router } from 'express'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import {
  alterarPreferencia,
  lerPreferencias,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
} from '../servicos/notificacoes'

// SPEC/2026-11-19-notificacoes.md §5 (rotas de notificações — F9-01 a F9-05); R-NT5: só o estudante, só as próprias
export const rotasNotificacoes = Router()

const soEstudante = [exigirSessao, exigirPapel('estudante')]

rotasNotificacoes.get('/notificacoes', ...soEstudante, async (req, res) => {
  res.status(200).json(await listarNotificacoes(req.usuario!.id, req.query))
})

rotasNotificacoes.post('/notificacoes/marcar-todas-lidas', ...soEstudante, async (req, res) => {
  res.status(200).json(await marcarTodasLidas(req.usuario!.id))
})

rotasNotificacoes.get('/notificacoes/preferencias', ...soEstudante, async (req, res) => {
  res.status(200).json(await lerPreferencias(req.usuario!.id))
})

rotasNotificacoes.patch('/notificacoes/preferencias', ...soEstudante, async (req, res) => {
  res.status(200).json(await alterarPreferencia(req.usuario!.id, req.body))
})

rotasNotificacoes.patch('/notificacoes/:id/lida', ...soEstudante, async (req, res) => {
  res.status(200).json(await marcarLida(req.usuario!.id, req.params.id))
})
