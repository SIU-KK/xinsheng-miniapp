const MAX_DATA_URL = 1_200_000
const MAX_SIDE = 1600

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('读图失败'))
    img.src = src
  })
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读图失败'))
    reader.onload = () => {
      const raw = reader.result
      if (typeof raw !== 'string' || !raw) reject(new Error('读图失败'))
      else resolve(raw)
    }
    reader.readAsDataURL(file)
  })
}

function paint(img: HTMLImageElement, w: number, h: number, quality: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('读图失败')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function compressChatShot(file: File): Promise<string> {
  const mime = (file.type || '').toLowerCase()
  if (mime && !/^image\/(jpeg|jpg|png|webp)$/.test(mime) && !mime.startsWith('image/')) {
    throw new Error('请上传聊天截图')
  }
  const raw = await readFile(file)
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw) && raw.length <= MAX_DATA_URL) {
    return raw
  }
  const img = await loadImage(raw)
  let w = img.width || 1
  let h = img.height || 1
  if (w > MAX_SIDE || h > MAX_SIDE) {
    const scale = MAX_SIDE / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  let q = 0.86
  let out = paint(img, w, h, q)
  while (out.length > MAX_DATA_URL && q > 0.42) {
    q -= 0.1
    out = paint(img, w, h, q)
  }
  while (out.length > MAX_DATA_URL && (w > 560 || h > 560)) {
    w = Math.round(w * 0.72)
    h = Math.round(h * 0.72)
    out = paint(img, w, h, 0.68)
  }
  if (out.length > MAX_DATA_URL) throw new Error('图片太大，请裁切后再传')
  return out
}

export const CHAT_SHOT_LABEL = '【聊天截图】'
