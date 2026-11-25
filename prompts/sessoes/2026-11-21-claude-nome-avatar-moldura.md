# Nome, avatar e moldura — sessão com Claude

**Agente:** Claude (claude.ai)
**Data:** 2026-11-21
**Spec:** `SPEC/2026-11-21-nome-avatar-moldura.md`
**Custo / tokens:** _preencher com o valor mostrado em claude.ai (Configurações → Uso) para esta conversa; o agente não mede o próprio consumo._

---

## Pedido

A equipe notou que as molduras vendidas na loja (módulo 1) não tinham onde aparecer: o cadastro só pedia e-mail e senha e não havia avatar. Pediu nome e avatar no cadastro e um lugar para exibir a moldura.

## O que foi feito

1. SPEC com regras R-AV1–R-AV8, contratos F11-01–F11-03 e critérios AV-01–AV-12.
2. Migration `20261121100000_perfil_nome_avatar`: colunas `nome` e `avatar` opcionais em `usuario`, com `CHECK` de nome não vazio. Usuários antigos continuam válidos.
3. Servidor: `servicos/aparencia.ts` (catálogo de 12 avatares, validação de nome e avatar, leitura e edição parcial) e `rotas/aparencia.ts`; cadastro aceita `nome` e `avatar` opcionais e validados antes de criar a conta; o perfil traz nome, avatar, moldura e título equipados.
4. Web: componente `Avatar` (iniciais ou emoji, anel da moldura e nome acessível), seletor de avatar acessível, cadastro com nome obrigatório e prévia, perfil com identidade e editor de aparência (com atalho para trocar a moldura no inventário) e avatar com nome no cabeçalho.
5. Decisão de segurança: avatar por catálogo fixo, sem envio de imagem (sem armazenamento, sem moderação, sem foto de terceiros).
6. Testes: 77 novos (unidade, API e web); suíte total de 611 testes. Atualizei dois testes existentes por mudança de contrato documentada na SPEC: o corpo do cadastro na web e o formato do perfil na API.
7. Teste de mutação manual: nome com `@` aceito, moldura para professor, item não equipado aparecendo, avatar sem validação, cadastro ignorando o avatar, código do servidor virando classe CSS e iniciais quebrando em caracteres especiais. Um mutante (iniciais) sobreviveu na primeira rodada; reforcei o teste.

## Verificação

- `npm run typecheck` e `npm run build` sem erros; `npm test`: 611 testes passando em 42 arquivos.
- Cobertura do código novo (v8): 100% das linhas.

## Decisões e pendências

- Na API, `nome` e `avatar` são opcionais (compatível com clientes e testes antigos); a tela de cadastro exige o nome.
- O nome é dado pessoal: aparece no perfil (visível a autenticados) e no cabeçalho, nunca nos rankings.
- Foto de perfil e avatar nos rankings ficam pendentes (exigem armazenamento, moderação e uma opção de privacidade própria).
