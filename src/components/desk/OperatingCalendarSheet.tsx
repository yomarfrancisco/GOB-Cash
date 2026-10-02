'use client'

import { useMemo, useState } from 'react'
import ActionSheet from '@/components/ActionSheet'
import {
  OPERATING_MONTHS,
  activeOperatingMonth,
  formatZarShort,
} from '@/lib/desk/operatingCalendarView'
import styles from './OperatingCalendarSheet.module.css'

type Props = {
  open: boolean
  onClose: () => void
}

function cellsForMonth(monthId: string) {
  const [year, month] = monthId.split('-').map(Number)
  const first = new Date(Date.UTC(year!, month! - 1, 1))
  const startPad = (first.getUTCDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
  const cells: Array<{ date: string | null; day: number | null }> = []
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${monthId}-${String(d).padStart(2, '0')}`
    cells.push({ date, day: d })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null })
  return cells
}

export default function OperatingCalendarSheet({ open, onClose }: Props) {
  const initial = activeOperatingMonth()
  const [monthId, setMonthId] = useState(initial.id)
  const month = OPERATING_MONTHS.find((m) => m.id === monthId) || initial
  const byDate = useMemo(() => new Map(month.days.map((d) => [d.date, d])), [month])
  const cells = useMemo(() => cellsForMonth(month.id), [month.id])
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <ActionSheet open={open} onClose={onClose} title="Operating calendar" size="tall">
      <div className={styles.root}>
        <div className={styles.monthSwitch}>
          {OPERATING_MONTHS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === month.id ? styles.monthActive : styles.monthIdle}
              onClick={() => setMonthId(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className={styles.summary}>
          {month.operatingDays} operating days · {month.payments} payments · {formatZarShort(month.plannedValueZar)}
          . Sundays have no new intake. The desk shows a rolling 14-day slice; this is the full month.
        </p>
        <div className={styles.weekdays}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className={styles.grid}>
          {cells.map((cell, idx) => {
            if (!cell.date || cell.day == null) {
              return <div key={`pad-${idx}`} className={styles.empty} />
            }
            const op = byDate.get(cell.date)
            const isToday = cell.date === todayKey
            return (
              <div
                key={cell.date}
                className={[
                  styles.day,
                  op ? styles.operating : styles.idle,
                  isToday ? styles.today : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.dayNum}>{cell.day}</span>
                {op ? (
                  <>
                    <span className={styles.dayZar}>{formatZarShort(op.targetZar)}</span>
                    <span className={styles.dayCount}>{op.paymentCount} pay</span>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
        <ul className={styles.list}>
          {month.days.map((d) => (
            <li key={d.date}>
              <span>{d.date.slice(8)}</span>
              <span>{d.paymentCount} invoices</span>
              <span>{formatZarShort(d.targetZar)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ActionSheet>
  )
}
