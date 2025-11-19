'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import ActionSheet from './ActionSheet'
import '@/styles/bank-transfer-details-sheet.css'

type BankTransferDetailsSheetProps = {
  open: boolean
  onClose: () => void
}

const DETAILS = {
  recipient: 'MULTI - INVESTIMENTOS',
  accountNumber: '2009  8312  8100  01',
  accountType: 'Current / Cheque',
  bank: 'BCI',
  swift: 'CGDIMZMA',
  reference: 'BRICS4DC7RB',
}

export default function BankTransferDetailsSheet({
  open,
  onClose,
}: BankTransferDetailsSheetProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="bank-transfer-details" size="tall">
      <div className="bank-transfer-details-sheet">
        <div className="bank-transfer-content">
          <div className="bank-transfer-reference-pill">
            <div className="bank-transfer-reference-label">Make a deposit using the reference</div>
            <div className="bank-transfer-reference-code">{DETAILS.reference}</div>
          </div>

          <div className="bank-transfer-details-table">
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">Recipient</span>
              <span className="bank-transfer-value">{DETAILS.recipient}</span>
            </div>
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">Account number</span>
              <span className="bank-transfer-value">{DETAILS.accountNumber}</span>
            </div>
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">Account type</span>
              <span className="bank-transfer-value">{DETAILS.accountType}</span>
            </div>
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">Bank</span>
              <span className="bank-transfer-value">{DETAILS.bank}</span>
            </div>
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">SWIFT</span>
              <span className="bank-transfer-value">{DETAILS.swift}</span>
            </div>
            <div className="bank-transfer-row">
              <span className="bank-transfer-label">Reference number</span>
              <div className="bank-transfer-value-with-copy">
                <span className="bank-transfer-value">{DETAILS.reference}</span>
                <button
                  className="bank-transfer-copy-btn"
                  onClick={() => handleCopy(DETAILS.reference, 'reference number')}
                  aria-label="Copy reference number"
                  type="button"
                >
                  <Copy size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          <p className="bank-transfer-footer">
            Deposits may take up to 72 hours to clear. Use the exact reference above.
          </p>

          <div className="bank-transfer-close-bar">
            <button className="bank-transfer-close-btn" onClick={onClose} type="button">
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}

