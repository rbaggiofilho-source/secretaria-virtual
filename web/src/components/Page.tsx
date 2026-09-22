import type { ReactNode } from 'react'

export function PageHead({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  )
}

/** Trata carregando / erro / vazio de forma consistente. */
export function PageState({
  loading,
  error,
  empty,
  emptyMsg,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyMsg: string
  children: ReactNode
}) {
  if (error) return <div className="board-msg erro">{error}</div>
  if (loading) return <div className="board-msg">Carregando…</div>
  if (empty) return <div className="board-msg">{emptyMsg}</div>
  return <>{children}</>
}
