import { FunctionComponent } from 'react'
import styles from './USDTWarningNote.module.css'

const USDTWarningNote: FunctionComponent = () => {
  return (
    <div className={styles.usdtWarning}>
      <img className={styles.icon} src="/assets/error.svg" alt="Warning" />
      <div className={styles.text}>
        <span className={styles.light}>
          Make sure you send to a{' '}
        </span>
        <span className={styles.bold}>
          correct and valid USDT-ERC20 address only
        </span>
        <span className={styles.light}>
          . Crypto sends can&apos;t be reversed. You won&apos;t get your money back if you send to a scam or wrong address.
        </span>
      </div>
    </div>
  )
}

export default USDTWarningNote

