# Moedas, loja e inventário (D12) — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-19
**Spec:** `SPEC/2026-11-19-moedas-loja-inventario.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

Evoluir o EduQuest (AP2) sem reescrever o que existe: criar a economia interna (moedas, loja, inventário) reaproveitando o XP da F5, com spec antes do código, testes e documentação atualizada.

## O que foi feito

1. Análise do código existente (padrões de serviço, rotas, transação de XP, testes e web) e do `PLAN.md` §5.12.
2. SPEC de D12 com regras R-M1–R-M10, contratos F8-01–F8-07 e critérios MO-01–MO-12.
3. Migration `20261119120000_f8_moedas_loja_inventario` (tabelas, `CHECK` de saldo/estoque/preço e catálogo inicial de 8 itens).
4. Servidor: `servicos/moedas.ts`, `servicos/loja.ts`, `rotas/loja.ts`; gancho de crédito em `concederXp` (mesma transação) e inventário real no perfil.
5. Web: páginas Loja e Inventário, seção Loja na Administração, itens no perfil e estilos.
6. Testes: 47 de API, 8 de unidade e 16 de web (71 novos); suíte total de 272 testes.
7. Teste de mutação manual: removendo a checagem de saldo ou o crédito de moedas, os testes correspondentes falham.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 272 testes passando em 27 arquivos.
- Cobertura do código novo (v8): ~99% das linhas.

## Decisões e pendências

- Moedas vêm só do XP (1 moeda a cada 5 XP); recompensas de missões e desafios ficam para D9/D10.
- Itens são cosméticos (molduras e títulos); efeitos de uso de item ficam pendentes de SPEC.
- Botão do menu chama-se "Meu inventário" para não colidir com o título "Inventário" do perfil (teste existente).
