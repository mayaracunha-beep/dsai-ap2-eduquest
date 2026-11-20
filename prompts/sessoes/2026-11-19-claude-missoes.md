# Missões (D9) — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-19
**Spec:** `SPEC/2026-11-19-missoes.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

Continuar a evolução do EduQuest (AP2) com o módulo 2: missões, reaproveitando o XP (D7) e pagando em moedas (D12).

## O que foi feito

1. SPEC de D9 com regras R-MS1–R-MS11, contratos F6-01–F6-04 e critérios MS-01–MS-12.
2. Migration `20261119140000_f6_missoes` (tabelas `missao` e `cumprimento_missao`, `CHECK` de meta, recompensa e janela, valor `missao` em `OrigemMoeda`).
3. Servidor: `servicos/missoes.ts` (validação, progresso, avaliação e gestão) e `rotas/missoes.ts`; gancho em `concederXp` que reavalia as missões na mesma transação; função genérica `creditar` em `moedas.ts`.
4. Web: páginas Missões (estudante) e Gestão de missões (professor e administrador), tipos compartilhados e estilos.
5. Testes: 41 de unidade, 29 de API e 14 de web (84 novos); suíte total de 356 testes. Helper `tests/utilidades/cursos.ts` evita duplicar a criação de curso nos testes.
6. Teste de mutação manual: sem a janela de datas, sem o escopo de curso ou com a origem do evento fixa, os testes falham.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 356 testes passando em 30 arquivos.
- Cobertura do código novo (v8): ~99% das linhas.

## Decisões e pendências

- Progresso derivado dos eventos de XP verificados (sem tabela de progresso separada), o que mantém uma única fonte de verdade.
- Recompensa só em moedas; XP bônus e itens ficam pendentes.
- Desafios (D10) e notificação de missão prestes a expirar (D13) ficam para as próximas SPECs.
