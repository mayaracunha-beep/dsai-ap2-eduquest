# Inclusão de cursos de tecnologia

- Agente: Codex.
- Tarefa: conferir o catálogo e incluir três cursos com apostilas originais.
- Decisões: importar sob um professor existente e reutilizar o armazenamento de anexos das aulas.
- Validação: build, tipos do importador, duas importações em PostgreSQL temporário e consulta ao catálogo e aos três PDFs por uma sessão de estudante.
- Tokens ou custo: indisponíveis nesta sessão.
# Validação de integração — 2026-11-25

O Codex reproduziu no Edge a ausência do botão de download. O importador gravava o identificador do PDF sem os metadados usados pelo catálogo. A correção preenche o bloco na primeira importação e recupera apenas referências legadas geradas pelo importador.

No banco de demonstração, o Edge baixou os três PDFs byte a byte e enviou três avaliações de cinco questões. Uma importação posterior preservou os seis registros de aula, os três cursos, as três avaliações e as tentativas existentes.
