# SPEC/2026-11-21-nome-avatar-moldura.md — SPEC de nome, avatar e moldura no perfil (EduQuest)

| Campo | Valor |
|---|---|
| Status | **Aprovada — 2026-11-21** (AP2) |
| Data | 2026-11-21 |
| Tarefa de origem | pedido da equipe: o cadastro só pedia e-mail e senha e as molduras da loja (D12) não tinham onde aparecer; evolução de D1/D2 |
| Fontes de verdade | `SPEC/2026-09-30-visao-geral.md` → `PLAN.md`; baselines: D1 (cadastro), D2 (perfil, contrato 7), D12 (`2026-11-19-moedas-loja-inventario.md`, R-M5/R-M6) e D11 (R-RK6) |
| Fora de escopo | envio de foto ou imagem, moderação de conteúdo, nome nos rankings, edição de e-mail e senha |

## 1. Objetivo

Dar identidade ao usuário: um **nome**, um **avatar** e, para o estudante, a **moldura** e o **título** que ele comprou e equipou. A moldura passa a ter onde aparecer: em volta do avatar.

## 2. Regras

- **R-AV1** O cadastro aceita `nome` e `avatar` opcionais (a API continua compatível com clientes antigos); a **tela** de cadastro exige o nome.
- **R-AV2** Nome: texto de 1 a 60 caracteres após remover espaços das pontas, sem `@` (evita e-mail no lugar do nome) e sem caracteres de controle. É dado pessoal: aparece no perfil (visível a qualquer autenticado, como as conquistas) e no cabeçalho do próprio usuário. **Nunca** aparece nos rankings, que seguem R-RK6 (anônimo, apelido ou oculto).
- **R-AV3** Avatar: escolhido num **catálogo fixo de 12 opções** do servidor, identificado por um código. Não há envio de imagem (sem armazenamento de arquivo, sem moderação e sem risco de foto de terceiros). Sem escolha, a tela mostra as iniciais do nome. O catálogo é público (`GET /avatares`), porque o cadastro acontece antes do login.
- **R-AV4** Moldura e título exibidos são os itens **equipados** do inventário do estudante (D12, R-M6), resolvidos pelo servidor; sem item equipado, `null`. A moldura é só decorativa e não altera pontuação, ranking ou missões.
- **R-AV5** Cada usuário, de qualquer papel, altera só o próprio nome e avatar (`PUT /aparencia`, parcial, com ao menos um campo). `nome` não pode ser vazio nem nulo; `avatar` é um código válido ou `null` (remove).
- **R-AV6** O perfil (contrato 7) passa a trazer `nome`, `avatar`, `moldura` e `titulo`. O e-mail continua fora de qualquer resposta de perfil.
- **R-AV7** Moldura e título só existem para estudantes; para professor e administrador são `null`.
- **R-AV8** Acessibilidade: o avatar tem nome acessível ("Avatar de <nome>, <rótulo>, com <moldura>") e a moldura é decorativa: nenhuma informação depende só dela.

## 3. Modelo físico

- `usuario.nome` (até 60 caracteres, opcional; `CHECK` de não vazio) e `usuario.avatar` (código do catálogo, opcional). Usuários antigos continuam válidos com os dois nulos.

## 4. Contratos (prefixo `/api/v1`)

| ID | Rota | Papel | Resposta |
|---|---|---|---|
| F11-01 | `GET /avatares` | público | 200 `{avatares:[{id, rotulo, emoji, cor}]}` |
| F11-02 | `GET /aparencia` | autenticado | 200 `{nome, avatar, moldura, titulo}` do próprio usuário |
| F11-03 | `PUT /aparencia` | autenticado | corpo `{nome?, avatar?}`; 200 com o mesmo formato; 400 inválido |
| — | `POST /auth/registro` | público | aceita também `nome` e `avatar`; 400 se inválidos (nada é criado); a resposta não muda |
| — | `GET /perfis/{id}` | autenticado | ganha `nome`, `avatar`, `moldura` e `titulo` |

`avatar` é `{id, rotulo, emoji, cor}` ou `null`; `moldura` e `titulo` são `{codigo, nome}` ou `null`.

Web: cadastro com nome e seletor de avatar; perfil com identidade (avatar com moldura, nome, título) e editor de aparência; avatar e nome no cabeçalho.

## 5. Critérios de aceitação (testáveis)

- **AV-01** Cadastro com nome e avatar grava e devolve no perfil; sem eles continua funcionando (R-AV1).
- **AV-02** Nome inválido ou avatar fora do catálogo no cadastro → 400 e nenhuma conta criada (R-AV2, R-AV3).
- **AV-03** `GET /avatares` é público e devolve o catálogo de 12 opções com códigos únicos (R-AV3).
- **AV-04** `GET`/`PUT /aparencia`: só o próprio usuário, de qualquer papel; 401 sem sessão (R-AV5).
- **AV-05** `PUT` parcial: altera só o enviado; `avatar: null` remove; nome vazio, nulo ou com `@` → 400 (R-AV2, R-AV5).
- **AV-06** A moldura e o título equipados aparecem em `aparencia` e no perfil; desequipar remove (R-AV4).
- **AV-07** A moldura de um estudante nunca aparece no perfil de outro estudante (R-AV4).
- **AV-08** Professor e administrador têm moldura e título nulos (R-AV7).
- **AV-09** O perfil traz nome e avatar, nunca e-mail (R-AV6, R-AV2).
- **AV-10** O nome não aparece nos rankings (R-AV2).
- **AV-11** Web: o cadastro exige nome, envia o que foi escolhido e continua sem campo de papel (R-AV1).
- **AV-12** Web: o avatar mostra iniciais ou o emoji escolhido, com a moldura e o nome acessível (R-AV8).

## 6. Pendências

- Envio de foto (exige armazenamento e moderação) e molduras animadas.
- Mostrar o avatar nos rankings (depende de uma opção de privacidade própria).
