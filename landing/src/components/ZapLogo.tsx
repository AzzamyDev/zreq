interface ZapLogoProps {
  size?: number
  /** unique id suffix to avoid duplicate SVG filter/gradient ids on page */
  uid: string
}

export default function ZapLogo({ size = 32, uid }: ZapLogoProps) {
  const idBg   = `zl-bg-${uid}`
  const idZap  = `zl-zap-${uid}`
  const idGlow = `zl-glow-${uid}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 110 110"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={idBg} x1="0%" y1="0%" x2="130%" y2="130%">
          <stop offset="0%"   stopColor="#0f1623" />
          <stop offset="100%" stopColor="#090d18" />
        </linearGradient>
        <linearGradient id={idZap} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="100%" stopColor="#4f8fff" />
        </linearGradient>
        <filter id={idGlow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="110" height="110" fill={`url(#${idBg})`} rx="22" />
      <rect
        x="1" y="1" width="108" height="108" rx="21"
        fill="none" stroke="#1a2744" strokeWidth="1"
      />

      <g transform="translate(26,26) scale(2.417)">
        {/* glow layer */}
        <path
          d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
          fill="#3b82f6"
          opacity="0.3"
          filter={`url(#${idGlow})`}
        />
        {/* main zap */}
        <path
          d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
          fill={`url(#${idZap})`}
        />
      </g>
    </svg>
  )
}
