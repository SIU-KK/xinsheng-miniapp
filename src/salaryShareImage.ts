import { formatMoney2 } from './liushuiWage'

export type SalaryShareInput = {
  rangeLabel: string
  nickname: string
  totalWage: number | null
  payQrUrl: string | null
}

const WIDTH = 720
const BG = '#121826'
const BLUE = '#4d68b7'
const BLUE_BRIGHT = '#d5e1ff'
const BLUE_DIM = 'rgba(77, 104, 183, 0.72)'
const BLUE_LINE = 'rgba(77, 104, 183, 0.28)'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('收款码加载失败'))
    img.src = src
  })
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const raw = text || ''
  if (!raw) return ['']
  const lines: string[] = []
  let line = ''
  for (const ch of raw) {
    const trial = line + ch
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = trial
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function safeFilePart(s: string): string {
  return (s || '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || '未命名'
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function downloadSalaryShareImage(
  input: SalaryShareInput,
): Promise<void> {
  const padX = 48
  const contentW = WIDTH - padX * 2
  let y = 48

  // Preload QR if present
  let qrImg: HTMLImageElement | null = null
  let qrFailed = false
  if (input.payQrUrl) {
    try {
      qrImg = await loadImage(input.payQrUrl)
    } catch {
      qrFailed = true
    }
  }

  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('无法生成图片')

  // Estimate height
  measure.font = '600 22px system-ui, sans-serif'
  const dateLines = wrapText(measure, input.rangeLabel || '—', contentW)
  measure.font = '600 28px system-ui, sans-serif'
  const nameLines = wrapText(measure, input.nickname || '—', contentW)

  const qrBox = 320
  const height =
    48 + // top pad
    28 + // title
    28 + // gap
    dateLines.length * 30 +
    20 +
    22 + // name label
    nameLines.length * 36 +
    28 +
    22 + // wage label
    56 + // wage value
    28 +
    22 + // qr label
    16 +
    qrBox +
    36 + // footer
    40 // bottom pad

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = Math.ceil(height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法生成图片')

  // Background
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Soft blue vignette
  const grad = ctx.createRadialGradient(
    WIDTH / 2,
    120,
    40,
    WIDTH / 2,
    200,
    420,
  )
  grad.addColorStop(0, 'rgba(77, 104, 183, 0.16)')
  grad.addColorStop(1, 'rgba(26, 43, 74, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, WIDTH, 360)

  // Title
  ctx.fillStyle = BLUE_DIM
  ctx.font = '500 18px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('心声 · 我的工资', WIDTH / 2, y + 18)
  y += 28 + 28

  // Date
  ctx.fillStyle = BLUE
  ctx.font = '600 22px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  for (const line of dateLines) {
    ctx.fillText(line, WIDTH / 2, y + 22)
    y += 30
  }
  y += 20

  // Name
  ctx.fillStyle = BLUE_DIM
  ctx.font = '500 16px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.fillText('名字', WIDTH / 2, y + 16)
  y += 22
  ctx.fillStyle = BLUE_BRIGHT
  ctx.font = '700 28px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  for (const line of nameLines) {
    ctx.fillText(line, WIDTH / 2, y + 28)
    y += 36
  }
  y += 28

  // Total wage
  ctx.fillStyle = BLUE_DIM
  ctx.font = '500 16px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.fillText('总工资', WIDTH / 2, y + 16)
  y += 22
  ctx.fillStyle = BLUE_BRIGHT
  ctx.font = '700 48px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.fillText(formatMoney2(input.totalWage), WIDTH / 2, y + 44)
  y += 56 + 28

  // QR section
  ctx.fillStyle = BLUE_DIM
  ctx.font = '500 16px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.fillText('收款码', WIDTH / 2, y + 16)
  y += 22 + 16

  const boxX = (WIDTH - qrBox) / 2
  const boxY = y
  // white padding like payroll QR
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, boxX, boxY, qrBox, qrBox, 12)
  ctx.fill()

  const innerPad = 16
  const inner = qrBox - innerPad * 2
  if (qrImg) {
    const iw = qrImg.naturalWidth || qrImg.width || 1
    const ih = qrImg.naturalHeight || qrImg.height || 1
    const scale = Math.min(inner / iw, inner / ih)
    const dw = iw * scale
    const dh = ih * scale
    const dx = boxX + innerPad + (inner - dw) / 2
    const dy = boxY + innerPad + (inner - dh) / 2
    try {
      ctx.drawImage(qrImg, dx, dy, dw, dh)
    } catch {
      drawQrPlaceholder(ctx, boxX, boxY, qrBox, '收款码加载失败')
    }
  } else {
    drawQrPlaceholder(
      ctx,
      boxX,
      boxY,
      qrBox,
      qrFailed ? '收款码加载失败' : '暂无收款码',
    )
  }
  y += qrBox + 28

  // Footer
  ctx.strokeStyle = BLUE_LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX, y)
  ctx.lineTo(WIDTH - padX, y)
  ctx.stroke()
  y += 18
  ctx.fillStyle = BLUE_DIM
  ctx.font = '400 13px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('仅供核对与收款参考', WIDTH / 2, y + 12)

  const nicknamePart = safeFilePart(input.nickname)
  const datePart = safeFilePart(
    (input.rangeLabel || '').replace(/[()~\uFF08\uFF09]/g, ' ').trim() || '日期',
  )
  const filename = `工资-${nicknamePart}-${datePart}.png`
  downloadDataUrl(canvas.toDataURL('image/png'), filename)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawQrPlaceholder(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxSize: number,
  text: string,
) {
  ctx.fillStyle = '#f5f0e8'
  ctx.fillRect(boxX, boxY, boxSize, boxSize)
  ctx.fillStyle = '#8a7a60'
  ctx.font = '500 20px system-ui, "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, boxX + boxSize / 2, boxY + boxSize / 2)
  ctx.textBaseline = 'alphabetic'
}
