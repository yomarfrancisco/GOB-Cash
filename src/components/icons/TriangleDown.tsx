import React from 'react'

interface TriangleDownProps {
  size?: number
  color?: string
}

export const TriangleDown: React.FC<TriangleDownProps> = ({ size = 18, color = '#ff4d4d' }) => (
  <svg
    width={size * 0.85}
    height={size * 0.85}
    viewBox="0 0 24 24"
    style={{ display: 'block' }}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon
      points="4,4 20,4 12,20"
      fill={color}
      fillOpacity={1}
      style={{ opacity: 1 }}
    />
  </svg>
)

