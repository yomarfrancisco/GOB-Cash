import type { ActivityItem } from '@/store/activity'
import styles from '@/app/activity/activity.module.css'

const SERIES_COLOR = ['#111111', '#8aa31a', '#8a8a8a']

function formatAxis(value: number, unit: 'ZAR' | 'MZN'): string {
  const rounded = Math.round(value)
  const compact =
    Math.abs(rounded) >= 1000
      ? `${Math.round(rounded / 100) / 10}k`
      : String(rounded)
  return unit === 'MZN' ? `${compact} Mt` : `R${compact}`
}

function DeskChart({ chart }: { chart: NonNullable<ActivityItem['deskChart']> }) {
  const width = 280
  const height = 128
  const pad = { top: 12, right: 10, bottom: 28, left: 42 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const labels = chart.series[0]?.points.map((point) => point.label) || []
  const values = chart.series.flatMap((row) => row.points.map((point) => point.value))
  const max = Math.max(1, ...values)
  const barGroup = labels.length
  const seriesCount = chart.series.length
  const groupW = barGroup ? innerW / barGroup : innerW
  const barW = Math.max(4, Math.min(16, (groupW - 8) / Math.max(1, seriesCount)))

  return (
    <div className={styles.deskChart}>
      {chart.title ? <div className={styles.deskVisualTitle}>{chart.title}</div> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.deskChartSvg} role="img" aria-label={chart.title}>
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + innerH}
          stroke="rgba(0,0,0,0.12)"
        />
        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          stroke="rgba(0,0,0,0.12)"
        />
        <text x={4} y={pad.top + 8} className={styles.deskChartAxis}>
          {formatAxis(max, chart.unit)}
        </text>
        <text x={4} y={pad.top + innerH} className={styles.deskChartAxis}>
          {formatAxis(0, chart.unit)}
        </text>
        {chart.series.map((row, seriesIndex) =>
          row.points.map((point, index) => {
            const x =
              pad.left +
              index * groupW +
              (groupW - seriesCount * barW) / 2 +
              seriesIndex * barW
            const h = (point.value / max) * innerH
            return (
              <rect
                key={`${row.label}-${point.label}`}
                x={x}
                y={pad.top + innerH - h}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                fill={SERIES_COLOR[seriesIndex % SERIES_COLOR.length]}
              />
            )
          })
        )}
        {labels.map((label, index) => (
          <text
            key={label}
            x={pad.left + index * groupW + groupW / 2}
            y={height - 8}
            textAnchor="middle"
            className={styles.deskChartAxis}
          >
            {label}
          </text>
        ))}
      </svg>
      {chart.series.length > 1 ? (
        <div className={styles.deskChartLegend}>
          {chart.series.map((row, index) => (
            <span key={row.label}>
              <i style={{ background: SERIES_COLOR[index % SERIES_COLOR.length] }} />
              {row.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DeskCardVisuals({ item }: { item: ActivityItem }) {
  if (!item.deskTable && !item.deskChart) return null
  return (
    <div className={styles.deskVisuals}>
      {item.deskTable ? (
        <div className={styles.deskTableWrap}>
          {item.deskTable.title ? <div className={styles.deskVisualTitle}>{item.deskTable.title}</div> : null}
          <table className={styles.deskTable}>
            <thead>
              <tr>
                {item.deskTable.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.deskTable.rows.map((row, index) => (
                <tr key={`${row.cells.join('|')}-${index}`}>
                  {row.cells.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {item.deskChart ? <DeskChart chart={item.deskChart} /> : null}
    </div>
  )
}
