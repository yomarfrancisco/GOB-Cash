'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import ActionSheet from '@/components/ActionSheet'
import {
  activeOperatingMonth,
  dayHalfHourSlots,
  formatDayTitle,
  formatZarShort,
  type OperatingDayView,
} from '@/lib/desk/operatingCalendarView'
import styles from './OperatingCalendarSheet.module.css'
import '@/styles/send-details-sheet.css'

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
  const month = activeOperatingMonth()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const byDate = useMemo(() => new Map(month.days.map((d) => [d.date, d])), [month])
  const cells = useMemo(() => cellsForMonth(month.id), [month.id])
  const selectedDay: OperatingDayView | null = selectedDate ? byDate.get(selectedDate) || null : null
  const halfHours = useMemo(() => dayHalfHourSlots(selectedDay), [selectedDay])
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const inDayView = Boolean(selectedDate)

  useEffect(() => {
    if (!open) setSelectedDate(null)
  }, [open])

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title={inDayView ? '' : month.label}
      className={inDayView ? 'operating-calendar-day' : ''}
      size="tall"
    >
      {inDayView ? (
        <div className={`send-details-header ${styles.dayHeader}`}>
          <button
            type="button"
            className="send-details-back"
            onClick={() => setSelectedDate(null)}
            aria-label="Back to month"
          >
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title">{formatDayTitle(selectedDate!)}</h3>
          <button type="button" className="send-details-close" onClick={onClose} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
        </div>
      ) : null}

      <div className={styles.root}>
        {inDayView ? (
          <div className={styles.dayView}>
            <div className={styles.timeline}>
              {halfHours.map((row) => (
                <div
                  key={row.startMin}
                  className={[styles.slotRow, row.payment ? styles.slotActive : styles.slotIdle]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={styles.slotTime}>
                    {row.payment ? row.payment.timeSast : row.label}
                  </span>
                  {row.payment ? (
                    <span className={styles.slotPay}>{formatZarShort(row.payment.amountZar)}</span>
                  ) : (
                    <span className={styles.slotEmpty} />
                  )}
                </div>
              ))}
            </div>
            {!selectedDay ? (
              <p className={styles.idleNote}>No new intake on this day.</p>
            ) : null}
          </div>
        ) : (
          <>
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
                  <button
                    key={cell.date}
                    type="button"
                    className={[
                      styles.day,
                      op ? styles.operating : styles.idle,
                      isToday ? styles.today : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedDate(cell.date)}
                    aria-label={`${formatDayTitle(cell.date)}${op ? `, ${formatZarShort(op.targetZar)}` : ''}`}
                  >
                    <span className={styles.dayNum}>{cell.day}</span>
                    {op ? <span className={styles.dayZar}>{formatZarShort(op.targetZar)}</span> : null}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ActionSheet>
  )
}
