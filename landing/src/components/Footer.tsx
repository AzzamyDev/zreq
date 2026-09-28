import ZapLogo from './ZapLogo.tsx'
import s from './Footer.module.css'

const GH = 'https://github.com/AzzamyDev/zreq'

export default function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.brand}>
        <ZapLogo size={24} uid="footer" />
        ZReq
      </div>

      <span className={s.wip}>
        <span className={s.wipDot} />
        Builds in progress — more platforms coming soon
      </span>

      <p className={s.note}>
        Open source desktop HTTP client built with Tauri &amp; React.
      </p>

      <nav className={s.links} aria-label="Footer links">
        <a href={GH} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={`${GH}/releases`} target="_blank" rel="noopener noreferrer">Releases</a>
        <a href={`${GH}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">Changelog</a>
        <a href={`${GH}/issues`} target="_blank" rel="noopener noreferrer">Issues</a>
      </nav>

      <p className={s.note}>&copy; 2026 ZReq. MIT License.</p>
    </footer>
  )
}
