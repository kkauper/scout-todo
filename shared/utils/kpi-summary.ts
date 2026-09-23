import type { KpiReport } from './kpi'
import { localDateIso } from './dates'

function fmtDays(value: number | null): string {
  return value === null ? 'n/a' : String(value)
}

export function formatKpiSummary(r: KpiReport, scopeName: string): string {
  const { counts, overdue, cycleTime, throughput, aging, projects } = r

  const lines: string[] = []
  lines.push(`## Scout KPIs — ${scopeName} (${localDateIso(new Date(r.generatedAt))})`)
  lines.push(`- Open: ${counts.open} · WIP: ${counts.wip} · Done: ${counts.done} · Overdue: ${overdue}`)
  lines.push(`- Throughput: ${throughput.thisMonth} this month, ${throughput.last30Days} in last 30 days`)
  lines.push(`- Cycle time: avg ${fmtDays(cycleTime.avgDays)} d, median ${fmtDays(cycleTime.medianDays)} d (n=${cycleTime.sample})`)
  lines.push(`- WIP age: avg ${fmtDays(aging.wipAvgDays)} d`)
  lines.push(`- Weekly done (oldest→newest): ${throughput.weekly.map(w => w.count).join(' · ')}`)

  if (projects.length > 0) {
    lines.push('')
    lines.push('### By project')
    for (const p of projects) {
      const wip = p.byKind.active
      lines.push(`- ${p.name}: ${p.total} total, ${p.byKind.done} done, ${wip} in progress`)
    }
  }

  return lines.join('\n')
}
