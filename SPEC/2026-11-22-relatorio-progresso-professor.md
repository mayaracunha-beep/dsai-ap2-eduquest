# Relatório de progresso por curso para o professor

- Data: 2026-11-22
- Requisito: [issue #4](https://github.com/mayaracunha-beep/dsai-ap2-eduquest/issues/4)
- Base de cálculo: [SPEC de progresso de aprendizagem](2026-10-01-progresso-aprendizagem.md)

## Regras

1. Somente uma sessão com papel professor e identificador igual ao dono do curso pode consultar o relatório. Uma sessão ausente recebe 401. Sessões de outro professor, estudante ou administrador recebem 403, sem dados do relatório. Um curso inexistente recebe 404 para uma sessão de professor.
2. O relatório usa as conclusões existentes em `conclusao_aula`. O conjunto de aulas elegíveis é formado pelas aulas publicadas em módulos publicados do curso consultado.
3. Incluir somente usuários com papel estudante e pelo menos uma conclusão em uma aula elegível. A elegibilidade é calculada a cada consulta. Uma conclusão em aula despublicada ou em outro curso fica fora da contagem e não inclui o aluno no relatório.
4. Exibir o nome do estudante, o número de aulas elegíveis que ele concluiu, o total de aulas elegíveis do curso e o percentual. Para contas antigas sem nome, exibir “Estudante sem nome”. O servidor calcula `floor(100 × concluídas / total)`. A unicidade de estudante e aula impede que uma aula seja contada duas vezes.
5. Quando não houver estudante elegível, inclusive em curso sem aulas elegíveis, a API retorna lista vazia e a interface informa: “Nenhum estudante concluiu uma aula publicada neste curso.”
6. O professor dono pode abrir o relatório a partir da página do curso. O filtro editorial exige publicação da aula e do módulo. O acesso ao relatório do próprio curso independe do estado de publicação do curso.

## Critérios de aceitação

- Em um curso com três aulas elegíveis, o estudante com uma conclusão elegível aparece com nome, 1 aula concluída, total de 3 e 33%. Quem conclui as três aparece com 100%.
- Conclusões em outros cursos, em aulas não publicadas ou em módulos não publicados não alteram o cálculo. Um estudante com apenas esses registros fica fora da lista.
- O curso sem conclusões elegíveis retorna lista vazia e exibe a mensagem prevista, inclusive quando o total de aulas elegíveis é zero.
- Um teste de API autentica dois professores distintos, comprova que o dono pode consultar o relatório e que o outro recebe 403 sem dados de alunos. Testar também o bloqueio de estudante, administrador e visitante na API.
- O fluxo de progresso individual continua usando o contrato existente.
