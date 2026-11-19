# SPEC/2026-11-19-moedas-loja-inventario.md — SPEC do domínio D12: moedas, loja e inventário (EduQuest)

| Campo | Valor |
|---|---|
| Status | **Aprovada — 2026-11-19** (AP2) |
| Data | 2026-11-19 |
| Tarefa de origem | T8.2 (moedas) e T8.3 (loja e inventário) do `TASKS.md`; resolve a parcela D12 de **DP-18** (catálogo de itens e preços) |
| Fontes de verdade | `SPEC/2026-09-30-visao-geral.md` → `PLAN.md` §5.12 → `TASKS.md`; baseline: D7 (`2026-10-02-xp-niveis.md`) e D8 (`2026-10-02-conquistas.md`) |
| Fora de escopo | pagamentos e moedas reais (DP-12), transferência entre usuários, efeitos de itens sobre XP, recompensas de missões/desafios (D9/D10, SPEC própria) |

## 1. Objetivo

Criar a economia interna do EduQuest: o estudante ganha **moedas** por aprender, gasta na **loja** e guarda o que comprou no **inventário**. Segue a regra de ouro da visão (§4): toda moeda e todo item é decidido pelo servidor, a partir de ações verificadas.

## 2. Escopo

- Moedas geradas a partir do XP concedido (D7), com saldo e extrato.
- Loja com catálogo fixo de 8 itens cosméticos (§4.1), preço e estoque configuráveis pelo administrador.
- Compra atômica e inventário do estudante; itens equipáveis.
- Inventário exibido no perfil (contrato 7, `inventario`), antes sempre vazio.

## 3. Fluxos

1. **Ganhar (passo 8/10 da regra de ouro):** ao conceder XP (D7), o servidor credita moedas na mesma transação.
2. **Consultar saldo:** o estudante vê o saldo e as últimas 20 movimentações.
3. **Comprar:** o estudante escolhe um item ativo; o servidor debita, baixa o estoque e coloca o item no inventário, tudo ou nada.
4. **Equipar:** o estudante equipa ou desequipa um item que possui; equipar substitui o item da mesma categoria.
5. **Administrar:** o administrador lista todos os itens e ajusta preço, estoque e disponibilidade.

## 4. Regras

- **R-M1** Cada evento de XP gravado gera `floor(xp / 5)` moedas. Evento sem moedas (`xp < 5`) não gera movimentação. O evento é idempotente pela chave `xp:<chave do evento de XP>`: repetir a ação nunca paga duas vezes.
- **R-M2** O saldo nunca é negativo (validado na transação e por `CHECK` no banco).
- **R-M3** A compra é atômica: baixa do estoque, débito, inventário e extrato acontecem na mesma transação; qualquer falha desfaz tudo. Compras concorrentes nunca gastam mais que o saldo.
- **R-M4** O débito usa o preço vigente na compra e fica gravado no extrato (valor negativo). Mudar o preço depois não é retroativo.
- **R-M5** O item não é transferível e cada estudante possui no máximo uma unidade de cada item (nova compra do mesmo item → conflito).
- **R-M6** Há no máximo um item equipado por categoria (`moldura`, `titulo`). Equipar um item desequipa o anterior da mesma categoria.
- **R-M7** Saldo, extrato, compra e inventário são exclusivos do papel estudante (professor/administrador recebem 403).
- **R-M8** Estoque `null` = ilimitado; `0` = esgotado (compra → conflito). Item inativo não aparece na loja do estudante nem pode ser comprado (404).
- **R-M9** Preço: inteiro de 0 a 10.000. Estoque: `null` ou inteiro de 0 a 100.000. Só o administrador altera.
- **R-M10** O perfil de um estudante lista seus itens possuídos, visível a qualquer autenticado (como as conquistas, R-C9).

### 4.1 Catálogo inicial (resolve DP-18 na parcela D12)

| Código | Nome | Categoria | Preço |
|---|---|---|---|
| moldura-bronze | Moldura Bronze | moldura | 20 |
| moldura-prata | Moldura Prata | moldura | 40 |
| moldura-ouro | Moldura Ouro | moldura | 80 |
| moldura-galaxia | Moldura Galáxia | moldura | 120 |
| titulo-explorador | Título Explorador | titulo | 15 |
| titulo-estudioso | Título Estudioso | titulo | 30 |
| titulo-mestre | Título Mestre dos Quizzes | titulo | 60 |
| titulo-lenda | Título Lenda do EduQuest | titulo | 150 |

## 5. Modelo físico

- `saldo_moeda` (`usuario_id` PK, `saldo` ≥ 0).
- `evento_moeda` (`origem` xp|compra, `valor` com sinal, `chave` única por usuário).
- `item_loja` (`codigo` único, `categoria`, `preco` ≥ 0, `estoque` nulo ou ≥ 0, `ativo`, `ordem` única).
- `item_inventario` (única por `usuario_id` + `item_id`, `equipado`).

## 6. Contratos (prefixo `/api/v1`, erros no formato do projeto)

| ID | Rota | Papel | Resposta |
|---|---|---|---|
| F8-01 | `GET /moedas` | estudante | 200 `{saldo, extrato:[{origem, valor, criadoEm}]}` |
| F8-02 | `GET /loja/itens` | autenticado | 200 `{itens:[{itemId, codigo, nome, descricao, categoria, preco, estoque, possui}]}` só ativos; `possui` apenas para estudante |
| F8-03 | `POST /loja/itens/{id}/comprar` | estudante | 201 `{saldo, item}`; 404 inexistente/inativo; 409 já possui, esgotado ou saldo insuficiente |
| F8-04 | `GET /inventario` | estudante | 200 `{itens:[{itemId, codigo, nome, categoria, equipado, adquiridoEm}]}` |
| F8-05 | `PUT /inventario/{itemId}/equipado` | estudante | corpo `{equipado: boolean}`; 200 com o item; 404 se não possui; 400 corpo inválido |
| F8-06 | `GET /config/loja` | administrador | 200 `{itens:[...]}` incluindo inativos |
| F8-07 | `PATCH /config/loja/itens/{id}` | administrador | corpo parcial `{preco?, estoque?, ativo?}`; 200 com o item; 404; 400 |

Ordem de erros: 401 → 403 → 404 → 400 → 409. Perfil: `inventario` passa a `[{itemId, codigo, nome, categoria, equipado}]`.

Web: páginas **Loja** e **Inventário** (menu do estudante) e seção **Loja** na Administração.

## 7. Critérios de aceitação (testáveis)

- **MO-01** Concluir uma aula (10 XP) credita 2 moedas; repetir a conclusão não credita de novo (R-M1).
- **MO-02** `floor(xp/5)`: 4 XP → 0, 5 → 1, 19 → 3 (unidade).
- **MO-03** Compra feliz: saldo debitado, item no inventário, extrato com valor negativo (R-M3/R-M4).
- **MO-04** Saldo insuficiente → 409 sem alterar saldo, estoque nem inventário (R-M2).
- **MO-05** Segunda compra do mesmo item → 409 e sem novo débito (R-M5).
- **MO-06** Estoque 1 e dois compradores: só um compra; o outro recebe 409 e mantém o saldo (R-M3/R-M8).
- **MO-07** Duas compras simultâneas com saldo para uma: exatamente uma tem sucesso (R-M3).
- **MO-08** Equipar substitui o item da mesma categoria; categorias diferentes coexistem (R-M6).
- **MO-09** Papéis e sessão: 401 sem sessão; 403 para professor/administrador nas rotas de estudante e para estudante nas de administração (R-M7).
- **MO-10** Preço novo não altera compras anteriores (R-M4); validações de faixa e de campos desconhecidos → 400 (R-M9).
- **MO-11** Item inativo some da loja e não compra (R-M8).
- **MO-12** O perfil mostra os itens possuídos (R-M10).

## 8. Pendências

- Efeitos de itens (ex.: bônus de XP) e recompensas em moedas de missões e desafios ficam para as SPECs de D9/D10.
