import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Building2, CircleDollarSign, ClipboardCheck, TriangleAlert } from 'lucide-react'
import { CostChart } from './components/CostChart'
import { Header } from './components/Header'
import { RdoTable } from './components/RdoTable'
import { Sidebar } from './components/Sidebar'
import { WorksList } from './components/WorksList'

const stats = [
  { label: 'Obras ativas', value: '3', note: '1 em planejamento', icon: Building2, tone: 'green' },
  { label: 'Custo neste mês', value: 'R$ 284,6 mil', note: '8,4% vs. mês anterior', icon: CircleDollarSign, tone: 'orange', up: true },
  { label: 'RDOs no mês', value: '42', note: '100% atualizados', icon: ClipboardCheck, tone: 'blue', down: true },
  { label: 'Prazos próximos', value: '3', note: 'nos próximos 15 dias', icon: TriangleAlert, tone: 'yellow' },
]

export function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-body">
        <Header onMenu={() => setMenuOpen(true)} />
        <main>
          <div className="welcome"><div><p>QUINTA-FEIRA, 17 DE SETEMBRO</p><h1>Bom dia, Ricardo <span>👋</span></h1><small>Aqui está o panorama das suas obras hoje.</small></div><button className="period-button">Últimos 30 dias <span>⌄</span></button></div>
          <div className="stats-grid">{stats.map(({ label, value, note, icon: Icon, tone, up, down }) => <article className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={21} /></div><p>{label}</p><strong>{value}</strong><small className={up ? 'positive' : down ? 'info' : ''}>{up && <ArrowUpRight size={14} />}{down && <ArrowDownRight size={14} />}{note}</small></article>)}</div>
          <div className="dashboard-grid"><WorksList /><CostChart /></div>
          <RdoTable />
          <footer>Dados de demonstração • Atualizado agora</footer>
        </main>
      </div>
    </div>
  )
}
