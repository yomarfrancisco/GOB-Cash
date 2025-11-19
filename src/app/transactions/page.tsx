'use client'

import { useRouter } from 'next/navigation'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'

// Demo transaction data
const transactions = [
  {
    id: 1,
    amount: -512,
    currency: 'USDT',
    age: '1d ago',
    note: 'Autonomous mode sold ETH to decrease market exposure',
  },
  {
    id: 2,
    amount: 256,
    currency: 'USDT',
    age: '2d ago',
    note: 'Deposit from external wallet',
  },
  {
    id: 3,
    amount: -128,
    currency: 'USDT',
    age: '3d ago',
    note: 'Payment to @user123',
  },
  {
    id: 4,
    amount: 1024,
    currency: 'USDT',
    age: '5d ago',
    note: 'Autonomous mode bought PEPE to increase allocation',
  },
]

export default function TransactionsPage() {
  const router = useRouter()

  const handleDollarClick = () => {
    // TODO: Wire to transaction modal if needed
  }

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container">
          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <TopGlassBar />
            <BottomGlassBar currentPath="/transactions" onDollarClick={handleDollarClick} />
          </div>

          {/* Scrollable content */}
          <div className="scroll-content">
            <div className="content" style={{ background: '#fff' }}>
              {/* Header */}
              <div className="transactions-header">
                <h1 className="transactions-title">Transactions</h1>
              </div>

              {/* Transactions list */}
              <div className="transactions-list">
                {transactions.map((tx) => (
                  <div key={tx.id} className="transaction-item">
                    <div className="transaction-main">
                      <div className="transaction-amount">
                        {tx.amount > 0 ? '+' : ''} {tx.amount} {tx.currency}
                      </div>
                      <div className="transaction-age">{tx.age}</div>
                    </div>
                    <div className="transaction-note">{tx.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

