import { registrarInteresse } from '../lib/api'
import { FormEvent, useMemo, useState } from 'react'
import '../styles/landing.css'

type PlanoId = 'essencial' | 'profissional'

interface DadosCadastro {
  nome: string
  cpf: string
  email: string
  telefone: string
  endereco: string
  profissao: string
}

const planos: Record<PlanoId, { nome: string; preco: string; descricao: string }> = {
  // TODO: preço a confirmar
  essencial: { nome: 'Essencial', preco: 'R$ 89,90/mês', descricao: 'Organização prática para começar.' },
  // TODO: preço a confirmar
  profissional: { nome: 'Profissional', preco: 'R$ 169,90/mês', descricao: 'A operação completa da sua obra.' },
}

const dadosIniciais: DadosCadastro = { nome: '', cpf: '', email: '', telefone: '', endereco: '', profissao: '' }

function Logo() {
  return <div className="logo" aria-label="Rosana"><span className="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>rosana<i>.</i></span></div>
}

function somenteNumeros(valor: string) { return valor.replace(/\D/g, '') }
function formatarCpf(valor: string) { return somenteNumeros(valor).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2') }
function formatarTelefone(valor: string) { const numeros = somenteNumeros(valor).slice(0, 11); return numeros.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2') }

function cpfValido(cpfFormatado: string) {
  const cpf = somenteNumeros(cpfFormatado)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const digito = (tamanho: number) => {
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

async function iniciarCheckout(dados: DadosCadastro, plano: PlanoId) {
  // TODO: integrar Mercado Pago no backend. Enquanto isso, o interesse é
  // GUARDADO no backend (antes os dados eram descartados e o lead se perdia).
  try {
    await registrarInteresse({
      nome: dados.nome,
      telefone: dados.telefone,
      email: dados.email,
      cpf: dados.cpf,
      endereco: dados.endereco,
      profissao: dados.profissao,
      plano,
    })
  } catch {
    /* segue para a tela de "em breve" mesmo se o registro falhar */
  }
  return { aguardandoIntegracao: true, cliente: dados.nome, plano }
}

export function Cadastro() {
  const planoInicial = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('plano') === 'essencial' ? 'essencial' : 'profissional'
  const [dados, setDados] = useState<DadosCadastro>(dadosIniciais)
  const [plano, setPlano] = useState<PlanoId>(planoInicial)
  const [etapa, setEtapa] = useState<'cadastro' | 'pagamento'>('cadastro')
  const [erros, setErros] = useState<Partial<Record<keyof DadosCadastro, string>>>({})
  const [checkout, setCheckout] = useState<'pronto' | 'processando' | 'em-breve'>('pronto')
  const planoAtual = useMemo(() => planos[plano], [plano])

  const atualizar = (campo: keyof DadosCadastro, valor: string) => {
    setDados((anterior) => ({ ...anterior, [campo]: valor }))
    setErros((anteriores) => ({ ...anteriores, [campo]: undefined }))
  }

  const validar = () => {
    const novosErros: Partial<Record<keyof DadosCadastro, string>> = {}
    if (dados.nome.trim().split(/\s+/).length < 2) novosErros.nome = 'Informe seu nome completo.'
    if (!cpfValido(dados.cpf)) novosErros.cpf = 'Informe um CPF válido.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) novosErros.email = 'Informe um e-mail válido.'
    if (somenteNumeros(dados.telefone).length < 10) novosErros.telefone = 'Informe o WhatsApp com DDD.'
    if (dados.endereco.trim().length < 8) novosErros.endereco = 'Informe seu endereço completo.'
    if (!dados.profissao) novosErros.profissao = 'Selecione sua profissão.'
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const continuar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (validar()) { setEtapa('pagamento'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const pagar = async () => {
    setCheckout('processando')
    await iniciarCheckout(dados, plano)
    setCheckout('em-breve')
  }

  return (
    <div className="sales-page signup-page">
      <header className="signup-header"><a href="/" className="brand-link"><Logo /></a><span>Já tem uma conta? <a href="/entrar">Entrar</a></span></header>
      <main className="signup-main">
        <section className="signup-intro"><a href={etapa === 'pagamento' ? '#' : '/'} onClick={etapa === 'pagamento' ? (evento) => { evento.preventDefault(); setEtapa('cadastro'); setCheckout('pronto') } : undefined}>← {etapa === 'pagamento' ? 'Voltar ao cadastro' : 'Voltar para o início'}</a><p className="sales-kicker">COMECE COM A ROSANA</p><h1>{etapa === 'cadastro' ? <>Sua obra organizada<br /><em>começa aqui.</em></> : <>Revise seu plano<br /><em>e conclua.</em></>}</h1><p>{etapa === 'cadastro' ? 'Conte um pouco sobre você. Leva menos de 3 minutos e seus dados ficam protegidos.' : 'Confira seus dados antes de seguir para o pagamento seguro.'}</p><div className="signup-benefits"><span>✓ Cancele quando quiser</span><span>✓ Suporte em português</span><span>✓ Seus dados protegidos</span></div></section>

        <section className="signup-card">
          <div className="signup-progress"><div className="progress-step is-active"><span>1</span><div><strong>Seus dados</strong><small>Informações de cadastro</small></div></div><i className={etapa === 'pagamento' ? 'is-complete' : ''}></i><div className={`progress-step ${etapa === 'pagamento' ? 'is-active' : ''}`}><span>2</span><div><strong>Pagamento</strong><small>Assinatura segura</small></div></div></div>

          {etapa === 'cadastro' ? <form className="signup-form" onSubmit={continuar} noValidate>
            <div className="form-heading"><span>01</span><div><h2>Informações pessoais</h2><p>Usaremos estes dados para criar a sua conta.</p></div></div>
            <label className={erros.nome ? 'has-error' : ''}><span>Nome completo *</span><input value={dados.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Como devemos chamar você?" autoComplete="name" />{erros.nome && <small>{erros.nome}</small>}</label>
            <div className="form-row"><label className={erros.cpf ? 'has-error' : ''}><span>CPF *</span><input value={dados.cpf} onChange={(e) => atualizar('cpf', formatarCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />{erros.cpf && <small>{erros.cpf}</small>}</label><label className={erros.profissao ? 'has-error' : ''}><span>Profissão *</span><select value={dados.profissao} onChange={(e) => atualizar('profissao', e.target.value)}><option value="">Selecione</option><option>Engenheiro(a)</option><option>Mestre(a) de obra</option><option>Arquiteto(a)</option><option>Empreiteiro(a)</option><option>Gestor(a) de obras</option><option>Outro</option></select>{erros.profissao && <small>{erros.profissao}</small>}</label></div>
            <div className="form-row"><label className={erros.email ? 'has-error' : ''}><span>E-mail *</span><input type="email" value={dados.email} onChange={(e) => atualizar('email', e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" />{erros.email && <small>{erros.email}</small>}</label><label className={erros.telefone ? 'has-error' : ''}><span>WhatsApp com DDD *</span><input value={dados.telefone} onChange={(e) => atualizar('telefone', formatarTelefone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" />{erros.telefone && <small>{erros.telefone}</small>}</label></div>
            <label className={erros.endereco ? 'has-error' : ''}><span>Endereço completo *</span><input value={dados.endereco} onChange={(e) => atualizar('endereco', e.target.value)} placeholder="Rua, número, complemento, cidade e estado" autoComplete="street-address" />{erros.endereco && <small>{erros.endereco}</small>}</label>
            <fieldset><legend>Escolha seu plano *</legend><div className="plan-options">{(Object.entries(planos) as [PlanoId, typeof planos[PlanoId]][]).map(([id, item]) => <label className={`plan-option ${plano === id ? 'is-selected' : ''}`} key={id}><input type="radio" name="plano" checked={plano === id} onChange={() => setPlano(id)} /><span className="radio-mark"></span><div><strong>{item.nome}</strong><small>{item.descricao}</small></div><b>{item.preco}</b></label>)}</div></fieldset>
            <p className="privacy-note">🔒 Ao continuar, você concorda com nossos <a href="/termos">Termos de uso</a> e nossa <a href="/privacidade">Política de privacidade</a>.</p>
            <button className="sales-button sales-button--primary signup-submit" type="submit">Continuar para pagamento <span>→</span></button>
          </form> : <div className="payment-step">
            <div className="form-heading"><span>02</span><div><h2>Resumo da assinatura</h2><p>O pagamento ainda não será processado nesta versão.</p></div></div>
            <div className="order-summary"><div><span>Plano {planoAtual.nome}</span><button onClick={() => setEtapa('cadastro')}>Alterar</button></div><strong>{planoAtual.preco}</strong><small>Renovação mensal · cancele quando quiser</small></div>
            <div className="customer-summary"><h3>Dados da assinatura</h3><dl><div><dt>Nome</dt><dd>{dados.nome}</dd></div><div><dt>E-mail</dt><dd>{dados.email}</dd></div><div><dt>WhatsApp</dt><dd>{dados.telefone}</dd></div><div><dt>CPF</dt><dd>{dados.cpf}</dd></div></dl></div>
            {checkout === 'em-breve' ? <div className="checkout-message" role="status"><span>✓</span><div><strong>Cadastro recebido!</strong><p>A integração de pagamento estará disponível em breve. Nenhuma cobrança foi realizada.</p></div></div> : <><div className="payment-placeholder"><span>▣</span><div><strong>Pagamento seguro</strong><small>Aqui será aberto o checkout do Mercado Pago.</small></div></div><button className="sales-button sales-button--primary signup-submit" onClick={pagar} disabled={checkout === 'processando'}>{checkout === 'processando' ? 'Preparando checkout…' : 'Assinar e pagar'} <span>→</span></button><p className="secure-note">🔒 Ambiente protegido. Nenhuma informação bancária é armazenada pela Rosana.</p></>}
          </div>}
        </section>
      </main>
      <footer className="signup-footer">© 2026 Rosana <span>•</span> <a href="/privacidade">Privacidade</a> <span>•</span> <a href="/termos">Termos</a></footer>
    </div>
  )
}
