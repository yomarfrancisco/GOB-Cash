'use client'

import { useEffect } from 'react'

export default function IosKeyboardShim() {
  useEffect(() => {
    // nothing; element just needs to exist in DOM
  }, [])

  return (
    <input
      id="ios-keyboard-shim"
      className="ios-keyboard-shim"
      type="text"
      inputMode="text"
      autoCapitalize="none"
      autoCorrect="off"
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}

