'use client'

import { E0_MOMENTS } from '@/lib/belief/e0Preview'
import styles from './page.module.css'

const E0_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BELIEF_E0 === 'true'

export default function BeliefE0PreviewPage() {
  if (!E0_ENABLED) {
    return (
      <main className={styles.page}>
        <h1>Not found</h1>
        <p>Set NEXT_PUBLIC_ENABLE_BELIEF_E0=true for the protected explain-only preview.</p>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>E0 · explain only · not live routing</p>
        <h1>Sam route explanations</h1>
        <p className={styles.lede}>
          Production planner remains the sole action source. Belief facts explain; no Accept or Wait.
        </p>
      </header>

      <div className={styles.moments}>
        {E0_MOMENTS.map((moment) => (
          <section key={moment.id} className={styles.card} data-moment={moment.id}>
            <div className={styles.meta}>
              <h2>{moment.title}</h2>
              <p>
                Control action:{' '}
                <strong>
                  {moment.controlAction.kind}
                  {moment.controlAction.amountZar != null
                    ? ` · R${moment.controlAction.amountZar.toLocaleString('en-ZA')}`
                    : ''}
                </strong>
              </p>
              <p>Lifecycle: {moment.lifecycle}</p>
            </div>
            <div className={styles.sam} data-speaker="sam">
              <p className={styles.speaker}>Sam</p>
              {moment.samLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <p className={styles.note}>No Accept · No Wait · Chat remains read-only</p>
          </section>
        ))}
      </div>
    </main>
  )
}
