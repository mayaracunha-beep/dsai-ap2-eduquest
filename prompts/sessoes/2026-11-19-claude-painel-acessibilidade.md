# Painel do estudante e acessibilidade — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-19
**Spec:** `SPEC/2026-11-19-painel-acessibilidade.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

Módulo 5 da evolução do EduQuest (AP2): dashboard do estudante e melhorias visuais e de acessibilidade, reaproveitando os domínios já implementados.

## O que foi feito

1. SPEC com regras R-PN1–R-PN7 (painel) e R-AC1–R-AC5 (acessibilidade), contrato F10-01 e critérios PN-01–PN-09 e AC-01–AC-03.
2. Servidor: `servicos/painel.ts` (agrega XP, moedas, missões, conquistas, avisos, ranking e cursos em andamento, cada um pelo serviço do domínio dono) e `rotas/painel.ts`. Sem migration: não há dados novos.
3. Web: página Painel (cartões com barras de progresso acessíveis e atalhos para as páginas dos domínios), primeiro item do menu do estudante.
4. Acessibilidade: link "Pular para o conteúdo", hook `useAcessibilidadeDeRota` (foco no título, título do documento e anúncio `aria-live` a cada troca de página, sem agir na carga inicial) e mapa de títulos tipado por `Vista`.
5. Teste de contraste WCAG AA que lê os tokens do `estilo.css` real. Antes de escrever, medi os pares de cores existentes: todos já passavam, então o teste protege contra regressões em vez de exigir mudança de cores.
6. Testes: 50 novos (unidade, API e web); suíte total de 534 testes. Helper `tests/web/auxiliar.ts` evita repetir o fetch simulado.
7. Teste de mutação manual: sem o filtro de missão cumprida, com o prazo invertido, curso 100% listado, aula despublicada contando, conquistas fora de ordem, posição de outro estudante, foco não movido e token com contraste ruim, os testes falham. Um mutante (aula despublicada) sobreviveu na primeira rodada; reforcei o teste e ele passou a falhar.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 534 testes passando em 39 arquivos.
- Cobertura do código novo (v8): 100% das linhas.
- Um teste novo apontou que a SPEC dizia "primeiro item do menu" e o código colocava o Painel depois de Rankings; o código foi ajustado à SPEC.

## Decisões e pendências

- O Painel é um item do menu e não a página inicial, para não alterar o comportamento aprovado do pós-login.
- Auditoria com leitor de tela real, navegação por teclado em todas as telas antigas e tema escuro ficam pendentes.
