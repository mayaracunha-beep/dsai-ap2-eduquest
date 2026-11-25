interface QuestaoFinal {
  enunciado: string
  alternativas: [string, string, string]
  correta: 0 | 1 | 2
}

export const avaliacoesTecnologia: Record<string, QuestaoFinal[]> = {
  'git-github': [
    { enunciado: 'Qual comando lista os arquivos modificados e indica a branch atual?', alternativas: ['git status', 'git add', 'git commit'], correta: 0 },
    { enunciado: 'Qual comando mostra o conteúdo selecionado para o próximo commit?', alternativas: ['git log', 'git diff --staged', 'git switch'], correta: 1 },
    { enunciado: 'Para que serve git add README.md?', alternativas: ['Publicar a branch', 'Apagar o arquivo do histórico', 'Selecionar a versão atual do arquivo para o próximo commit'], correta: 2 },
    { enunciado: 'Qual comando cria uma branch e muda para ela?', alternativas: ['git log -3', 'git switch -c estudo', 'git commit -m "estudo"'], correta: 1 },
    { enunciado: 'O que ajuda o colega a revisar um pull request?', alternativas: ['Descrever o objetivo e como a mudança foi testada', 'Informar apenas o tamanho do repositório', 'Misturar tarefas independentes no mesmo PR'], correta: 0 },
  ],
  'apis-rest-json': [
    { enunciado: 'Qual método é usado para consultar um curso pelo identificador?', alternativas: ['POST', 'DELETE', 'GET'], correta: 2 },
    { enunciado: 'Que status indica uma consulta HTTP bem-sucedida?', alternativas: ['200', '201', '404'], correta: 0 },
    { enunciado: 'Que status indica que o curso solicitado não foi encontrado?', alternativas: ['200', '404', '201'], correta: 1 },
    { enunciado: 'No JSON {"publicado": true}, qual é o tipo do valor de publicado?', alternativas: ['Texto', 'Número', 'Booleano'], correta: 2 },
    { enunciado: 'Que cabeçalho identifica uma resposta cujo corpo é JSON?', alternativas: ['Content-Type: application/json', 'Content-Type: text/csv', 'Content-Type: application/pdf'], correta: 0 },
  ],
  'python-automacao': [
    { enunciado: 'O que DictReader usa para nomear os campos de cada registro?', alternativas: ['A última linha do arquivo', 'O nome do arquivo', 'A linha de cabeçalho'], correta: 2 },
    { enunciado: 'Um CSV tem cabeçalho e dois registros. Qual é o resultado de len(list(DictReader(arquivo)))?', alternativas: ['3', '2', '1'], correta: 1 },
    { enunciado: 'Antes de somar valores inteiros lidos do CSV, o que fazer?', alternativas: ['Converter os valores para inteiros', 'Concatenar os valores como texto', 'Somar o nome das colunas'], correta: 0 },
    { enunciado: 'Como facilitar a correção de um valor inválido no CSV?', alternativas: ['Apagar todo o arquivo', 'Repetir o cabeçalho', 'Informar a linha e o campo que precisam de correção'], correta: 2 },
    { enunciado: 'Qual argumento de open indica a codificação UTF-8?', alternativas: ["encoding='utf-8'", "newline='utf-8'", "mode='utf-8'"], correta: 0 },
  ],
}
