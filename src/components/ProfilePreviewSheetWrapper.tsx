'use client'

import { useProfilePreviewSheet } from '@/store/useProfilePreviewSheet'
import ProfilePreviewSheet from './ProfilePreviewSheet'

/**
 * Wrapper component for ProfilePreviewSheet to be mounted globally in layout
 * This ensures the profile preview works from any page (home, profile, etc.)
 */
export default function ProfilePreviewSheetWrapper() {
  const { open, handle, closeSheet } = useProfilePreviewSheet()
  
  return (
    <ProfilePreviewSheet
      open={open}
      handle={handle}
      onClose={closeSheet}
    />
  )
}

