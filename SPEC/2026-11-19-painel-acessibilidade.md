# SPEC/2026-11-19-painel-acessibilidade.md — SPEC do painel do estudante e da acessibilidade da navegação (EduQuest)

| Campo | Valor |
|---|---|
| Status | **Aprovada — 2026-11-19** (AP2) |
| Data | 2026-11-19 |
| Tarefa de origem | evolução de D2 (perfil e visão do estudante) e requisito não funcional de acessibilidade, a partir de D5–D13 já implementados |
| Fontes de verdade | `SPEC/2026-09-30-visao-geral.md` → `PLAN.md`; baselines: D6 (progresso), D7, D8, D9, D11, D12, D13 |
| Fora de escopo | gráficos de evolução histórica, personalização do painel, painel de professor ou administrador |

## 1. Objetivo

Dar ao estudante uma visão única do que importa agora (nível, moedas, missões, conquistas, avisos, posição e cursos em andamento) e tornar a navegação utilizável por teclado e leitor de tela. O painel **não calcula nada novo**: reúne o que cada domínio já decide.

## 2. Regras do painel

- **R-PN1** O painel é só do estudante e só mostra dados dele (401 sem sessão; 403 para professor e administrador).
- **R-PN2** Conteúdo:
  - `xp`: `xpTotal`, `xpSemana`, `nivel`, `xpNivelAtual`, `xpProximoNivel` (D7);
  - `moedas`: saldo (D12);
  - `missoes`: até 3 missões em andamento e ainda não cumpridas, a de prazo mais próximo primeiro (D9);
  - `conquistas`: quantas desbloqueou, o total do catálogo e as 3 mais recentes (D8);
  - `notificacoes`: total de não lidas e as 3 não lidas mais recentes (D13);
  - `ranking`: posição, valor e total de participantes no ranking global de XP da semana (D11);
  - `cursos`: até 3 cursos em andamento, a atividade mais recente primeiro.
- **R-PN3** Cada seção usa o serviço do domínio dono do dado. Não há fórmula duplicada: o percentual de um curso no painel é igual ao do catálogo.
- **R-PN4** Curso em andamento é o publicado em que o estudante concluiu ao menos uma aula publicada e ainda não concluiu todas. O percentual arredonda para baixo (R-D6-3), contando só aulas publicadas de módulos publicados.
- **R-PN5** O ranking respeita a privacidade de R-RK6: estudante oculto recebe `posicao` e `valor` nulos; o painel nunca expõe dados de outros estudantes.
- **R-PN6** Estudante novo recebe um painel válido: zeros, listas vazias e posição nula.
- **R-PN7** A resposta informa `geradoEm`.

## 3. Regras de acessibilidade

- **R-AC1** O primeiro elemento focável da página é o link "Pular para o conteúdo", que leva o foco ao conteúdo principal.
- **R-AC2** A cada troca de página (exceto a carga inicial): o foco vai para o título principal (ou, na falta dele, para o conteúdo principal), o título do documento passa a `<Página> — EduQuest` e uma região `aria-live="polite"` anuncia "Página: <nome>".
- **R-AC3** Os pares de cores de texto e fundo dos tokens do tema atendem WCAG AA (razão mínima de 4,5:1). Um teste lê o CSS real e falha se um token futuro violar a regra.
- **R-AC4** Todo botão e campo tem nome acessível; o item atual do menu usa `aria-current="page"` (já existente e preservado).
- **R-AC5** Quem prefere menos movimento mantém a regra existente de `prefers-reduced-motion`.

## 4. Contratos (prefixo `/api/v1`)

| ID | Rota | Papel | Resposta |
|---|---|---|---|
| F10-01 | `GET /painel` | estudante | 200 `{geradoEm, xp, moedas, missoes, conquistas, notificacoes, ranking, cursos}` |

Formato das seções: `moedas: {saldo}`; `missoes: [{missaoId, titulo, tipo, meta, progresso, fim, recompensaMoedas}]`; `conquistas: {desbloqueadas, total, recentes:[{codigo, nome, desbloqueadaEm}]}`; `notificacoes: {naoLidas, recentes:[{notificacaoId, titulo, mensagem, criadaEm}]}`; `ranking: {posicao, valor, totalParticipantes}`; `cursos: [{cursoId, titulo, aulasConcluidas, aulasTotal, percentual}]`.

Web: página **Painel** (primeiro item do menu do estudante, sem alterar a página inicial atual), link para pular ao conteúdo, foco e anúncio na troca de página.

## 5. Critérios de aceitação (testáveis)

- **PN-01** Papéis e sessão (R-PN1).
- **PN-02** Estudante novo: painel zerado e válido (R-PN6).
- **PN-03** XP, nível e moedas refletem os dados reais (R-PN2).
- **PN-04** Missões: só em andamento e não cumpridas, no máximo 3, prazo mais próximo primeiro (R-PN2).
- **PN-05** Conquistas: contagem, total e 3 mais recentes em ordem (R-PN2).
- **PN-06** Notificações: total e 3 não lidas mais recentes (R-PN2).
- **PN-07** Ranking: posição e valor da semana; oculto recebe nulos (R-PN5).
- **PN-08** Cursos: percentual igual ao do catálogo; concluído (100%) e sem atividade ficam de fora; máximo 3, atividade mais recente primeiro (R-PN3, R-PN4).
- **PN-09** O painel de um estudante não contém dados de outro (R-PN1, R-PN5).
- **AC-01** Link de pular leva o foco ao conteúdo (R-AC1).
- **AC-02** Troca de página move o foco ao título, atualiza o título do documento e anuncia (R-AC2); a carga inicial não rouba o foco.
- **AC-03** Contraste AA nos tokens do tema (R-AC3).

## 6. Pendências

- Auditoria completa com leitor de tela real e navegação por teclado em todas as telas antigas.
- Tema escuro e ajuste de tamanho de texto pelo usuário.
