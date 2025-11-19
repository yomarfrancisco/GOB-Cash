import React from 'react'

type Props = {
  zar: number // full-value in ZAR (e.g., 9012.34)
  usdt: number // integer or decimal (e.g., 100)
  className?: string // optional position/override
}

function splitCents(n: number) {
  const [whole, fracRaw] = n.toFixed(2).split('.')
  const frac = fracRaw ?? '00'
  // thousands separators
  const wholeFmt = Number(whole).toLocaleString('en-ZA')
  return { whole: wholeFmt, frac }
}

const CardAmounts: React.FC<Props> = ({ zar, usdt, className }) => {
  const { whole, frac } = splitCents(zar)

  return (
    <div className={`card-amounts ${className ?? ''}`}>
      <div className="card-amounts__zar" aria-label={`${zar.toFixed(2)} rand`}>
        <span className="card-amounts__symbol">R</span>
        <span className="card-amounts__whole">{whole}</span>
        <span className="card-amounts__dot">.</span>
        <span className="card-amounts__cents">{frac}</span>
      </div>
      <div className="card-amounts__usdt" aria-label={`${usdt} USDT`}>
        {usdt.toLocaleString('en-ZA')} USDT
      </div>
    </div>
  )
}

export default CardAmounts

