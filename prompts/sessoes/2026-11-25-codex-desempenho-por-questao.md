# Sessão Codex — desempenho por questão

- Data: 2026-11-25. Issue #8, T11.2 e SPEC/2026-11-25-desempenho-por-questao.md.
- Solicitação: mostrar ao professor dono as respostas corrigidas, os acertos e o percentual, com cenários sem dados e acesso indevido.
- Uso do agente: leitura da SPEC de avaliações, escrita da SPEC em commit separado, implementação da agregação e da tela, testes automatizados e preparação do PR.
- Validação inicial: 15 testes de API de avaliações passaram, incluindo os cenários de desempenho, e o typecheck passou.
- Integração: o CI do PR #10 expôs um falso positivo em um teste do ranking. A busca pelo texto `60` encontrava esse número em pseudônimos e datas. O teste agora compara as entradas estruturadas, mantendo a verificação de privacidade.
- Revisão humana: registrar no GitHub quando realizada.
