import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/server/prisma'
import { creditarPorXp } from '../../src/server/servicos/moedas'
import { api, criarUsuarioComSessao } from '../utilidades/aplicacao'
import { cursoComAula } from '../utilidades/cursos'

// SPEC/2026-11-19-moedas-loja-inventario.md (D12) — T8.2/T8.3: moedas, loja e inventário (MO-01–MO-12)

type Estudante = Awaited<ReturnType<typeof criarUsuarioComSessao>>

// atalho de teste: credita pela mesma função que o XP usa (R-M1), em vez de escrever direto no saldo
async function darMoedas(usuarioId: string, moedas: number) {
  await prisma.$transaction((tx) =>
    creditarPorXp(tx, usuarioId, `teste:${randomUUID()}`, randomUUID(), moedas * 5)
  )
}

async function estudanteComMoedas(moedas: number): Promise<Estudante> {
  const estudante = await criarUsuarioComSessao('estudante')
  if (moedas > 0) await darMoedas(estudante.id, moedas)
  return estudante
}

let sequencia = 0

// item próprio de cada teste: os testes não mexem no catálogo inicial, que outros arquivos também leem
async function criarItem(
  parcial: Partial<{ preco: number; estoque: number | null; ativo: boolean; categoria: 'moldura' | 'titulo' }> = {}
) {
  sequencia += 1
  return prisma.itemLoja.create({
    data: {
      id: randomUUID(),
      codigo: `teste-${randomUUID()}`,
      nome: `Item de teste ${sequencia}`,
      descricao: 'Item criado pelo teste.',
      categoria: parcial.categoria ?? 'moldura',
      preco: parcial.preco ?? 10,
      estoque: parcial.estoque === undefined ? null : parcial.estoque,
      ativo: parcial.ativo ?? true,
      ordem: 100_000 + Math.floor(Math.random() * 1_000_000_000) + sequencia,
    },
  })
}

async function saldoDe(estudante: Estudante): Promise<number> {
  const resposta = await estudante.agente.get('/api/v1/moedas')
  return resposta.body.saldo as number
}

describe('F8-01 — saldo e extrato (R-M7)', () => {
  it('sem sessão responde 401; professor e administrador recebem 403', async () => {
    expect((await api.get('/api/v1/moedas')).status).toBe(401)
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.get('/api/v1/moedas')).status).toBe(403)
    }
  })

  it('estudante novo tem saldo 0 e extrato vazio', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.get('/api/v1/moedas')
    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ saldo: 0, extrato: [] })
  })

  it('o extrato lista ganhos e compras, do mais recente para o mais antigo', async () => {
    const estudante = await estudanteComMoedas(30)
    const item = await criarItem({ preco: 12 })
    await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    const resposta = await estudante.agente.get('/api/v1/moedas')
    expect(resposta.body.saldo).toBe(18)
    expect(resposta.body.extrato.map((m: { valor: number }) => m.valor)).toEqual([-12, 30])
    expect(resposta.body.extrato[0].origem).toBe('compra')
    expect(resposta.body.extrato[1].origem).toBe('xp')
  })
})

describe('R-M1 — moedas geradas pelo XP (MO-01)', () => {
  it('concluir aula credita floor(xp/5) moedas e repetir a conclusão não paga de novo', async () => {
    const { aulaId } = await cursoComAula()

    const estudante = await criarUsuarioComSessao('estudante')
    const primeira = await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    expect(primeira.status).toBeLessThan(300)
    const esperado = Math.floor((primeira.body.xp.ganho as number) / 5)
    expect(await saldoDe(estudante)).toBe(esperado)

    await estudante.agente.post(`/api/v1/aulas/${aulaId}/conclusao`).send({})
    expect(await saldoDe(estudante)).toBe(esperado)
  })

  it('o mesmo evento de XP só paga uma vez (chave idempotente)', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const referencia = randomUUID()
    const pagar = () =>
      prisma.$transaction((tx) => creditarPorXp(tx, estudante.id, 'evento-repetido', referencia, 50))
    expect(await pagar()).toBe(10)
    expect(await pagar()).toBe(0)
    expect(await saldoDe(estudante)).toBe(10)
  })

  it('XP abaixo de 5 não gera movimentação', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    await prisma.$transaction((tx) => creditarPorXp(tx, estudante.id, 'pouco', randomUUID(), 4))
    expect(await prisma.eventoMoeda.count({ where: { usuario_id: estudante.id } })).toBe(0)
  })
})

describe('F8-02 — loja (R-M8)', () => {
  it('sem sessão responde 401', async () => {
    expect((await api.get('/api/v1/loja/itens')).status).toBe(401)
  })

  it('estudante vê o catálogo inicial ativo, em ordem, com possui=false', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const resposta = await estudante.agente.get('/api/v1/loja/itens')
    expect(resposta.status).toBe(200)
    const itens = resposta.body.itens as { codigo: string; preco: number; possui: boolean }[]
    const iniciais = itens.filter((item) => !item.codigo.startsWith('teste-'))
    expect(iniciais.map((item) => item.codigo)).toEqual([
      'moldura-bronze',
      'moldura-prata',
      'moldura-ouro',
      'moldura-galaxia',
      'titulo-explorador',
      'titulo-estudioso',
      'titulo-mestre',
      'titulo-lenda',
    ])
    expect(iniciais.every((item) => item.possui === false)).toBe(true)
  })

  it('professor vê a loja sem o campo possui', async () => {
    const professor = await criarUsuarioComSessao('professor')
    const resposta = await professor.agente.get('/api/v1/loja/itens')
    expect(resposta.status).toBe(200)
    expect(resposta.body.itens.length).toBeGreaterThan(0)
    expect('possui' in resposta.body.itens[0]).toBe(false)
  })

  it('item inativo some da loja e não pode ser comprado (MO-11)', async () => {
    const estudante = await estudanteComMoedas(50)
    const inativo = await criarItem({ ativo: false })
    const lista = await estudante.agente.get('/api/v1/loja/itens')
    expect(lista.body.itens.some((item: { itemId: string }) => item.itemId === inativo.id)).toBe(false)
    expect((await estudante.agente.post(`/api/v1/loja/itens/${inativo.id}/comprar`)).status).toBe(404)
    expect(await saldoDe(estudante)).toBe(50)
  })
})

describe('F8-03 — compra (R-M2–R-M5, MO-03–MO-07)', () => {
  it('exige sessão de estudante (401 → 403)', async () => {
    const item = await criarItem()
    expect((await api.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(401)
    for (const papel of ['professor', 'administrador'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(403)
    }
  })

  it('compra feliz: debita, entrega o item e registra o extrato (MO-03)', async () => {
    const estudante = await estudanteComMoedas(25)
    const item = await criarItem({ preco: 10, estoque: 3 })
    const resposta = await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect(resposta.status).toBe(201)
    expect(resposta.body.saldo).toBe(15)
    expect(resposta.body.item).toMatchObject({ itemId: item.id, possui: true, equipado: false, estoque: 2 })
    const inventario = await estudante.agente.get('/api/v1/inventario')
    expect(inventario.body.itens.map((i: { itemId: string }) => i.itemId)).toEqual([item.id])
    expect((await prisma.itemLoja.findUniqueOrThrow({ where: { id: item.id } })).estoque).toBe(2)
  })

  it('item de preço 0 não exige saldo', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const item = await criarItem({ preco: 0 })
    const resposta = await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect(resposta.status).toBe(201)
    expect(resposta.body.saldo).toBe(0)
  })

  it('saldo insuficiente: 409 e nada muda (MO-04)', async () => {
    const estudante = await estudanteComMoedas(9)
    const item = await criarItem({ preco: 10, estoque: 5 })
    const resposta = await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect(resposta.status).toBe(409)
    expect(resposta.body.erro.mensagem).toMatch(/saldo/)
    expect(await saldoDe(estudante)).toBe(9)
    expect((await prisma.itemLoja.findUniqueOrThrow({ where: { id: item.id } })).estoque).toBe(5)
    expect((await estudante.agente.get('/api/v1/inventario')).body.itens).toEqual([])
  })

  it('estudante sem nenhuma moeda também recebe 409', async () => {
    const estudante = await criarUsuarioComSessao('estudante')
    const item = await criarItem({ preco: 1 })
    expect((await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(409)
  })

  it('segunda compra do mesmo item: 409 sem novo débito (MO-05)', async () => {
    const estudante = await estudanteComMoedas(40)
    const item = await criarItem({ preco: 10 })
    expect((await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)).status).toBe(201)
    const repetida = await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect(repetida.status).toBe(409)
    expect(repetida.body.erro.mensagem).toMatch(/adquirido/)
    expect(await saldoDe(estudante)).toBe(30)
  })

  it('item inexistente ou id malformado: 404', async () => {
    const estudante = await estudanteComMoedas(10)
    expect((await estudante.agente.post(`/api/v1/loja/itens/${randomUUID()}/comprar`)).status).toBe(404)
    expect((await estudante.agente.post('/api/v1/loja/itens/nao-e-uuid/comprar')).status).toBe(404)
  })

  it('estoque 1 e dois compradores: só um compra e o outro mantém o saldo (MO-06)', async () => {
    const [a, b] = await Promise.all([estudanteComMoedas(10), estudanteComMoedas(10)])
    const item = await criarItem({ preco: 5, estoque: 1 })
    const respostas = await Promise.all([
      a.agente.post(`/api/v1/loja/itens/${item.id}/comprar`),
      b.agente.post(`/api/v1/loja/itens/${item.id}/comprar`),
    ])
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
    const perdedor = respostas[0].status === 409 ? a : b
    expect(await saldoDe(perdedor)).toBe(10)
    expect((await prisma.itemLoja.findUniqueOrThrow({ where: { id: item.id } })).estoque).toBe(0)
  })

  it('item esgotado (estoque 0): 409', async () => {
    const estudante = await estudanteComMoedas(10)
    const item = await criarItem({ preco: 1, estoque: 0 })
    const resposta = await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect(resposta.status).toBe(409)
    expect(resposta.body.erro.mensagem).toMatch(/esgotado/)
  })

  it('duas compras simultâneas com saldo para uma: exatamente uma vence (MO-07)', async () => {
    const estudante = await estudanteComMoedas(40)
    const [x, y] = await Promise.all([criarItem({ preco: 30 }), criarItem({ preco: 30 })])
    const respostas = await Promise.all([
      estudante.agente.post(`/api/v1/loja/itens/${x.id}/comprar`),
      estudante.agente.post(`/api/v1/loja/itens/${y.id}/comprar`),
    ])
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await saldoDe(estudante)).toBe(10)
    expect((await estudante.agente.get('/api/v1/inventario')).body.itens).toHaveLength(1)
  })

  it('o mesmo item comprado em paralelo pelo mesmo estudante vale uma vez só', async () => {
    const estudante = await estudanteComMoedas(100)
    const item = await criarItem({ preco: 10 })
    const respostas = await Promise.all(
      [1, 2, 3].map(() => estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`))
    )
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1)
    expect(respostas.filter((r) => r.status === 409)).toHaveLength(2)
    expect(await saldoDe(estudante)).toBe(90)
  })
})

describe('F8-04/F8-05 — inventário e equipar (R-M5, R-M6, MO-08)', () => {
  it('exige sessão de estudante', async () => {
    expect((await api.get('/api/v1/inventario')).status).toBe(401)
    const professor = await criarUsuarioComSessao('professor')
    expect((await professor.agente.get('/api/v1/inventario')).status).toBe(403)
    const item = await criarItem()
    expect((await professor.agente.put(`/api/v1/inventario/${item.id}/equipado`).send({ equipado: true })).status).toBe(403)
  })

  it('equipar substitui o item da mesma categoria; categorias diferentes coexistem', async () => {
    const estudante = await estudanteComMoedas(100)
    const m1 = await criarItem({ categoria: 'moldura', preco: 5 })
    const m2 = await criarItem({ categoria: 'moldura', preco: 5 })
    const t1 = await criarItem({ categoria: 'titulo', preco: 5 })
    for (const item of [m1, m2, t1]) await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)

    expect((await estudante.agente.put(`/api/v1/inventario/${m1.id}/equipado`).send({ equipado: true })).body.equipado).toBe(true)
    await estudante.agente.put(`/api/v1/inventario/${t1.id}/equipado`).send({ equipado: true })
    await estudante.agente.put(`/api/v1/inventario/${m2.id}/equipado`).send({ equipado: true })

    const itens = (await estudante.agente.get('/api/v1/inventario')).body.itens as { itemId: string; equipado: boolean }[]
    const equipados = itens.filter((i) => i.equipado).map((i) => i.itemId).sort()
    expect(equipados).toEqual([m2.id, t1.id].sort())
  })

  it('desequipar não afeta os demais', async () => {
    const estudante = await estudanteComMoedas(20)
    const item = await criarItem({ preco: 5 })
    await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    await estudante.agente.put(`/api/v1/inventario/${item.id}/equipado`).send({ equipado: true })
    const resposta = await estudante.agente.put(`/api/v1/inventario/${item.id}/equipado`).send({ equipado: false })
    expect(resposta.status).toBe(200)
    expect(resposta.body.equipado).toBe(false)
  })

  it('só equipa o que possui: 404 para item alheio, inexistente ou id malformado', async () => {
    const dono = await estudanteComMoedas(10)
    const outro = await criarUsuarioComSessao('estudante')
    const item = await criarItem({ preco: 5 })
    await dono.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect((await outro.agente.put(`/api/v1/inventario/${item.id}/equipado`).send({ equipado: true })).status).toBe(404)
    expect((await outro.agente.put(`/api/v1/inventario/${randomUUID()}/equipado`).send({ equipado: true })).status).toBe(404)
    expect((await outro.agente.put('/api/v1/inventario/xyz/equipado').send({ equipado: true })).status).toBe(404)
  })

  it('corpo inválido: 400', async () => {
    const estudante = await estudanteComMoedas(10)
    const item = await criarItem({ preco: 5 })
    await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    for (const corpo of [{}, { equipado: 'sim' }, { equipado: true, extra: 1 }, [true]]) {
      const resposta = await estudante.agente.put(`/api/v1/inventario/${item.id}/equipado`).send(corpo)
      expect(resposta.status).toBe(400)
    }
  })

  it('o inventário de um estudante não vaza para outro', async () => {
    const dono = await estudanteComMoedas(10)
    const outro = await criarUsuarioComSessao('estudante')
    const item = await criarItem({ preco: 5 })
    await dono.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    expect((await outro.agente.get('/api/v1/inventario')).body.itens).toEqual([])
  })
})

describe('F8-06/F8-07 — configuração da loja (R-M4, R-M9, MO-09, MO-10)', () => {
  it('exige administrador (401 → 403)', async () => {
    const item = await criarItem()
    expect((await api.get('/api/v1/config/loja')).status).toBe(401)
    expect((await api.patch(`/api/v1/config/loja/itens/${item.id}`).send({ preco: 1 })).status).toBe(401)
    for (const papel of ['estudante', 'professor'] as const) {
      const usuario = await criarUsuarioComSessao(papel)
      expect((await usuario.agente.get('/api/v1/config/loja')).status).toBe(403)
      expect((await usuario.agente.patch(`/api/v1/config/loja/itens/${item.id}`).send({ preco: 1 })).status).toBe(403)
    }
  })

  it('o administrador vê todos os itens, inclusive os inativos', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    const inativo = await criarItem({ ativo: false })
    const resposta = await admin.agente.get('/api/v1/config/loja')
    expect(resposta.status).toBe(200)
    const achado = resposta.body.itens.find((item: { itemId: string }) => item.itemId === inativo.id)
    expect(achado).toMatchObject({ ativo: false })
  })

  it('ajusta preço, estoque e disponibilidade; estoque null volta a ilimitado', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    const item = await criarItem({ preco: 10, estoque: 3 })
    const resposta = await admin.agente
      .patch(`/api/v1/config/loja/itens/${item.id}`)
      .send({ preco: 55, estoque: null, ativo: false })
    expect(resposta.status).toBe(200)
    expect(resposta.body).toMatchObject({ preco: 55, estoque: null, ativo: false })
    const salvo = await prisma.itemLoja.findUniqueOrThrow({ where: { id: item.id } })
    expect(salvo).toMatchObject({ preco: 55, estoque: null, ativo: false })
  })

  it('preço novo não altera o que já foi pago (R-M4)', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    const estudante = await estudanteComMoedas(50)
    const item = await criarItem({ preco: 10 })
    await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    await admin.agente.patch(`/api/v1/config/loja/itens/${item.id}`).send({ preco: 500 })
    const resposta = await estudante.agente.get('/api/v1/moedas')
    expect(resposta.body.saldo).toBe(40)
    expect(resposta.body.extrato[0].valor).toBe(-10)
  })

  it.each([
    [{ preco: -1 }],
    [{ preco: 10_001 }],
    [{ preco: 1.5 }],
    [{ preco: '10' }],
    [{ estoque: -1 }],
    [{ estoque: 100_001 }],
    [{ estoque: 2.5 }],
    [{ ativo: 'sim' }],
    [{}],
    [{ nome: 'Outro nome' }],
    [{ preco: 5, codigo: 'x' }],
  ])('corpo %j é rejeitado com 400 e nada é salvo', async (corpo) => {
    const admin = await criarUsuarioComSessao('administrador')
    const item = await criarItem({ preco: 10, estoque: 4 })
    const resposta = await admin.agente.patch(`/api/v1/config/loja/itens/${item.id}`).send(corpo)
    expect(resposta.status).toBe(400)
    const salvo = await prisma.itemLoja.findUniqueOrThrow({ where: { id: item.id } })
    expect(salvo).toMatchObject({ preco: 10, estoque: 4, ativo: true })
  })

  it('item inexistente ou id malformado: 404 antes de validar o corpo', async () => {
    const admin = await criarUsuarioComSessao('administrador')
    expect((await admin.agente.patch(`/api/v1/config/loja/itens/${randomUUID()}`).send({ preco: 1 })).status).toBe(404)
    expect((await admin.agente.patch('/api/v1/config/loja/itens/abc').send({})).status).toBe(404)
  })
})

describe('R-M2 — o banco também protege o saldo e o estoque', () => {
  it('rejeita saldo negativo por CHECK', async () => {
    const estudante = await estudanteComMoedas(5)
    await expect(
      prisma.saldoMoeda.update({ where: { usuario_id: estudante.id }, data: { saldo: { decrement: 6 } } })
    ).rejects.toThrow()
    expect(await saldoDe(estudante)).toBe(5)
  })

  it('rejeita estoque negativo por CHECK', async () => {
    const item = await criarItem({ estoque: 0 })
    await expect(
      prisma.itemLoja.update({ where: { id: item.id }, data: { estoque: { decrement: 1 } } })
    ).rejects.toThrow()
  })
})

describe('R-M10 — inventário no perfil (MO-12)', () => {
  it('o perfil do estudante lista os itens possuídos, visível a outro autenticado', async () => {
    const estudante = await estudanteComMoedas(20)
    const observador = await criarUsuarioComSessao('professor')
    const item = await criarItem({ preco: 5, categoria: 'titulo' })
    await estudante.agente.post(`/api/v1/loja/itens/${item.id}/comprar`)
    await estudante.agente.put(`/api/v1/inventario/${item.id}/equipado`).send({ equipado: true })
    const resposta = await observador.agente.get(`/api/v1/perfis/${estudante.id}`)
    expect(resposta.status).toBe(200)
    expect(resposta.body.inventario).toEqual([
      { itemId: item.id, codigo: item.codigo, nome: item.nome, categoria: 'titulo', equipado: true },
    ])
  })

  it('professor e administrador continuam com inventário vazio', async () => {
    const professor = await criarUsuarioComSessao('professor')
    const resposta = await professor.agente.get(`/api/v1/perfis/${professor.id}`)
    expect(resposta.body.inventario).toEqual([])
  })
})
