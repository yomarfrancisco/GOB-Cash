'use client'

import { ReactNode } from 'react'
import { Check } from 'lucide-react'
import ActionSheet from '../ActionSheet'
import styles from './BaseEditSheet.module.css'
import '@/styles/send-details-sheet.css'

export type BaseEditSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary?: () => void | Promise<void>
  onSecondary?: () => void
  isPrimaryDisabled?: boolean
  children: ReactNode
  className?: string
}

export default function BaseEditSheet({
  open,
  onClose,
  title,
  description,
  primaryLabel = 'Save',
  secondaryLabel,
  onPrimary,
  onSecondary,
  isPrimaryDisabled = false,
  children,
  className = '',
}: BaseEditSheetProps) {
  const handlePrimaryClick = async () => {
    if (onPrimary && !isPrimaryDisabled) {
      await onPrimary()
    }
  }

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title={title}
      className={`send-details ${className}`.trim()}
      size="tall"
    >
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet&apos;s .as-close-only */}
        </div>
        <div className="send-details-fields">
          {/* Optional description */}
          {description && <p className={styles.description}>{description}</p>}

          {/* Form body (children) */}
          {children}

          {/* Primary Button */}
          {onPrimary && (
            <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
              <button
                className="send-details-pay"
                disabled={isPrimaryDisabled}
                onClick={handlePrimaryClick}
                type="button"
                style={{
                  width: '100%',
                  maxWidth: '382px',
                  height: '56px',
                  borderRadius: '56px',
                  background: isPrimaryDisabled ? '#E9E9EB' : '#FF2D55',
                  color: isPrimaryDisabled ? '#999' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '0 24px',
                  fontSize: '16px',
                  fontWeight: 500,
                  letterSpacing: '-0.32px',
                  cursor: isPrimaryDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {!isPrimaryDisabled && <Check size={18} strokeWidth={2.5} />}
                {primaryLabel}
              </button>
            </div>
          )}

          {/* Secondary Button (e.g., &quot;Remove link&quot;) */}
          {onSecondary && secondaryLabel && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={onSecondary}
                type="button"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#FF453A',
                  fontSize: '16px',
                  fontWeight: 400,
                  cursor: 'pointer',
                  padding: '8px 16px',
                  textDecoration: 'none',
                }}
              >
                {secondaryLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}

