# Notificações (D13) — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-19
**Spec:** `SPEC/2026-11-19-notificacoes.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

Módulo 4 da evolução do EduQuest (AP2): notificações in-app disparadas pelos eventos já existentes (conquistas, missões, loja e níveis), com preferências do estudante.

## O que foi feito

1. SPEC de D13 com regras R-NT1–R-NT9, contratos F9-01–F9-05 e critérios NT-01–NT-09.
2. Migration `20261119180000_f9_notificacoes` (tabelas `notificacao` e `preferencia_notificacao`, chave única por estudante e evento).
3. Servidor: `servicos/notificacoes.ts` (composição de texto, `notificar` idempotente com respeito às preferências, listagem, leitura, preferências e retenção) e `rotas/notificacoes.ts`.
4. Ganchos na mesma transação dos eventos: conquistas (`avaliarConquistas`), missões (`avaliarMissoes`), compra (`comprarItem`) e nível (`concederXp`).
5. Web: página Notificações (lista, marcar como lida, marcar todas, filtro e preferências) e contador de não lidas no menu, que nunca bloqueia a navegação se a consulta falhar.
6. Testes: 64 novos (unidade, API e web); suíte total de 484 testes. Helper `tests/utilidades/eventos.ts` compartilhado com os testes de missões.
7. Teste de mutação manual: sem respeitar a preferência, sem idempotência, com releitura sobrescrevendo o instante, com poda apagando não lidas ou deixando ver aviso alheio, os testes falham.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 484 testes passando em 36 arquivos.
- Cobertura do código novo (v8): cerca de 99,7% das linhas.

## Decisões e pendências

- Aviso nasce na transação do evento: se o evento falha, o aviso não existe; se repete, o aviso não repete.
- Tipo desativado não cria aviso (não é criado e escondido depois).
- E-mail (DP-11), aviso de missão prestes a expirar (exige tarefa agendada) e notificações sociais (D14) ficam para SPECs próprias.
