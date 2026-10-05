/**
 * Mapa do Brasil em GRADE DE LADRILHOS (tile grid map / statebin). Cada estado é
 * um quadrado rotulado, posicionado em arranjo geográfico aproximado. Evita
 * depender de paths SVG precisos e mantém os estados COMPARÁVEIS em tamanho — a
 * cor (azul, escala sequencial clara→forte) codifica a quantidade de usuários.
 * O rótulo (sigla) + tooltip tornam a identidade inequívoca, não dependemos da
 * posição exata.
 */

const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

// Arranjo aproximado (linha, coluna) das 27 UFs — Norte no topo, Sul embaixo.
const GRADE: { uf: string; r: number; c: number }[] = [
  { uf: 'RR', r: 0, c: 3 }, { uf: 'AP', r: 0, c: 4 },
  { uf: 'AM', r: 1, c: 2 }, { uf: 'PA', r: 1, c: 3 }, { uf: 'MA', r: 1, c: 4 }, { uf: 'CE', r: 1, c: 5 }, { uf: 'RN', r: 1, c: 6 },
  { uf: 'AC', r: 2, c: 1 }, { uf: 'RO', r: 2, c: 2 }, { uf: 'TO', r: 2, c: 3 }, { uf: 'PI', r: 2, c: 4 }, { uf: 'PB', r: 2, c: 5 }, { uf: 'PE', r: 2, c: 6 },
  { uf: 'MT', r: 3, c: 2 }, { uf: 'DF', r: 3, c: 3 }, { uf: 'BA', r: 3, c: 5 }, { uf: 'AL', r: 3, c: 6 },
  { uf: 'MS', r: 4, c: 2 }, { uf: 'GO', r: 4, c: 3 }, { uf: 'MG', r: 4, c: 4 }, { uf: 'ES', r: 4, c: 5 }, { uf: 'SE', r: 4, c: 6 },
  { uf: 'SP', r: 5, c: 3 }, { uf: 'RJ', r: 5, c: 4 },
  { uf: 'PR', r: 6, c: 3 },
  { uf: 'SC', r: 7, c: 3 },
  { uf: 'RS', r: 8, c: 3 },
]

// Escala sequencial AZUL (clara→forte). Em fundo escuro, mais forte = mais usuários.
const AZUL = ['#1b3450', '#1e4e86', '#2f73c4', '#4f9bf0', '#8cc3ff']

export interface GeoUF {
  uf: string
  total: number
  ativos: number
}

export function BrasilMapa({
  dados,
  metrica,
}: {
  dados: GeoUF[]
  metrica: 'total' | 'ativos'
}) {
  const porUf = new Map(dados.map((d) => [d.uf, d]))
  const valores = dados.map((d) => (metrica === 'ativos' ? d.ativos : d.total))
  const max = Math.max(1, ...valores)

  // 5 faixas sequenciais; 0 = vazio (sem cor).
  function corDe(v: number): string | null {
    if (v <= 0) return null
    const faixa = Math.min(AZUL.length - 1, Math.floor((v / max) * (AZUL.length - 1) + 0.0001))
    return AZUL[faixa]
  }

  const tam = 40
  const gap = 5
  const cols = 7
  const rows = 9
  const w = cols * tam + (cols - 1) * gap
  const h = rows * tam + (rows - 1) * gap

  return (
    <div className="bmapa">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Mapa de presença por estado" className="bmapa-svg">
        {GRADE.map(({ uf, r, c }) => {
          const d = porUf.get(uf)
          const v = d ? (metrica === 'ativos' ? d.ativos : d.total) : 0
          const cor = corDe(v)
          const x = c * (tam + gap)
          const y = r * (tam + gap)
          const inkClaro = cor && v / max > 0.55
          return (
            <g key={uf}>
              <title>{`${UF_NOME[uf]} (${uf}): ${d?.total ?? 0} usuário(s), ${d?.ativos ?? 0} ativo(s)`}</title>
              <rect
                x={x}
                y={y}
                width={tam}
                height={tam}
                rx={7}
                fill={cor ?? 'transparent'}
                stroke={cor ? 'rgba(0,0,0,.25)' : 'var(--line)'}
                strokeWidth={cor ? 1 : 1}
                strokeDasharray={cor ? undefined : '3 3'}
              />
              <text
                x={x + tam / 2}
                y={y + tam / 2 - 3}
                textAnchor="middle"
                dominantBaseline="middle"
                className="bmapa-sigla"
                style={{ fill: cor ? (inkClaro ? '#06130d' : '#eaf2ff') : 'var(--muted)' }}
              >
                {uf}
              </text>
              {v > 0 && (
                <text
                  x={x + tam / 2}
                  y={y + tam / 2 + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="bmapa-num"
                  style={{ fill: inkClaro ? '#06130d' : '#eaf2ff' }}
                >
                  {v}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="bmapa-legenda">
        <span>menos</span>
        {AZUL.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>mais</span>
        <em>· {dados.reduce((s, d) => s + (metrica === 'ativos' ? d.ativos : d.total), 0)} no total · {dados.length} UF(s)</em>
      </div>
    </div>
  )
}
