import s from './Features.module.css'

const CARDS = [
  {
    title: 'Fast Requests',
    body: 'Native desktop performance with near-zero startup time. Send requests and see responses in milliseconds — no browser overhead, no cold starts.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
      </svg>
    ),
  },
  {
    title: 'Inspect Headers',
    body: 'Full request and response header visibility at a glance. Spot CORS issues, auth tokens, caching directives, and content types without scrolling through raw text.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12h18M3 6h18M3 18h18" />
        <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="10" cy="18" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: 'Manage Cookies',
    body: 'View, edit, and persist cookies per-domain across sessions. Debug authentication flows and session state without opening browser devtools.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
]

export default function Features() {
  return (
    <section className={s.section}>
      <div className={s.grid}>
        {CARDS.map(({ title, body, icon }) => (
          <article key={title} className={s.card}>
            <div className={s.icon}>{icon}</div>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
