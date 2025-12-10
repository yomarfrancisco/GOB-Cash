'use client'

import { ReactNode } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import ActionSheet from '../ActionSheet'
import styles from './BaseHelperSheet.module.css'

export type HelperPage = {
  content: ReactNode
}

export type PrimaryCtaConfig = {
  label: string
  variant: 'next' | 'done'
}

export type BaseHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
  title: string | ((pageIndex: number) => string)
  description?: string | ReactNode | ((pageIndex: number) => string | ReactNode)
  pages: HelperPage[]
  currentPage: number
  className?: string
  primaryCtaForPage?: (pageIndex: number, totalPages: number) => PrimaryCtaConfig
  onPageChange?: (pageIndex: number) => void
  // Optional features
  showBackButton?: boolean | ((pageIndex: number) => boolean) // Show back button (default: false)
  onBack?: (pageIndex: number) => void // Callback when back button clicked
  showPageLabel?: boolean | ((pageIndex: number, totalPages: number) => boolean) // Show "Page X of Y" (default: false)
  pageLabelFormatter?: (pageIndex: number, totalPages: number) => string // Custom page label format
  showFooter?: boolean // Show footer button (default: true)
  subtitle?: string | ReactNode | ((pageIndex: number) => string | ReactNode) // Optional subtitle (shown before description)
  showDivider?: boolean // Show divider after subtitle (default: false)
}

export default function BaseHelperSheet({
  isOpen,
  onClose,
  title,
  description,
  pages,
  currentPage,
  className = '',
  primaryCtaForPage,
  onPageChange,
  showBackButton = false,
  onBack,
  showPageLabel = false,
  pageLabelFormatter,
  showFooter = true,
  subtitle,
  showDivider = false,
}: BaseHelperSheetProps) {
  const currentPageIndex = Math.min(Math.max(0, currentPage), pages.length - 1)
  const currentPageData = pages[currentPageIndex]
  const totalPages = pages.length
  const isLastPage = currentPageIndex === totalPages - 1

  // Get title (can be string or function)
  const currentTitle = typeof title === 'function' ? title(currentPageIndex) : title
  
  // Get subtitle (can be string, ReactNode, or function)
  const currentSubtitle = subtitle
    ? typeof subtitle === 'function'
      ? subtitle(currentPageIndex)
      : subtitle
    : undefined
  
  // Get description (can be string, ReactNode, or function)
  const currentDescription = description
    ? typeof description === 'function'
      ? description(currentPageIndex)
      : description
    : undefined

  // Determine if back button should show
  const shouldShowBack = typeof showBackButton === 'function'
    ? showBackButton(currentPageIndex)
    : showBackButton && currentPageIndex > 0

  // Determine if page label should show
  const shouldShowPageLabel = typeof showPageLabel === 'function'
    ? showPageLabel(currentPageIndex, totalPages)
    : showPageLabel

  // Get page label text
  const getPageLabel = (): string => {
    if (pageLabelFormatter) {
      return pageLabelFormatter(currentPageIndex, totalPages)
    }
    return `Page ${currentPageIndex + 1} of ${totalPages}`
  }

  // Determine CTA label and variant
  const getCtaConfig = (): PrimaryCtaConfig => {
    if (primaryCtaForPage) {
      return primaryCtaForPage(currentPageIndex, totalPages)
    }
    // Default: Next for all pages except last, Done for last
    return {
      label: isLastPage ? 'Done' : 'Next',
      variant: isLastPage ? 'done' : 'next',
    }
  }

  const ctaConfig = getCtaConfig()

  const handleCtaClick = () => {
    if (isLastPage || ctaConfig.variant === 'done') {
      onClose()
    } else {
      // Advance to next page
      const nextPageIndex = currentPageIndex + 1
      if (onPageChange) {
        onPageChange(nextPageIndex)
      }
    }
  }

  const handleBack = () => {
    if (onBack) {
      onBack(currentPageIndex - 1)
    } else if (onPageChange && currentPageIndex > 0) {
      onPageChange(currentPageIndex - 1)
    }
  }

  if (!isOpen || !currentPageData || pages.length === 0) return null

  return (
    <ActionSheet
      open={isOpen}
      onClose={onClose}
      title="" // Empty title - we'll render custom header
      size="tall"
      className={`base-helper-sheet ${className}`.trim()}
    >
      <div className={styles.content}>
        {/* Custom header with back button and title */}
        {(shouldShowBack || currentTitle) && (
          <div className={styles.headerRow}>
            {shouldShowBack && (
              <button
                type="button"
                className={styles.backButton}
                onClick={handleBack}
              >
                <ChevronLeft size={20} strokeWidth={2} color="#0a0a0a" />
              </button>
            )}
            {currentTitle && <h2 className={styles.title}>{currentTitle}</h2>}
          </div>
        )}

        <div className={styles.body}>
          {/* Optional subtitle */}
          {currentSubtitle && (
            typeof currentSubtitle === 'string' ? (
              <p className={styles.subtitle}>{currentSubtitle}</p>
            ) : (
              <div className={styles.subtitle}>{currentSubtitle}</div>
            )
          )}
          
          {/* Optional divider */}
          {showDivider && <div className={styles.divider} />}

          {/* Optional description */}
          {currentDescription && (
            typeof currentDescription === 'string' ? (
              <p className={styles.description}>{currentDescription}</p>
            ) : (
              <div className={styles.description}>{currentDescription}</div>
            )
          )}

          {/* Page content */}
          <div className={styles.pageContent}>{currentPageData.content}</div>
        </div>

        {/* Footer with gradient fade - only show if showFooter is true */}
        {showFooter && (
          <div className={styles.pageFooter}>
            <div className={styles.pageParent}>
              {shouldShowPageLabel && (
                <div className={styles.pageLabel}>{getPageLabel()}</div>
              )}
              <div className={styles.lButtonWrapper}>
                <button
                  type="button"
                  className={`${styles.lButton} ${ctaConfig.variant === 'done' ? styles.lButtonDone : ''}`}
                  onClick={handleCtaClick}
                >
                  <div className={styles.lButtonContent}>
                    <span className={styles.lBold}>{ctaConfig.label}</span>
                    {ctaConfig.variant === 'next' && (
                      <ChevronRight size={24} strokeWidth={2} className={styles.ico24ArrowsNextUi} />
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ActionSheet>
  )
}

