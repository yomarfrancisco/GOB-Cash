'use client'

import { useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { CountryCode, DEPOSIT_BANK_ACCOUNTS, MOZAMBIQUE_BANK_ACCOUNTS, SOUTH_AFRICA_BANK_ACCOUNTS, type SelectedBank, type BankAccountDetails } from '@/config/depositBankAccounts'
import '@/styles/bank-transfer-details-sheet.css'
import '@/styles/send-details-sheet.css'

type BankTransferDetailsSheetProps = {
  open: boolean
  onClose: () => void
  countryCode: CountryCode
  bank?: SelectedBank
  onBack?: () => void
  onAttachProof?: (file: File) => void | Promise<void>
  isSubmitting?: boolean
}

export default function BankTransferDetailsSheet({
  open,
  onClose,
  countryCode,
  bank,
  onBack,
  onAttachProof,
  isSubmitting = false,
}: BankTransferDetailsSheetProps) {
  let config: BankAccountDetails
  if (countryCode === 'MZ' && bank) {
    config = MOZAMBIQUE_BANK_ACCOUNTS[bank as keyof typeof MOZAMBIQUE_BANK_ACCOUNTS] ?? DEPOSIT_BANK_ACCOUNTS[countryCode]
  } else if (countryCode === 'ZA' && bank === 'FNB') {
    config = SOUTH_AFRICA_BANK_ACCOUNTS[bank]
  } else {
    config = DEPOSIT_BANK_ACCOUNTS[countryCode]
  }

  const showBackButton = !!onBack
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const DETAILS = {
    recipient: config.recipient,
    accountNumber: config.accountNumber,
    accountType: config.accountType,
    bank: config.bankName,
    swift: config.swift,
    reference: config.referencePrefix,
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DETAILS.reference)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handlePickProof = () => {
    if (isSubmitting) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onAttachProof) return
    await onAttachProof(file)
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="bank-transfer-details" size="tall">
      {showBackButton && (
        <div className="send-details-header">
          <button className="send-details-back" onClick={onBack} aria-label="Back">
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title" style={{ visibility: 'hidden' }}>Bank Details</h3>
          <div style={{ width: '32px', height: '32px' }} />
        </div>
      )}
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
                  onClick={handleCopy}
                  aria-label="Copy reference number"
                  type="button"
                >
                  <Copy size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          <p className="bank-transfer-footer">
            Deposits may take up to 72 hours to clear. Use the exact reference above. Attach a PDF proof of payment.
          </p>
          {copied ? <p className="bank-transfer-footer">Reference copied.</p> : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div className="bank-transfer-close-bar">
            <button
              className="bank-transfer-close-btn"
              onClick={onAttachProof ? handlePickProof : onClose}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? 'Uploading...' : onAttachProof ? 'UPLOAD PROOF' : 'CLOSE'}
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}
