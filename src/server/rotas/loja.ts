import { Router } from 'express'
import { exigirPapel, exigirSessao } from '../middlewares/sessao'
import { prisma } from '../prisma'
import {
  ajustarItem,
  comprarItem,
  definirEquipado,
  lerConfigLoja,
  listarInventario,
  listarLoja,
} from '../servicos/loja'
import { lerMoedas } from '../servicos/moedas'

// SPEC/2026-11-19-moedas-loja-inventario.md §6 (rotas de moedas, loja e inventário — F8-01 a F8-07)
export const rotasLoja = Router()

// F8-01 — R-M7: saldo e extrato só do próprio estudante
rotasLoja.get('/moedas', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await lerMoedas(prisma, req.usuario!.id))
})

// F8-02: loja para qualquer autenticado
rotasLoja.get('/loja/itens', exigirSessao, async (req, res) => {
  res.status(200).json(await listarLoja(req.usuario!))
})

// F8-03
rotasLoja.post('/loja/itens/:id/comprar', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(201).json(await comprarItem(req.usuario!.id, req.params.id))
})

// F8-04
rotasLoja.get('/inventario', exigirSessao, exigirPapel('estudante'), async (req, res) => {
  res.status(200).json(await listarInventario(req.usuario!.id))
})

// F8-05
rotasLoja.put(
  '/inventario/:itemId/equipado',
  exigirSessao,
  exigirPapel('estudante'),
  async (req, res) => {
    res.status(200).json(await definirEquipado(req.usuario!.id, req.params.itemId, req.body))
  }
)

// F8-06/F8-07 — R-M9: somente administrador (401 → 403 → 404 → 400)
rotasLoja.get('/config/loja', exigirSessao, exigirPapel('administrador'), async (_req, res) => {
  res.status(200).json(await lerConfigLoja())
})

rotasLoja.patch(
  '/config/loja/itens/:id',
  exigirSessao,
  exigirPapel('administrador'),
  async (req, res) => {
    res.status(200).json(await ajustarItem(req.params.id, req.body))
  }
)
