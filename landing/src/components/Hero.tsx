import { useDetectedOS } from '../hooks/useDetectedOS.ts'
import { DOWNLOADS, RELEASES_URL, VERSION } from '../lib/downloads.ts'
import AppPreview from './AppPreview.tsx'
import s from './Hero.module.css'

const PLATFORMS = ['windows', 'macos', 'linux'] as const

const ICONS: Record<typeof PLATFORMS[number], JSX.Element> = {
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.557 10.05 4.5v6.94H3V5.557zm7.05 6.943v6.942L3 18.334v-5.834h7.05zM10.95 4.367 21 2.886v8.554h-10.05V4.367zm10.05 7.083v8.554l-10.05-1.48v-7.074H21z" />
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.22 1.3-2.2 3.88.03 3.02 2.65 4.03 2.68 4.04l-.03.1zm-3.8-17.6c.73-.88 1.22-2.11 1.09-3.34-1.05.04-2.32.7-3.07 1.58-.67.78-1.26 2.03-1.1 3.22 1.17.09 2.37-.58 3.08-1.46z" />
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 0 0 .11.277 8.8 8.8 0 0 0-1.092 1.065 8.98 8.98 0 0 0-1.065 1.609 5.78 5.78 0 0 0-.596 1.832c-.09.731.069 1.46.475 2.05.406.59 1.03.974 1.77 1.08.74.107 1.513-.095 2.162-.559.66-.464 1.137-1.146 1.34-1.938.067-.264.1-.532.1-.8 0-.534-.134-1.06-.392-1.536a4.155 4.155 0 0 0-.978-1.225c-.43-.363-.937-.635-1.48-.8.04-.4.12-.79.254-1.163.334-.952.997-1.79 1.76-2.486a12.23 12.23 0 0 0 1.4-1.6c.455-.657.793-1.38.977-2.149.135-.559.194-1.136.175-1.715.225.08.47.156.738.224 1.168.29 2.576.37 3.97.09.73-.147 1.44-.41 2.065-.78.07-.04.137-.082.204-.126a4.6 4.6 0 0 1-.071.617c-.162.901-.624 1.72-1.348 2.485-.647.683-1.427 1.28-2.192 1.857-.765.576-1.512 1.142-2.098 1.814-.586.672-.972 1.444-1.09 2.337-.114.876.03 1.78.385 2.614.354.835.895 1.553 1.557 2.09.662.537 1.432.872 2.222.894.79.022 1.57-.27 2.23-.803.66-.532 1.18-1.293 1.49-2.187.155-.446.238-.915.238-1.383 0-.78-.212-1.535-.594-2.16a6.12 6.12 0 0 0-1.504-1.752c-.567-.435-1.215-.774-1.906-.988.22-.485.544-.925.96-1.303.502-.456 1.104-.826 1.74-1.09.636-.263 1.305-.42 1.979-.44.674-.02 1.348.1 1.993.348.33.125.645.282.945.467.23.14.443.3.64.475.072.064.142.13.21.2-.46.74-.73 1.607-.73 2.5 0 .78.187 1.515.519 2.155.332.64.81 1.185 1.392 1.576.58.39 1.253.61 1.95.61.69 0 1.36-.22 1.94-.61.58-.39 1.06-.936 1.39-1.576.332-.64.52-1.375.52-2.155 0-.98-.28-1.898-.775-2.657a6.137 6.137 0 0 0 .502-.468c.285-.315.533-.668.72-1.052.39-.777.525-1.657.39-2.519a5.753 5.753 0 0 0-.886-2.231A5.724 5.724 0 0 0 20.168 6.4c-.586-.379-1.256-.62-1.958-.7a6.065 6.065 0 0 0-2.07.137c-.698.167-1.365.47-1.96.886a7.8 7.8 0 0 0-.645.543c-.35-.574-.78-1.098-1.272-1.54a8.32 8.32 0 0 0-1.658-1.085A7.84 7.84 0 0 0 12.504 0z" />
    </svg>
  ),
}

export default function Hero() {
  const os = useDetectedOS()
  const activeOS = os === 'unknown' ? 'windows' : os

  return (
    <section className={s.hero}>
      {/* ── Left: copy ── */}
      <div className={s.copy}>
        <span className={s.badge}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
          </svg>
          {VERSION} — free &amp; open source
        </span>

        <h1 className={s.headline}>
          Kirim request,<br />
          cek header &amp; cookie&nbsp;—<br />
          tanpa berat.
        </h1>

        <p className={s.sub}>
          ZReq is a fast, native desktop HTTP client. Test APIs, inspect response
          headers, and manage cookies without the bloat.
        </p>

        <div className={s.chips}>
          {PLATFORMS.map((platform) => {
            const dl = DOWNLOADS[platform]
            const isActive = platform === activeOS
            return (
              <a
                key={platform}
                className={isActive ? `${s.chip} ${s.chipActive}` : s.chip}
                href={dl.url}
                {...(dl.url.includes('releases/tag') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {ICONS[platform]}
                <span className={s.chipLabel}>
                  {dl.label}
                  <span className={s.chipSub}>{dl.sub}</span>
                </span>
              </a>
            )
          })}
        </div>

        <a
          className={s.releasesLink}
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          All releases &amp; checksums &rarr;
        </a>
      </div>

      {/* ── Right: app preview ── */}
      <div className={s.preview}>
        <AppPreview />
      </div>
    </section>
  )
}
