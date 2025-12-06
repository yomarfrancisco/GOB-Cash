'use client'

import { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
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
  description?: string | ((pageIndex: number) => string)
  pages: HelperPage[]
  currentPage: number
  className?: string
  primaryCtaForPage?: (pageIndex: number, totalPages: number) => PrimaryCtaConfig
  onPageChange?: (pageIndex: number) => void
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
}: BaseHelperSheetProps) {
  const currentPageIndex = Math.min(Math.max(0, currentPage), pages.length - 1)
  const currentPageData = pages[currentPageIndex]
  const totalPages = pages.length
  const isLastPage = currentPageIndex === totalPages - 1

  // Get title (can be string or function)
  const currentTitle = typeof title === 'function' ? title(currentPageIndex) : title
  
  // Get description (can be string or function)
  const currentDescription = description
    ? typeof description === 'function'
      ? description(currentPageIndex)
      : description
    : undefined

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

  if (!isOpen || !currentPageData || pages.length === 0) return null

  return (
    <ActionSheet
      open={isOpen}
      onClose={onClose}
      title={currentTitle}
      size="tall"
      className={`base-helper-sheet ${className}`.trim()}
    >
      <div className={styles.content}>
        <div className={styles.body}>
          {/* Optional description */}
          {currentDescription && <p className={styles.description}>{currentDescription}</p>}

          {/* Page content */}
          <div className={styles.pageContent}>{currentPageData.content}</div>
        </div>

        {/* Footer with gradient fade */}
        <div className={styles.pageFooter}>
          <div className={styles.pageParent}>
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
      </div>
    </ActionSheet>
  )
}

