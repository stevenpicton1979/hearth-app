import React from 'react'

interface HearthLogoProps {
  className?: string
  showWordmark?: boolean
}

export function HearthLogo({ className = 'h-8 w-8', showWordmark = true }: HearthLogoProps) {
  return (
    <div className="flex items-center gap-2">
      <svg
        className={className}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Hearth flame logo"
      >
        {/* Outer flame */}
        <path
          d="M16 2C16 2 8 10 8 18C8 22.418 11.582 26 16 26C20.418 26 24 22.418 24 18C24 10 16 2 16 2Z"
          fill="#047857"
        />
        {/* Inner flame highlight */}
        <path
          d="M16 10C16 10 12 15 12 19C12 21.209 13.791 23 16 23C18.209 23 20 21.209 20 19C20 15 16 10 16 10Z"
          fill="#f59e0b"
        />
        {/* Base glow */}
        <ellipse cx="16" cy="27" rx="6" ry="2" fill="#047857" opacity="0.3" />
      </svg>
      {showWordmark && (
        <span className="text-xl font-bold text-emerald-700 tracking-tight">
          Hearth
        </span>
      )}
    </div>
  )
}
