# Desempenho por questão da avaliação

Data: 2026-11-25. Tarefa T11.2 (D15), issue #8. Fonte das respostas e correções: [SPEC de avaliações](2026-10-01-avaliacoes.md).

O professor dono do curso pode consultar `GET /api/v1/avaliacoes/:id/desempenho` e ver o relatório na tela da avaliação, inclusive fora da janela de entrega. Visitantes recebem 401. Outros papéis e professores alheios recebem 403. Avaliação inexistente recebe 404 para uma sessão de professor.

O relatório lista as questões na ordem da avaliação. Cada resposta com pontuação registrada conta como corrigida, inclusive as objetivas de uma tentativa com dissertativas pendentes. Uma objetiva conta como acerto quando o indicador salvo é verdadeiro. Uma dissertativa conta como acerto quando recebeu a pontuação integral. A correção mais recente de cada resposta determina a contagem. Cada tentativa contribui com suas próprias respostas.

O servidor retorna o identificador e o enunciado da questão, quantidade de respostas corrigidas, acertos e percentual de acertos arredondado ao inteiro mais próximo. Uma questão sem respostas corrigidas apresenta 0 nas três métricas. Uma avaliação sem questões retorna lista vazia e a interface informa que não há questões. O relatório retorna somente agregados.

Critérios de aceitação incluem respostas certas e erradas, correção parcial e integral, respostas ainda pendentes, avaliação sem questões e acesso negado a professor alheio.
