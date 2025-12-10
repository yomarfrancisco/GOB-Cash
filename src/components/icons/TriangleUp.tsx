import React from 'react'

interface TriangleUpProps {
  size?: number
  color?: string
}

export const TriangleUp: React.FC<TriangleUpProps> = ({ size = 18, color = '#29ff63' }) => (
  <svg
    width={size * 0.85}
    height={size * 0.85}
    viewBox="0 0 24 24"
    style={{ display: 'block' }}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon
      points="12,4 20,20 4,20"
      fill={color}
      fillOpacity={1}
      style={{ opacity: 1 }}
    />
  </svg>
)

