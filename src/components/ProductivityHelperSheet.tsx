'use client'

import ActionSheet from './ActionSheet'

type ProductivityHelperSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export default function ProductivityHelperSheet({ isOpen, onClose }: ProductivityHelperSheetProps) {
  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Productivity" size="tall">
      <div style={{ padding: '24px' }}>
        {/* Placeholder content - will be populated later */}
        <p>Productivity helper content coming soon...</p>
      </div>
    </ActionSheet>
  )
}

