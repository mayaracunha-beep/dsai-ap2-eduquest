# Rankings (D11) — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-19
**Spec:** `SPEC/2026-11-19-rankings.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

Módulo 3 da evolução do EduQuest (AP2): rankings por métrica, escopo e período, com empate por regra fixa e privacidade, a partir do XP verificado (D7).

## O que foi feito

1. SPEC de D11 com regras R-RK1–R-RK11, contratos F7-01–F7-03 e critérios RK-01–RK-12; resolve a **DP-10** (empate e privacidade).
2. Migration `20261119160000_f7_rankings`: tabela `config_ranking` com `CHECK` do apelido e dois índices em `evento_xp` para consultas por período e por curso.
3. Servidor: `servicos/rankings.ts` (consulta em uma única query SQL com `ROW_NUMBER`, validação, pseudônimo estável e preferência) e `rotas/rankings.ts`.
4. Web: página Rankings (filtros, tabela com a métrica declarada, posição própria fora da lista e escolha de privacidade).
5. Testes: 52 de unidade e API e 12 de web (64 novos); suíte total de 420 testes.
6. Teste de mutação manual: com o desempate invertido, o oculto sem exclusão, sem janela da semana, sem escopo de curso, incluindo valor 0 ou aceitando apelido com `@`, os testes falham.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 420 testes passando em 33 arquivos.
- Cobertura do código novo (v8): 100% das linhas.

## Decisões e pendências

- O ranking nunca é gravado: é recalculado a cada consulta, sem tabela que possa divergir da fonte.
- Anônimo é o padrão, e a resposta nunca traz e-mail nem identificador interno.
- Ranking por turma fica pendente: o modelo não tem turmas.
