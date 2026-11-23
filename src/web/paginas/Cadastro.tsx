import { FormEvent, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../cliente'
import { Avatar } from '../componentes/Avatar'
import { SeletorDeAvatar } from '../componentes/SeletorDeAvatar'
import { NOME_MAXIMO, type OpcaoDeAvatar } from '../tiposAparencia'

interface Props {
  aoIrParaLogin: () => void
}

export function PaginaCadastro({ aoIrParaLogin }: Props) {
  const [nome, setNome] = useState('')
  const [avatarId, setAvatarId] = useState<string | null>(null)
  const [avatares, setAvatares] = useState<OpcaoDeAvatar[]>([])
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [criada, setCriada] = useState(false)

  // catálogo público (F11-01); se falhar, o cadastro segue sem o seletor
  useEffect(() => {
    api<{ avatares: OpcaoDeAvatar[] }>('/api/v1/avatares')
      .then((resposta) => setAvatares(resposta.avatares))
      .catch(() => setAvatares([]))
  }, [])

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    try {
      await api('/api/v1/auth/registro', { metodo: 'POST', corpo: { nome, email, senha, ...(avatarId ? { avatar: avatarId } : {}) },
      })
      setCriada(true)
    } catch (erroEnvio) {
      setErro(mensagemDeErro(erroEnvio))
    }
  }

  if (criada) {
    return (
      <main className="principal principal-estreito">
        <h1 className="titulo-pagina">Conta criada</h1>
        <p role="status" className="alerta alerta-sucesso">
          Sua conta foi criada. Faça login para continuar.
        </p>
        <button type="button" onClick={aoIrParaLogin}>
          Ir para o login
        </button>
      </main>
    )
  }

  return (
    <main className="principal principal-estreito">
      <h1 className="titulo-pagina">Criar conta</h1>
      <form onSubmit={enviar} className="formulario-destaque">
        <label>
          Nome
          <input
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            maxLength={NOME_MAXIMO}
            autoComplete="name"
            required
          />
        </label>
        {avatares.length > 0 && (
          <>
            <SeletorDeAvatar opcoes={avatares} valor={avatarId} aoMudar={setAvatarId} nomeDoGrupo="avatar-cadastro" />
            <p className="resumo-estrutura">
              Prévia: <Avatar nome={nome} avatar={avatares.find((opcao) => opcao.id === avatarId) ?? null} tamanho="md" />
              {' '}As molduras que você comprar na loja aparecem em volta do avatar.
            </p>
          </>
        )}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            required
          />
        </label>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        <button type="submit">Criar conta</button>
      </form>
    </main>
  )
}
