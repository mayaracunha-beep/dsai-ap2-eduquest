# SPEC/2026-11-19-notificacoes.md — SPEC do domínio D13: notificações (EduQuest)

| Campo | Valor |
|---|---|
| Status | **Aprovada — 2026-11-19** (AP2) |
| Data | 2026-11-19 |
| Tarefa de origem | T9.1 e T9.2 do `TASKS.md` |
| Fontes de verdade | `SPEC/2026-09-30-visao-geral.md` (D13, passo 11) → `PLAN.md` §5.13 → `TASKS.md`; baselines: D7, D8, D9 e D12 (eventos disparadores) |
| Fora de escopo | canal de e-mail (depende de DP-11, integrações), notificação de missão prestes a expirar (exige tarefa agendada), notificações de recursos sociais (D14) e de professor/administrador |

## 1. Objetivo

Avisar o estudante, dentro da plataforma, dos eventos que ele provocou, respeitando o que ele escolheu receber. Seguem a regra de ouro: a notificação nasce no servidor, na mesma transação do evento que a causa.

## 2. Eventos disparadores

| Tipo | Origem | Chave de idempotência |
|---|---|---|
| `conquista_desbloqueada` | D8: nova conquista | `conquista:<id>` |
| `missao_cumprida` | D9: missão cumprida e paga | `missao:<id>` |
| `item_comprado` | D12: compra na loja | `compra:<id do item>` |
| `nivel_alcancado` | D7: subida de nível | `nivel:<nível>` |

## 3. Regras

- **R-NT1** O canal é só **in-app**. O e-mail fica fora do escopo até DP-11.
- **R-NT2** A notificação é criada na **mesma transação** do evento disparador. Se o evento falha, a notificação não existe; se o evento se repete, ela não se repete (único por estudante e chave).
- **R-NT3** O estudante controla o que recebe: uma preferência por tipo, todas **ativas por padrão**. Tipo desativado **não gera notificação** (ela não é criada e depois escondida). Mudar a preferência não apaga as já criadas nem cria as que foram suprimidas.
- **R-NT4** A leitura é registrada: `lida_em` recebe o instante da primeira leitura e nunca é sobrescrito. Marcar como lida é idempotente.
- **R-NT5** Só o estudante tem notificações, e só vê e altera as próprias. Notificação de outro estudante ou inexistente responde 404; professor e administrador recebem 403.
- **R-NT6** A listagem traz as mais recentes primeiro (padrão 20, máximo 50), aceita filtrar só as não lidas e sempre informa o total de não lidas.
- **R-NT7** O texto é composto no servidor, em português, a partir de dados do próprio evento. Não contém e-mail nem dado de outro usuário.
- **R-NT8** Retenção: no máximo 200 notificações por estudante. Ao exceder, apagam-se as **lidas** mais antigas; nenhuma não lida é apagada.
- **R-NT9** Parâmetros ou campos inválidos ou desconhecidos respondem 400.

## 4. Modelo físico

- `notificacao` (única por `usuario_id` + `chave`; `lida_em` nulo até a leitura; índice por `usuario_id`, `lida_em`, `criado_em`).
- `preferencia_notificacao` (`usuario_id` + `tipo` como chave; `ativa`). Sem linha = ativa.

## 5. Contratos (prefixo `/api/v1`, todos só para estudante)

| ID | Rota | Resposta |
|---|---|---|
| F9-01 | `GET /notificacoes?limite=&apenasNaoLidas=` | 200 `{naoLidas, notificacoes:[{notificacaoId, tipo, titulo, mensagem, lida, criadaEm, lidaEm}]}`; 400 |
| F9-02 | `PATCH /notificacoes/{id}/lida` | 200 com a notificação; 404 |
| F9-03 | `POST /notificacoes/marcar-todas-lidas` | 200 `{marcadas}` |
| F9-04 | `GET /notificacoes/preferencias` | 200 `{preferencias:[{tipo, rotulo, ativa}]}` (todos os tipos) |
| F9-05 | `PATCH /notificacoes/preferencias` | corpo `{tipo, ativa}`; 200 com a lista; 400 |

Web: página **Notificações** (lista, marcar como lida, preferências) e contador de não lidas no menu do estudante.

## 6. Critérios de aceitação (testáveis)

- **NT-01** Cada evento disparador gera a notificação do tipo certo, com o texto esperado (R-NT2, R-NT7).
- **NT-02** Repetir o evento não duplica a notificação (R-NT2).
- **NT-03** Tipo desativado não gera notificação; reativar não recria as suprimidas (R-NT3).
- **NT-04** Marcar como lida registra a primeira leitura e é idempotente; marcar todas só afeta as não lidas (R-NT4).
- **NT-05** Estudante não vê nem altera notificação alheia (404); papéis e sessão (401/403) (R-NT5).
- **NT-06** Listagem: ordem, limite, filtro de não lidas e contagem total (R-NT6).
- **NT-07** Validação de consulta e de preferência (R-NT9).
- **NT-08** Retenção apaga só lidas antigas (R-NT8).
- **NT-09** Notificação é atômica com o evento: falha na transação não deixa notificação (R-NT2).

## 7. Pendências

- E-mail (DP-11), aviso de missão prestes a expirar e notificações sociais (D14) ficam para SPECs próprias.
