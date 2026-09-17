export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="Rosana">
      <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span>rosana<i>.</i></span>}
    </div>
  )
}
