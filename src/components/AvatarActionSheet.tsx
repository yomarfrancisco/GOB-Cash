'use client'

import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { Image as ImageIcon, Camera, FileText, Trash2 } from 'lucide-react'

type AvatarActionSheetProps = {
  open: boolean
  onClose: () => void
  onSelect: (action: 'library' | 'camera' | 'file' | 'remove') => void
}

export default function AvatarActionSheet({
  open,
  onClose,
  onSelect,
}: AvatarActionSheetProps) {
  const handleSelect = (action: 'library' | 'camera' | 'file' | 'remove') => {
    onSelect(action)
    onClose()
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="Change profile photo">
      <ActionSheetItem
        icon={<ImageIcon size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Photo Library"
        onClick={() => handleSelect('library')}
      />
      <ActionSheetItem
        icon={<Camera size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Take a Photo"
        onClick={() => handleSelect('camera')}
      />
      <ActionSheetItem
        icon={<FileText size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Choose File"
        onClick={() => handleSelect('file')}
      />
      <ActionSheetItem
        icon={<Trash2 size={22} strokeWidth={2} style={{ color: '#111' }} />}
        title="Remove Photo"
        onClick={() => handleSelect('remove')}
      />
      <ActionSheetItem
        title="Cancel"
        onClick={onClose}
        ariaLabel="Cancel"
      />
    </ActionSheet>
  )
}

