import type { ReactNode } from 'react'

/**
 * Standard 14x14 Chevron Down Outline SVG matching DSH IconChevronDownOutline14
 */
export function ChevronDownIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Nerd Font Prompt / Terminal / Message Icon
 * Standard Prompt / Terminal glyph 󰞋 / 󰘳 or Terminal Prompt SVG
 */
export function PromptNerdIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Nerd Font Prompt / Terminal chevron & underscore: `> _` */}
      <path
        d="M3.5 4.5L7 8L3.5 11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
