import type { SVGProps } from 'react'

/** Lucide `door-stairwell` — not yet in our pinned lucide-react. */
export function DoorStairwell({
  size = 24,
  strokeWidth = 2,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={props['aria-hidden'] ?? true}
      {...props}
    >
      <path d="M12 17v-3a1 1 0 0 1 1-1h6" />
      <path d="M19 17h-9a1 1 0 0 0-1 1v3" />
      <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" />
      <path d="M19 9h-3a1 1 0 0 0-1 1v3" />
      <path d="M22 21H2" />
    </svg>
  )
}
