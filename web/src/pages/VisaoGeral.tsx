import { useEffect, useState } from 'react'
import { ArrowUpRight, Building2, CircleDollarSign, ClipboardCheck, TriangleAlert } from 'lucide-react'
import { CostChart } from '../components/CostChart'
import { RdoTable } from '../components/RdoTable'
import { WorksList } from '../components/WorksList'
import { usePanel } from '../components/PanelLayout'
import { getDashboard, type DashboardData } from '../lib/api'
import { formatCurrencyShort } from '../lib/format'

const DIAS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function VisaoGeral() {
  const { usuario } = usePanel()
  const [data, setData] = useState<DashboardData | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getDashboard()
      .then((r) => vivo && setData(r.data))
      .catch(() => vivo && setErro('Não consegui carregar seus dados agora. Tente atualizar a página.'))
    return () => {
      vivo = false
    }
  }, [])

  const hoje = new Date()
  const stats = data
    ? [
        { label: 'Obras ativas', value: String(data.stats.obrasAtivas), note: 'com registros', icon: Building2, tone: 'green' },
        { label: 'Custo neste mês', value: formatCurrencyShort(data.stats.custoMes), note: `${formatCurrencyShort(data.stats.custoTotal)} no total`, icon: CircleDollarSign, tone: 'orange', up: true },
        { label: 'RDOs neste mês', value: String(data.stats.rdosMes), note: 'diários de obra', icon: ClipboardCheck, tone: 'blue' },
        { label: 'Prazos próximos', value: String(data.stats.prazosProximos), note: 'nos próximos 15 dias', icon: TriangleAlert, tone: 'yellow' },
      ]
    : []

  return (
    <>
      <div className="welcome">
        <div>
          <p>{DIAS[hoje.getDay()]}, {hoje.getDate()} DE {MESES[hoje.getMonth()]}</p>
          <h1>{saudacao()}, {usuario.nome} <span>👋</span></h1>
          <small>Aqui está o panorama das suas obras.</small>
        </div>
        <button className="period-button">Últimos 30 dias <span>⌄</span></button>
      </div>

      {erro && <div className="board-msg erro">{erro}</div>}
      {!data && !erro && <div className="board-msg">Carregando seus dados…</div>}

      {data && (
        <>
          <div className="stats-grid">
            {stats.map(({ label, value, note, icon: Icon, tone, up }) => (
              <article className="stat-card" key={label}>
                <div className={`stat-icon ${tone}`}><Icon size={21} /></div>
                <p>{label}</p>
                <strong>{value}</strong>
                <small className={up ? 'positive' : ''}>{up && <ArrowUpRight size={14} />}{note}</small>
              </article>
            ))}
          </div>
          <div className="dashboard-grid">
            <WorksList obras={data.obras} />
            <CostChart categorias={data.custosPorCategoria} total={data.custoTotal} />
          </div>
          <RdoTable rdos={data.rdos} />
          <footer>Dados reais da sua conta • {usuario.dono ? 'Conta do dono' : 'Beta'}</footer>
        </>
      )}
    </>
  )
}
