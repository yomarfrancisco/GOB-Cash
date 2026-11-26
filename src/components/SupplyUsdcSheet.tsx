'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import ActionSheet from './ActionSheet'
import { useSupplyUsdcSheet } from '@/store/useSupplyUsdcSheet'
import { PAGA_SOLANA_TREASURY } from '@/config/solanaTreasury'
import { shortenSolanaAddress } from '@/lib/vault/solanaPayUrl'

export default function SupplyUsdcSheet() {
  const { open, solanaPayUrl, close } = useSupplyUsdcSheet()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!open || !solanaPayUrl) {
      setQrDataUrl(null)
      return
    }
    void QRCode.toDataURL(solanaPayUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [open, solanaPayUrl])

  return (
    <ActionSheet open={open} onClose={close} title="Supply USDC">
      <div style={{ padding: '8px 4px 24px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
            fontSize: 16,
            fontWeight: 650,
          }}
        >
          <Image src="/assets/phantom-icon.png" alt="" width={28} height={28} />
          Scan with Phantom
        </div>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="Solana Pay QR"
            width={280}
            height={280}
            style={{ borderRadius: 16, margin: '0 auto' }}
          />
        ) : (
          <div
            style={{
              width: 280,
              height: 280,
              margin: '0 auto',
              borderRadius: 16,
              background: '#f2f2f2',
            }}
          />
        )}
        <p style={{ margin: '16px 0 0', fontSize: 14, color: '#8e8e93', lineHeight: 1.4 }}>
          Send any USDC amount to PAGA on Solana.
          <br />
          {shortenSolanaAddress(PAGA_SOLANA_TREASURY, 6, 6)}
        </p>
        {solanaPayUrl ? (
          <button
            type="button"
            onClick={() => {
              window.open(solanaPayUrl, '_blank', 'noopener,noreferrer')
            }}
            style={{
              marginTop: 18,
              width: '100%',
              height: 52,
              borderRadius: 16,
              border: 0,
              background: '#111',
              color: '#fff',
              fontSize: 16,
              fontWeight: 650,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <Image src="/assets/phantom-icon.png" alt="" width={22} height={22} />
            Open in Phantom
          </button>
        ) : null}
      </div>
    </ActionSheet>
  )
}
