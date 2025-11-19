/**
 * Profile utilities and API stubs
 */

/**
 * Upload avatar image to server
 * @param file - Image file to upload
 * @returns Promise resolving to the avatar URL
 */
export async function uploadAvatar(file: File): Promise<string> {
  // TODO: Wire to backend API
  // For now, return a data URL as placeholder
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      resolve(dataUrl)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Remove avatar (revert to default)
 */
export async function removeAvatar(): Promise<void> {
  // TODO: Wire to backend API
  console.log('Remove avatar')
}

