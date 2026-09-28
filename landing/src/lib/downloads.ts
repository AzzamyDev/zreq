export const VERSION = 'v1.3.0'
export const RELEASES_URL = `https://github.com/AzzamyDev/zreq/releases/tag/${VERSION}`

export interface PlatformDownload {
  label: string
  sub: string
  url: string
}

export const DOWNLOADS: Record<'windows' | 'macos' | 'linux', PlatformDownload> = {
  windows: {
    label: 'Download for Windows',
    sub: '.exe installer · x64',
    url: `https://github.com/AzzamyDev/zreq/releases/download/${VERSION}/ZReq_1.3.0_x64-setup.exe`,
  },
  macos: {
    label: 'Download for macOS',
    sub: '.dmg · Apple Silicon',
    url: `https://github.com/AzzamyDev/zreq/releases/download/${VERSION}/ZReq_1.3.0_aarch64.dmg`,
  },
  linux: {
    label: 'Download for Linux',
    sub: 'All formats on Releases',
    url: RELEASES_URL,
  },
}
