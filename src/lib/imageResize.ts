/**
 * Client-side image resizing utilities
 */

export interface ResizeOptions {
  maxEdge: number // Maximum width or height in pixels
  quality?: number // JPEG quality (0-1), default 0.9
  outputType?: 'image/jpeg' | 'image/png' | 'image/webp' // Output format
}

/**
 * Resize an image file to fit within maxEdge while preserving aspect ratio
 * Preserves EXIF orientation
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions
): Promise<File> {
  const { maxEdge = 1024, quality = 0.9, outputType = 'image/jpeg' } = options

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Image resize requires browser environment'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      // Use a DOM-typed constructor that TS accepts
      const ImageCtor: new () => HTMLImageElement =
        (typeof globalThis !== 'undefined' && (globalThis as any).Image)
          ? (globalThis as any).Image
          : (class {} as unknown as new () => HTMLImageElement)
      
      const img = new ImageCtor()
      img.onload = () => {
        // Calculate new dimensions preserving aspect ratio
        let width = img.width
        let height = img.height

        if (width > maxEdge || height > maxEdge) {
          if (width > height) {
            height = (height * maxEdge) / width
            width = maxEdge
          } else {
            width = (width * maxEdge) / height
            height = maxEdge
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        // Draw image (browser handles EXIF orientation automatically)
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'))
              return
            }

            // Create new File with same name but updated extension if needed
            const fileName = file.name.replace(/\.[^/.]+$/, '')
            const extension = outputType === 'image/jpeg' ? 'jpg' : outputType.split('/')[1]
            const resizedFile = new File([blob], `${fileName}.${extension}`, {
              type: outputType,
              lastModified: Date.now(),
            })

            resolve(resizedFile)
          },
          outputType,
          quality
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

