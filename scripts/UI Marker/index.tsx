import {
  Button,
  Canvas,
  Capsule,
  Circle,
  EnvironmentValuesReader,
  GeometryReader,
  HStack,
  Image,
  MagnifyGesture,
  Navigation,
  Rectangle,
  Script,
  Spacer,
  Text,
  VStack,
  ZStack,
  useRef,
  useState,
} from "scripting"

type Point = { x: number; y: number }
type DistanceMark = { kind: "distance"; axis: "h" | "v"; a: Point; b: Point }
type RectMark = { kind: "rect"; a: Point; b: Point }
type Mark = DistanceMark | RectMark
type Mode = "pan" | "distance" | "rect"
type Handle = { index: number; endpoint: "a" | "b" }
type SnapKind = "none" | "edge" | "align"
type SnapState = { x: boolean; y: boolean; xKind: SnapKind; yKind: SnapKind }
type PixelBuffer = {
  width: number
  height: number
  colorType: number
  bytesPerPixel: number
  rowBytes: number
  rows: Uint8Array
  palette: Uint8Array | null
}
type EdgeMaps = {
  width: number
  height: number
  vertical: Uint8Array
  horizontal: Uint8Array
}
type EncodedImageSource = {
  data: any
  mimeType: "image/png" | "image/jpeg"
}

const RED = "#FF3B30"
const MUTED = "#8E8E93"
const WORKSPACE_MARGIN = 180
const EXPORT_MARGIN_PT = 64
const MIN_ZOOM = 0.25
const MAX_ZOOM = 12


function readU32BE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  ) >>> 0
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePNGData(pngData: any): PixelBuffer | null {
  try {
    const png = pngData?.toUint8Array?.() ?? null
    if (png == null || png.length < 33) return null

    const signature = [137, 80, 78, 71, 13, 10, 26, 10]
    for (let i = 0; i < signature.length; i++) {
      if (png[i] !== signature[i]) return null
    }

    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = -1
    let interlace = 0
    let palette: Uint8Array | null = null
    const idatParts: Uint8Array[] = []

    let offset = 8
    while (offset + 12 <= png.length) {
      const length = readU32BE(png, offset)
      const typeStart = offset + 4
      const dataStart = offset + 8
      const dataEnd = dataStart + length
      if (dataEnd + 4 > png.length) return null

      const type = String.fromCharCode(
        png[typeStart], png[typeStart + 1], png[typeStart + 2], png[typeStart + 3]
      )

      if (type === "IHDR") {
        width = readU32BE(png, dataStart)
        height = readU32BE(png, dataStart + 4)
        bitDepth = png[dataStart + 8]
        colorType = png[dataStart + 9]
        interlace = png[dataStart + 12]
      } else if (type === "PLTE") {
        palette = png.slice(dataStart, dataEnd)
      } else if (type === "IDAT") {
        idatParts.push(png.slice(dataStart, dataEnd))
      } else if (type === "IEND") {
        break
      }

      offset = dataEnd + 4
    }

    if (width <= 0 || height <= 0 || interlace !== 0) return null
    if (bitDepth !== 8 && bitDepth !== 16) return null
    if (colorType === 3 && bitDepth !== 8) return null

    const channels =
      colorType === 6 ? 4 :
      colorType === 2 ? 3 :
      colorType === 4 ? 2 :
      colorType === 0 ? 1 :
      colorType === 3 ? 1 : 0

    if (channels === 0 || idatParts.length === 0) return null
    if (colorType === 3 && palette == null) return null

    let compressedLength = 0
    for (const part of idatParts) compressedLength += part.length
    const compressed = new Uint8Array(compressedLength)
    let cursor = 0
    for (const part of idatParts) {
      compressed.set(part, cursor)
      cursor += part.length
    }

    const compressedData = Data.fromUint8Array(compressed)
    if (compressedData == null) return null
    const inflated = compressedData
      .decompressed(CompressionAlgorithm.zlib)
      .toUint8Array()
    if (inflated == null) return null

    const sampleBytes = bitDepth === 16 ? 2 : 1
    const filterBytesPerPixel = channels * sampleBytes
    const encodedRowBytes = width * filterBytesPerPixel
    const expected = height * (encodedRowBytes + 1)
    if (inflated.length < expected) return null

    // PNG filtering is defined on encoded bytes. Unfilter at the original
    // bit depth first, then normalize 16-bit samples to 8-bit for the rest
    // of the app. That keeps snapping/export on one stable PixelBuffer shape.
    const decodedRows = new Uint8Array(encodedRowBytes * height)
    let inputOffset = 0

    for (let y = 0; y < height; y++) {
      const filter = inflated[inputOffset++]
      const rowStart = y * encodedRowBytes
      const prevStart = (y - 1) * encodedRowBytes

      for (let x = 0; x < encodedRowBytes; x++) {
        const raw = inflated[inputOffset++]
        const left = x >= filterBytesPerPixel
          ? decodedRows[rowStart + x - filterBytesPerPixel]
          : 0
        const up = y > 0 ? decodedRows[prevStart + x] : 0
        const upLeft = y > 0 && x >= filterBytesPerPixel
          ? decodedRows[prevStart + x - filterBytesPerPixel]
          : 0

        let value = raw
        if (filter === 1) value = raw + left
        else if (filter === 2) value = raw + up
        else if (filter === 3) value = raw + Math.floor((left + up) / 2)
        else if (filter === 4) value = raw + paethPredictor(left, up, upLeft)
        else if (filter !== 0) return null

        decodedRows[rowStart + x] = value & 0xff
      }
    }

    if (bitDepth === 8) {
      return {
        width,
        height,
        colorType,
        bytesPerPixel: channels,
        rowBytes: width * channels,
        rows: decodedRows,
        palette,
      }
    }

    // 16-bit PNG: normalize each channel to 8-bit. PNG samples are big-endian;
    // using the high byte is the exact /256 mapping and avoids large temporary
    // numeric arrays.
    const rowBytes = width * channels
    const rows = new Uint8Array(rowBytes * height)
    for (let i = 0, j = 0; i < decodedRows.length; i += 2, j++) {
      rows[j] = decodedRows[i]
    }

    return {
      width,
      height,
      colorType,
      bytesPerPixel: channels,
      rowBytes,
      rows,
      palette,
    }
  } catch (_) {
    return null
  }
}

function pngDataFromImage(image: any): any | null {
  try {
    // Data.fromPNG is the documented canonical UIImage -> PNG Data path.
    const data = Data.fromPNG?.(image) ?? null
    if (data != null) return data
  } catch (_) {}

  try {
    return image?.toPNGData?.() ?? null
  } catch (_) {
    return null
  }
}

function decodePNGPixelBuffer(image: any): PixelBuffer | null {
  const direct = decodePNGData(pngDataFromImage(image))
  if (direct != null) return direct

  // Some Photos images carry wide-color/HDR/orientation backing formats that
  // may encode to a PNG shape our lightweight decoder intentionally does not
  // support (for example interlaced or unusual source bit depth). Rasterizing
  // once through UIImage normalizes the backing image before retrying.
  try {
    const width = Math.max(1, Math.round(Number(image?.width ?? 0)))
    const height = Math.max(1, Math.round(Number(image?.height ?? 0)))
    if (width <= 0 || height <= 0) return null

    const normalized = image?.renderedIn?.({ width, height }) ?? null
    if (normalized == null) return null
    return decodePNGData(pngDataFromImage(normalized))
  } catch (_) {
    return null
  }
}

function rgbDistancePixels(
  buffer: PixelBuffer,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const a = y1 * buffer.rowBytes + x1 * buffer.bytesPerPixel
  const b = y2 * buffer.rowBytes + x2 * buffer.bytesPerPixel

  if (buffer.colorType === 6 || buffer.colorType === 2) {
    return (
      Math.abs(buffer.rows[a] - buffer.rows[b]) +
      Math.abs(buffer.rows[a + 1] - buffer.rows[b + 1]) +
      Math.abs(buffer.rows[a + 2] - buffer.rows[b + 2])
    ) / 3
  }

  if (buffer.colorType === 0 || buffer.colorType === 4) {
    return Math.abs(buffer.rows[a] - buffer.rows[b])
  }

  if (buffer.colorType === 3 && buffer.palette != null) {
    const pa = buffer.rows[a] * 3
    const pb = buffer.rows[b] * 3
    return (
      Math.abs((buffer.palette[pa] ?? 0) - (buffer.palette[pb] ?? 0)) +
      Math.abs((buffer.palette[pa + 1] ?? 0) - (buffer.palette[pb + 1] ?? 0)) +
      Math.abs((buffer.palette[pa + 2] ?? 0) - (buffer.palette[pb + 2] ?? 0))
    ) / 3
  }

  return 0
}

function buildEdgeMaps(buffer: PixelBuffer): EdgeMaps {
  const { width, height } = buffer
  const size = width * height
  const vertical = new Uint8Array(size)
  const horizontal = new Uint8Array(size)
  const raw = new Uint8Array(size)

  // Vertical edge primitive: difference between x-1 and x.
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 1; x < width; x++) {
      raw[row + x] = Math.round(rgbDistancePixels(buffer, x - 1, y, x, y))
    }
  }

  // Same 9-pixel orthogonal average as the previous live edge detector,
  // but calculated once when the image is imported.
  for (let x = 1; x < width; x++) {
    let sum = 0
    let count = 0
    const firstEnd = Math.min(height - 1, 4)
    for (let yy = 0; yy <= firstEnd; yy++) {
      sum += raw[yy * width + x]
      count++
    }

    for (let y = 0; y < height; y++) {
      vertical[y * width + x] = Math.round(sum / Math.max(1, count))
      const leaving = y - 4
      const entering = y + 5
      if (leaving >= 0) {
        sum -= raw[leaving * width + x]
        count--
      }
      if (entering < height) {
        sum += raw[entering * width + x]
        count++
      }
    }
  }

  raw.fill(0)

  // Horizontal edge primitive: difference between y-1 and y.
  for (let y = 1; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      raw[row + x] = Math.round(rgbDistancePixels(buffer, x, y - 1, x, y))
    }
  }

  for (let y = 1; y < height; y++) {
    const row = y * width
    let sum = 0
    let count = 0
    const firstEnd = Math.min(width - 1, 4)
    for (let xx = 0; xx <= firstEnd; xx++) {
      sum += raw[row + xx]
      count++
    }

    for (let x = 0; x < width; x++) {
      horizontal[row + x] = Math.round(sum / Math.max(1, count))
      const leaving = x - 4
      const entering = x + 5
      if (leaving >= 0) {
        sum -= raw[row + leaving]
        count--
      }
      if (entering < width) {
        sum += raw[row + entering]
        count++
      }
    }
  }

  return { width, height, vertical, horizontal }
}

function findVisualEdge(
  maps: EdgeMaps | null,
  p: Point,
  axis: "x" | "y",
  radius: number
): number | null {
  if (maps == null) return null

  const center = axis === "x" ? p.x : p.y
  const max = axis === "x" ? maps.width - 1 : maps.height - 1
  const from = Math.max(1, Math.round(center - radius))
  const to = Math.min(max, Math.round(center + radius))
  const fixedX = Math.max(0, Math.min(maps.width - 1, Math.round(p.x)))
  const fixedY = Math.max(0, Math.min(maps.height - 1, Math.round(p.y)))

  let bestPos = -1
  let bestScore = 0
  let secondScore = 0

  for (let pos = from; pos <= to; pos++) {
    const score = axis === "x"
      ? maps.vertical[fixedY * maps.width + pos]
      : maps.horizontal[pos * maps.width + fixedX]

    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestPos = pos
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  if (bestPos < 0 || bestScore < 10) return null
  if (secondScore > 0 && bestScore < 24 && bestScore < secondScore * 1.5) return null
  return bestPos
}


function exportPt(px: number, layoutScale: number) {
  const pt = px / Math.max(0.001, layoutScale)
  return Math.abs(pt - Math.round(pt)) < 0.05
    ? `${Math.round(pt)}`
    : pt.toFixed(1)
}

function exportLabel(mark: Mark, layoutScale: number) {
  if (mark.kind === "rect") {
    const w = Math.abs(mark.b.x - mark.a.x)
    const h = Math.abs(mark.b.y - mark.a.y)
    return `${Math.round(w)}×${Math.round(h)}px / ${exportPt(w, layoutScale)}×${exportPt(h, layoutScale)}pt`
  }

  const px = mark.axis === "h"
    ? Math.abs(mark.b.x - mark.a.x)
    : Math.abs(mark.b.y - mark.a.y)
  return `${mark.axis === "h" ? "X" : "Y"} ${Math.round(px)}px / ${exportPt(px, layoutScale)}pt`
}

function encodedImageSource(image: any): EncodedImageSource | null {
  const png = pngDataFromImage(image)
  if (png != null) return { data: png, mimeType: "image/png" }

  try {
    const jpeg = Data.fromJPEG?.(image, 1) ?? null
    if (jpeg != null) return { data: jpeg, mimeType: "image/jpeg" }
  } catch (_) {}

  return null
}

async function renderAnnotatedPNGInWebView(
  source: EncodedImageSource,
  sourceWidth: number,
  sourceHeight: number,
  marks: Mark[],
  layoutScale: number
): Promise<any | null> {
  const base64 = source.data?.toBase64String?.() ?? null
  if (typeof base64 !== "string" || base64.length === 0) return null

  const exportMarks = marks.map((mark: Mark) => ({
    ...mark,
    label: exportLabel(mark, layoutScale),
  }))

  const config = JSON.stringify({
    sourceWidth: Math.max(1, Number(sourceWidth) || 1),
    sourceHeight: Math.max(1, Number(sourceHeight) || 1),
    layoutScale: Math.max(0.001, Number(layoutScale) || 1),
    marks: exportMarks,
  }).replace(/</g, "\\u003c")

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#000;overflow:hidden">
<img id="source" src="data:${source.mimeType};base64,${base64}" style="display:none">
<canvas id="out"></canvas>
<script>
const CONFIG = ${config};
window.__exportResult = null;
window.__exportError = null;

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function renderExport() {
  try {
    const img = document.getElementById('source');
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) {
      window.__exportError = 'source-image-not-ready';
      return;
    }

    const canvas = document.getElementById('out');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      window.__exportError = 'canvas-context-unavailable';
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const sx = canvas.width / CONFIG.sourceWidth;
    const sy = canvas.height / CONFIG.sourceHeight;
    const lineScale = (sx + sy) / 2;
    const lineWidth = Math.max(2, 1.5 * CONFIG.layoutScale * lineScale);
    const cap = Math.max(8, 10 * CONFIG.layoutScale * lineScale);
    const fontSize = Math.max(12, 11 * CONFIG.layoutScale * lineScale);
    const gap = Math.max(6, 6 * CONFIG.layoutScale * lineScale);
    const padX = Math.max(6, 4 * CONFIG.layoutScale * lineScale);
    const padY = Math.max(4, 3 * CONFIG.layoutScale * lineScale);

    function px(p) { return { x: p.x * sx, y: p.y * sy }; }
    function strokeLine(a, b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#FF3B30';
    ctx.fillStyle = '#FF3B30';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    for (const mark of CONFIG.marks) {
      const a = px(mark.a), b = px(mark.b);

      if (mark.kind === 'rect') {
        const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
        ctx.strokeRect(left, top, right - left, bottom - top);
      } else if (mark.axis === 'h') {
        strokeLine(a, b);
        strokeLine({x:a.x, y:a.y-cap/2}, {x:a.x, y:a.y+cap/2});
        strokeLine({x:b.x, y:b.y-cap/2}, {x:b.x, y:b.y+cap/2});
      } else {
        strokeLine(a, b);
        strokeLine({x:a.x-cap/2, y:a.y}, {x:a.x+cap/2, y:a.y});
        strokeLine({x:b.x-cap/2, y:b.y}, {x:b.x+cap/2, y:b.y});
      }

      ctx.font = '600 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const metrics = ctx.measureText(mark.label);
      const textH = fontSize * 1.2;
      const boxW = metrics.width + padX * 2;
      const boxH = textH + padY * 2;
      let cx = (a.x + b.x) / 2;
      let cy = (a.y + b.y) / 2;

      if (mark.kind === 'rect') {
        const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
        cy = top - boxH / 2 - gap;
        if (cy - boxH / 2 < 0) cy = bottom + boxH / 2 + gap;
      } else if (mark.axis === 'h') {
        cy = a.y - boxH / 2 - gap;
        if (cy - boxH / 2 < 0) cy = a.y + boxH / 2 + gap;
      } else {
        cx = a.x + boxW / 2 + gap;
        if (cx + boxW / 2 > canvas.width) cx = a.x - boxW / 2 - gap;
      }

      const x = Math.max(2, Math.min(canvas.width - boxW - 2, cx - boxW / 2));
      const y = Math.max(2, Math.min(canvas.height - boxH - 2, cy - boxH / 2));

      ctx.fillStyle = 'rgba(255,59,48,0.94)';
      roundedRect(ctx, x, y, boxW, boxH, boxH / 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(mark.label, x + padX, y + boxH / 2);
      ctx.strokeStyle = '#FF3B30';
    }

    const url = canvas.toDataURL('image/png');
    window.__exportResult = url.slice(url.indexOf(',') + 1);
  } catch (e) {
    window.__exportError = String(e && e.message ? e.message : e);
  }
}

window.addEventListener('load', renderExport, { once: true });
</script></body></html>`

  const webView = new WebViewController({ ephemeral: true })
  try {
    const loaded = await webView.loadHTML(html)
    if (!loaded) return null
    await webView.waitForLoad()

    // load event includes the embedded data-URI image. If a host/WebKit timing
    // edge case leaves the result unset, explicitly render once more.
    let result = await webView.evaluateJavaScript<string | null>(
      'return window.__exportResult || null'
    )
    if (typeof result !== "string" || result.length === 0) {
      result = await webView.evaluateJavaScript<string | null>(
        'renderExport(); return window.__exportResult || null'
      )
    }
    if (typeof result !== "string" || result.length === 0) return null
    return Data.fromBase64String(result)
  } catch (_) {
    return null
  } finally {
    webView.dispose()
  }
}

function MarkerView({ deviceScale }: { deviceScale: number }) {
  const dismiss = Navigation.useDismiss()

  const [image, setImage] = useState<any>(null)
  const [mode, setMode] = useState<Mode>("pan")
  const [zoom, setZoom] = useState(1)
  const [zoomBase, setZoomBase] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [panBase, setPanBase] = useState<Point>({ x: 0, y: 0 })
  const [draft, setDraft] = useState<Mark | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const [layoutScale, setLayoutScale] = useState(deviceScale)
  const [selectedMark, setSelectedMark] = useState<number | null>(null)
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null)
  const [viewportMoving, setViewportMoving] = useState(false)
  const [snapState, setSnapState] = useState<SnapState>({ x: false, y: false, xKind: "none", yKind: "none" })
  const [draftSnapState, setDraftSnapState] = useState<SnapState>({ x: false, y: false, xKind: "none", yKind: "none" })

  const activeHandleRef = useRef<Handle | null>()
  const marksRef = useRef<Mark[]>()
  const pixelBufferRef = useRef<PixelBuffer | null>()
  const sourcePNGDataRef = useRef<any | null>()
  const sourceEncodedRef = useRef<EncodedImageSource | null>()
  const edgeMapsRef = useRef<EdgeMaps | null>()
  const draftStartRef = useRef<{ point: Point; state: SnapState } | null>()
  marksRef.current = marks

  function cycleLayoutScale() {
    const next = layoutScale === 1 ? 2 : layoutScale === 2 ? 3 : 1
    setLayoutScale(next)
  }

  async function pickImage() {
    const images = await Photos.pickPhotos(1)
    const selected = images?.at(0)
    if (selected == null) return

    const effectiveScale = deviceScale > 0 ? deviceScale : 1

    const encoded = encodedImageSource(selected)
    sourceEncodedRef.current = encoded
    sourcePNGDataRef.current = encoded?.mimeType === "image/png" ? encoded.data : null
    const decoded = decodePNGData(sourcePNGDataRef.current) ?? decodePNGPixelBuffer(selected)
    pixelBufferRef.current = decoded
    edgeMapsRef.current = decoded == null ? null : buildEdgeMaps(decoded)
    draftStartRef.current = null

    setImage(selected)
    setLayoutScale(effectiveScale)
    setMode("pan")
    setZoom(1)
    setZoomBase(1)
    setPan({ x: 0, y: 0 })
    setPanBase({ x: 0, y: 0 })
    setDraft(null)
    setMarks([])
    setSelectedMark(null)
    setActiveHandle(null)
    setViewportMoving(false)
    setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    activeHandleRef.current = null
    draftStartRef.current = null

  }

  async function exportAnnotatedImage() {
    if (image == null) {
      await Dialog.alert({ title: "导出图片", message: "请先导入图片。" })
      return
    }

    const currentMarks = marksRef.current ?? marks
    let source = sourceEncodedRef.current ?? encodedImageSource(image)
    if (source != null) sourceEncodedRef.current = source

    if (source == null) {
      await Dialog.alert({
        title: "导出失败",
        message: "当前图片无法由系统编码为 PNG/JPEG 数据。",
      })
      return
    }

    // No annotations: preserve the source image directly and avoid any raster pass.
    if (currentMarks.length === 0) {
      const success = await Photos.savePhoto(source.data, {
        fileName: `UI-Marker-${Date.now()}.${source.mimeType === "image/png" ? "png" : "jpg"}`,
      })
      await Dialog.alert({
        title: success ? "已导出" : "导出失败",
        message: success ? "原图已保存到照片。" : "未能保存到系统照片。",
      })
      return
    }

    const png = await renderAnnotatedPNGInWebView(
      source,
      Number(image.width),
      Number(image.height),
      currentMarks,
      layoutScale
    )

    if (png == null) {
      await Dialog.alert({
        title: "导出失败",
        message: "标注图合成失败。源图数据有效，但 WebView Canvas 未能生成 PNG。",
      })
      return
    }

    const success = await Photos.savePhoto(png, {
      fileName: `UI-Marker-${Date.now()}.png`,
    })

    await Dialog.alert({
      title: success ? "已导出" : "导出失败",
      message: success
        ? `${Math.round(Number(image.width))}×${Math.round(Number(image.height))}px 标注图已保存到照片。`
        : "PNG 已生成，但未能保存到系统照片。",
    })
  }

  function resetView() {
    setZoom(1)
    setZoomBase(1)
    setPan({ x: 0, y: 0 })
    setPanBase({ x: 0, y: 0 })
    setDraft(null)
    setSelectedMark(null)
    setActiveHandle(null)
    setViewportMoving(false)
    setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    activeHandleRef.current = null
    draftStartRef.current = null
  }

  function undo() {
    if (marks.length === 0) {
      return
    }

    const next = marks.slice(0, -1)
    marksRef.current = next
    setMarks(next)
    setDraft(null)
    setSelectedMark(null)
    setActiveHandle(null)
    setViewportMoving(false)
    setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    activeHandleRef.current = null
    draftStartRef.current = null
  }

  function deleteMark(index: number) {
    const current = marksRef.current ?? marks
    if (index < 0 || index >= current.length) return

    const next = current.filter((_: Mark, i: number) => i !== index)
    marksRef.current = next
    setMarks(next)
    setSelectedMark(null)
    setActiveHandle(null)
    activeHandleRef.current = null
    draftStartRef.current = null
    setDraft(null)
    setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
  }

  async function showMarkActions(index: number) {
    const current = marksRef.current ?? marks
    if (index < 0 || index >= current.length) return

    const choice = await Dialog.actionSheet({
      title: "标注操作",
      message: "选择要执行的操作",
      cancelButton: true,
      actions: [
        { label: "删除", destructive: true },
      ],
    })

    if (choice === 0) {
      deleteMark(index)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setDraft(null)
    setSelectedMark(null)
    setActiveHandle(null)
    setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
    activeHandleRef.current = null
    draftStartRef.current = null
  }

  function selectMark(index: number) {
    const current = marksRef.current ?? marks
    const mark = current[index]
    if (mark == null) return

    if (selectedMark === index) {
      setSelectedMark(null)
      setActiveHandle(null)
      activeHandleRef.current = null
    draftStartRef.current = null
      return
    }

    setSelectedMark(index)
    setMode(mark.kind === "distance" ? "distance" : "rect")
    setDraft(null)
    setActiveHandle(null)
    activeHandleRef.current = null
    draftStartRef.current = null
  }

  function modeIcon(symbol: string, target: Mode) {
    const active = mode === target
    return (
      <Button
        buttonStyle="plain"
        action={() => switchMode(target)}
      >
        <ZStack
          frame={{ width: 42, height: 42 }}
          background={active ? <Circle fill={"tertiaryLabel"} /> : undefined}
        >
          <Image
            systemName={symbol}
            frame={{ width: 22, height: 22 }}
            symbolRenderingMode="hierarchical"
          />
        </ZStack>
      </Button>
    )
  }

  function iconButton(symbol: string, action: () => void) {
    return (
      <Button buttonStyle="plain" action={action}>
        <ZStack frame={{ width: 42, height: 42 }}>
          <Image
            systemName={symbol}
            frame={{ width: 22, height: 22 }}
            symbolRenderingMode="hierarchical"
          />
        </ZStack>
      </Button>
    )
  }

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background="quaternaryLabel"
    >
      <GeometryReader>
        {(proxy: any) => {
          const safeWidth = Number(proxy.size.width)
          const safeHeight = Number(proxy.size.height)
          const safeTop = Number(proxy.safeAreaInsets?.top ?? 0)
          const safeBottom = Number(proxy.safeAreaInsets?.bottom ?? 0)
          const safeLeading = Number(proxy.safeAreaInsets?.leading ?? 0)
          const safeTrailing = Number(proxy.safeAreaInsets?.trailing ?? 0)

          // GeometryReader is currently laid out in the safe-area container.
          // Reconstruct one full-screen viewport and use it everywhere below.
          const cw = safeWidth + safeLeading + safeTrailing
          const ch = safeHeight + safeTop + safeBottom
          const viewportOffsetX = (safeTrailing - safeLeading) / 2
          const viewportOffsetY = (safeBottom - safeTop) / 2

          const pixelBuffer = pixelBufferRef.current ?? null
          const iw = image == null
            ? 1
            : Number(pixelBuffer?.width ?? image.width)
          const ih = image == null
            ? 1
            : Number(pixelBuffer?.height ?? image.height)

          // One canonical transform for BOTH the rendered image and annotations.
          // Source coordinates are always source-image pixels.
          const fit = image == null ? 1 : Math.max(cw / iw, ch / ih)
          const baseW = iw * fit
          const baseH = ih * fit
          const scaledW = baseW * zoom
          const scaledH = baseH * zoom
          const imageLeft = cw / 2 + pan.x - scaledW / 2
          const imageTop = ch / 2 + pan.y - scaledH / 2

          function sourcePoint(p: Point): Point {
            const x = ((p.x - imageLeft) / Math.max(0.001, scaledW)) * iw
            const y = ((p.y - imageTop) / Math.max(0.001, scaledH)) * ih

            return {
              x: Math.round(Math.max(0, Math.min(iw, x))),
              y: Math.round(Math.max(0, Math.min(ih, y))),
            }
          }

          function screenPoint(p: Point): Point {
            return {
              x: imageLeft + (p.x / iw) * scaledW,
              y: imageTop + (p.y / ih) * scaledH,
            }
          }

          function clampPan(next: Point, atZoom: number): Point {
            const nextScaledW = baseW * atZoom
            const nextScaledH = baseH * atZoom

            // The workspace extends beyond the real image. At the pan limit,
            // the workspace edge reaches the viewport edge while the actual
            // image edge remains WORKSPACE_MARGIN points inside the viewport.
            const maxX = Math.max(
              0,
              (nextScaledW - cw) / 2 + WORKSPACE_MARGIN
            )
            const maxY = Math.max(
              0,
              (nextScaledH - ch) / 2 + WORKSPACE_MARGIN
            )

            return {
              x: Math.max(-maxX, Math.min(maxX, next.x)),
              y: Math.max(-maxY, Math.min(maxY, next.y)),
            }
          }

        function dominantSnapKind(state: SnapState): SnapKind {
          if (state.xKind === "edge" || state.yKind === "edge") return "edge"
          if (state.xKind === "align" || state.yKind === "align") return "align"
          return "none"
        }

        function snapAxis(
          p: Point,
          axis: "x" | "y",
          editingIndex: number
        ): { value: number; snapped: boolean; kind: SnapKind } {
          const current = marksRef.current ?? marks
          const limit = axis === "x" ? iw : ih
          const candidates: number[] = [0, limit]

          current.forEach((m: Mark, index: number) => {
            if (index === editingIndex) return
            if (axis === "x") candidates.push(m.a.x, m.b.x)
            else candidates.push(m.a.y, m.b.y)
          })

          const visualRadius = Math.max(
            2,
            Math.min(14, Math.round(10 / Math.max(0.001, fit * zoom)))
          )
          const alignThreshold = Math.max(1, 7 / Math.max(0.001, fit * zoom))
          const rawValue = axis === "x" ? p.x : p.y
          const edge = findVisualEdge(edgeMapsRef.current ?? null, p, axis, visualRadius)

          if (edge != null) {
            return { value: edge, snapped: true, kind: "edge" }
          }

          let value = Math.round(rawValue)
          let best = alignThreshold + 1
          for (const candidate of candidates) {
            const d = Math.abs(candidate - rawValue)
            if (d <= alignThreshold && d < best) {
              best = d
              value = Math.round(candidate)
            }
          }

          return {
            value: Math.max(0, Math.min(limit, value)),
            snapped: best <= alignThreshold,
            kind: best <= alignThreshold ? "align" : "none",
          }
        }

        function snapGuidePoint(
          p: Point,
          editingIndex: number
        ): { point: Point; state: SnapState } {
          const sx = snapAxis(p, "x", editingIndex)
          const sy = snapAxis(p, "y", editingIndex)
          return {
            point: { x: sx.value, y: sy.value },
            state: {
              x: sx.snapped,
              y: sy.snapped,
              xKind: sx.kind,
              yKind: sy.kind,
            },
          }
        }

        function snapSourcePoint(
          p: Point,
          editingIndex: number,
          mark: Mark
        ): { point: Point; state: SnapState } {
          if (mark.kind === "rect") return snapGuidePoint(p, editingIndex)

          if (mark.axis === "h") {
            const sx = snapAxis(p, "x", editingIndex)
            return {
              point: {
                x: sx.value,
                y: Math.round(Math.max(0, Math.min(ih, p.y))),
              },
              state: {
                x: sx.snapped,
                y: false,
                xKind: sx.kind,
                yKind: "none",
              },
            }
          }

          const sy = snapAxis(p, "y", editingIndex)
          return {
            point: {
              x: Math.round(Math.max(0, Math.min(iw, p.x))),
              y: sy.value,
            },
            state: {
              x: false,
              y: sy.snapped,
              xKind: "none",
              yKind: sy.kind,
            },
          }
        }

        function buildDraftMark(
          startLocation: Point,
          currentLocation: Point
        ): { mark: Mark; endState: SnapState } {
          let snappedA = draftStartRef.current ?? null
          if (snappedA == null) {
            snappedA = snapGuidePoint(sourcePoint(startLocation), -1)
            draftStartRef.current = snappedA
          }

          const rawB = sourcePoint(currentLocation)

          if (mode === "rect") {
            const snappedB = snapGuidePoint(rawB, -1)
            return {
              mark: { kind: "rect", a: snappedA.point, b: snappedB.point } as RectMark,
              endState: snappedB.state,
            }
          }

          const rough = makeDistanceMark(snappedA.point, rawB)
          const snappedB1 = snapSourcePoint(rawB, -1, rough)
          const refined = makeDistanceMark(snappedA.point, snappedB1.point)
          const snappedB = refined.axis === rough.axis
            ? snappedB1
            : snapSourcePoint(rawB, -1, refined)

          return {
            mark: makeDistanceMark(snappedA.point, snappedB.point),
            endState: snappedB.state,
          }
        }

        function makeDistanceMark(a: Point, rawB: Point): DistanceMark {
          const axis = Math.abs(rawB.x - a.x) >= Math.abs(rawB.y - a.y) ? "h" : "v"
          return axis === "h"
            ? { kind: "distance", axis, a, b: { x: rawB.x, y: a.y } }
            : { kind: "distance", axis, a, b: { x: a.x, y: rawB.y } }
        }

        function updateMarkEndpoint(mark: Mark, endpoint: "a" | "b", p: Point): Mark {
          if (mark.kind === "rect") {
            return endpoint === "a" ? { ...mark, a: p } : { ...mark, b: p }
          }

          if (mark.axis === "h") {
            return endpoint === "a"
              ? { ...mark, a: { x: p.x, y: mark.a.y }, b: { x: mark.b.x, y: mark.a.y } }
              : { ...mark, a: { x: mark.a.x, y: mark.b.y }, b: { x: p.x, y: mark.b.y } }
          }

          return endpoint === "a"
            ? { ...mark, a: { x: mark.a.x, y: p.y }, b: { x: mark.a.x, y: mark.b.y } }
            : { ...mark, a: { x: mark.b.x, y: mark.a.y }, b: { x: mark.b.x, y: p.y } }
        }

        function formatPt(px: number) {
          const pt = px / layoutScale
          return Math.abs(pt - Math.round(pt)) < 0.05
            ? `${Math.round(pt)}`
            : pt.toFixed(1)
        }

        function labelFor(mark: Mark): string {
          if (mark.kind === "rect") {
            const wPx = Math.abs(mark.b.x - mark.a.x)
            const hPx = Math.abs(mark.b.y - mark.a.y)
            return `${Math.round(wPx)}×${Math.round(hPx)}px · ${formatPt(wPx)}×${formatPt(hPx)}pt`
          }

          const px = mark.axis === "h"
            ? Math.abs(mark.b.x - mark.a.x)
            : Math.abs(mark.b.y - mark.a.y)

          return `${mark.axis === "h" ? "X" : "Y"} ${Math.round(px)}px · ${formatPt(px)}pt`
        }

        function valueLabel(
          text: string,
          x: number,
          y: number,
          width: number,
          index: number
        ) {
          if (viewportMoving && index >= 0) return null

          return (
            <ZStack
              zIndex={90}
              frame={{ width, height: 32 }}
              offset={{
                x: x - cw / 2,
                y: y - ch / 2,
              }}
            >
              <Text
                font="caption"
                foregroundStyle="#FFFFFF"
                padding={{ horizontal: 9, vertical: 5 }}
                background={RED}
                clipShape="capsule"
                onTapGesture={() => {
                  if (index >= 0) selectMark(index)
                }}
                onLongPressGesture={index >= 0 ? {
                  minDuration: 450,
                  perform: () => { showMarkActions(index) },
                } : undefined}
              >
                {text}
              </Text>
            </ZStack>
          )
        }

        function activeRing() {
          return (
            <Canvas
              opaque={false}
              frame={{ width: 30, height: 30 }}
              draw={(ctx: any) => {
                ctx.beginPath()
                ctx.arc(15, 15, 11.5, 0, Math.PI * 2)
                ctx.strokeStyle = "#FFFFFF"
                ctx.lineWidth = 2
                ctx.stroke()

                ctx.beginPath()
                ctx.arc(15, 15, 13, 0, Math.PI * 2)
                ctx.strokeStyle = RED
                ctx.lineWidth = 1
                ctx.stroke()
              }}
            />
          )
        }

        function rectHandleView(p: Point, active: boolean) {
          return (
            <ZStack
              zIndex={95}
              frame={{ width: 30, height: 30 }}
              offset={{
                x: p.x - cw / 2,
                y: p.y - ch / 2,
              }}
            >
              {active ? activeRing() : null}
              <Canvas
                opaque={false}
                frame={{ width: 30, height: 30 }}
                draw={(ctx: any) => {
                  ctx.beginPath()
                  ctx.arc(15, 15, 3.5, 0, Math.PI * 2)
                  ctx.fillStyle = RED
                  ctx.fill()
                }}
              />
            </ZStack>
          )
        }

        function distanceHandleView(p: Point, axis: "h" | "v", active: boolean) {
          return (
            <ZStack
              zIndex={95}
              frame={{ width: 30, height: 30 }}
              offset={{
                x: p.x - cw / 2,
                y: p.y - ch / 2,
              }}
            >
              {active ? activeRing() : null}
              <Rectangle
                fill={RED}
                frame={{
                  width: axis === "h" ? 2 : 12,
                  height: axis === "h" ? 12 : 2,
                }}
              />
            </ZStack>
          )
        }

        function endpointMagnifier() {
          if (image == null) return null

          let source: Point | null = null
          let localSnap = snapState

          if (activeHandle != null) {
            const current = marksRef.current ?? marks
            const mark = current[activeHandle.index]
            if (mark == null) return null
            source = activeHandle.endpoint === "a" ? mark.a : mark.b
          } else if (draft != null) {
            source = draft.b
            localSnap = draftSnapState
          }

          if (source == null) return null

          const anchor = screenPoint(source)
          const size = 132
          const radius = size / 2
          const gap = 30
          const edge = 10
          const toolbarReserve = 86

          const centerX = Math.max(
            radius + edge,
            Math.min(cw - radius - edge, anchor.x)
          )

          let centerY = anchor.y - radius - gap
          const minCenterY = safeTop + radius + edge
          const maxCenterY = Math.max(
            minCenterY,
            ch - safeBottom - toolbarReserve - radius
          )

          if (centerY < minCenterY) centerY = anchor.y + radius + gap
          centerY = Math.max(minCenterY, Math.min(maxCenterY, centerY))

          const sample = 28
          const c = size / 2
          const sampleScale = size / sample
          const rawSx = source.x - sample / 2
          const rawSy = source.y - sample / 2
          const sx = Math.max(0, Math.floor(rawSx))
          const sy = Math.max(0, Math.floor(rawSy))
          const ex = Math.min(iw, Math.ceil(rawSx + sample))
          const ey = Math.min(ih, Math.ceil(rawSy + sample))
          const sw = Math.max(1, ex - sx)
          const sh = Math.max(1, ey - sy)
          const dx = c - (source.x - sx) * sampleScale
          const dy = c - (source.y - sy) * sampleScale
          const dw = sw * sampleScale
          const dh = sh * sampleScale

          const snapKind = dominantSnapKind(localSnap)
          const snapped = snapKind !== "none"
          const reticleColor = snapped ? "#34C759" : RED

          return (
            <Canvas
              zIndex={850}
              opaque={false}
              frame={{ width: size, height: size }}
              offset={{ x: centerX - cw / 2, y: centerY - ch / 2 }}
              draw={(ctx: any) => {
                // Real circular clipping inside Canvas: no square backing layer.
                ctx.save()
                ctx.beginPath()
                ctx.arc(c, c, radius - 3, 0, Math.PI * 2)
                ctx.clip()

                ctx.fillStyle = "#1C1C1E"
                ctx.fillRect(0, 0, size, size)
                ctx.imageSmoothingEnabled = false
                ctx.drawImage({ image }, sx, sy, sw, sh, dx, dy, dw, dh)
                ctx.restore()

                // Reticle always renders after the sampled image.
                ctx.beginPath()
                ctx.moveTo(c - 22, c)
                ctx.lineTo(c + 22, c)
                ctx.moveTo(c, c - 22)
                ctx.lineTo(c, c + 22)
                ctx.strokeStyle = "#FFFFFF"
                ctx.lineWidth = 5
                ctx.stroke()

                ctx.beginPath()
                ctx.moveTo(c - 21, c)
                ctx.lineTo(c + 21, c)
                ctx.moveTo(c, c - 21)
                ctx.lineTo(c, c + 21)
                ctx.strokeStyle = reticleColor
                ctx.lineWidth = 2
                ctx.stroke()

                ctx.beginPath()
                ctx.arc(c, c, 4.5, 0, Math.PI * 2)
                ctx.fillStyle = reticleColor
                ctx.fill()

                ctx.beginPath()
                ctx.arc(c, c, radius - 3, 0, Math.PI * 2)
                ctx.strokeStyle = "#FFFFFF"
                ctx.lineWidth = 6
                ctx.stroke()

                ctx.beginPath()
                ctx.arc(c, c, radius - 5, 0, Math.PI * 2)
                ctx.strokeStyle = reticleColor
                ctx.lineWidth = 2
                ctx.stroke()

                if (snapped) {
                  ctx.font = 10
                  ctx.textAlign = "center"
                  ctx.textBaseline = "top"
                  ctx.fillStyle = reticleColor
                  ctx.fillText(snapKind === "edge" ? "EDGE" : "ALIGN", c, 10)
                }
              }}
            />
          )
        }

        function isSelected(index: number) {
          return selectedMark === index
        }

        function distanceHitArea(
          a: Point,
          b: Point,
          axis: "h" | "v",
          index: number
        ) {
          const width = axis === "h" ? Math.abs(b.x - a.x) + 36 : 36
          const height = axis === "v" ? Math.abs(b.y - a.y) + 36 : 36
          return (
            <Rectangle
              zIndex={70}
              fill="clear"
              frame={{ width, height }}
              offset={{
                x: (a.x + b.x) / 2 - cw / 2,
                y: (a.y + b.y) / 2 - ch / 2,
              }}
              contentShape="rect"
              onTapGesture={() => selectMark(index)}
              onLongPressGesture={{
                minDuration: 450,
                perform: () => { showMarkActions(index) },
              }}
            />
          )
        }

        function rectHitAreas(
          left: number,
          right: number,
          top: number,
          bottom: number,
          index: number
        ) {
          const width = Math.max(36, right - left + 36)
          const height = Math.max(36, bottom - top + 36)
          return (
            <ZStack zIndex={70} frame={{ width: cw, height: ch }}>
              <Rectangle
                fill="clear"
                contentShape="rect"
                onTapGesture={() => selectMark(index)}
                onLongPressGesture={{
                  minDuration: 450,
                  perform: () => { showMarkActions(index) },
                }}
                frame={{ width, height: 32 }}
                offset={{ x: (left + right) / 2 - cw / 2, y: top - ch / 2 }}
              />
              <Rectangle
                fill="clear"
                contentShape="rect"
                onTapGesture={() => selectMark(index)}
                onLongPressGesture={{
                  minDuration: 450,
                  perform: () => { showMarkActions(index) },
                }}
                frame={{ width, height: 32 }}
                offset={{ x: (left + right) / 2 - cw / 2, y: bottom - ch / 2 }}
              />
              <Rectangle
                fill="clear"
                contentShape="rect"
                onTapGesture={() => selectMark(index)}
                onLongPressGesture={{
                  minDuration: 450,
                  perform: () => { showMarkActions(index) },
                }}
                frame={{ width: 32, height }}
                offset={{ x: left - cw / 2, y: (top + bottom) / 2 - ch / 2 }}
              />
              <Rectangle
                fill="clear"
                contentShape="rect"
                onTapGesture={() => selectMark(index)}
                onLongPressGesture={{
                  minDuration: 450,
                  perform: () => { showMarkActions(index) },
                }}
                frame={{ width: 32, height }}
                offset={{ x: right - cw / 2, y: (top + bottom) / 2 - ch / 2 }}
              />
            </ZStack>
          )
        }

        function overlay(mark: Mark, index: number, layer: number = 20) {
          const a = screenPoint(mark.a)
          const b = screenPoint(mark.b)
          const left = Math.min(a.x, b.x)
          const right = Math.max(a.x, b.x)
          const top = Math.min(a.y, b.y)
          const bottom = Math.max(a.y, b.y)
          const selected = index >= 0 && isSelected(index)

          if (mark.kind === "rect") {
            const w = Math.max(2, right - left)
            const h = Math.max(2, bottom - top)
            const sourceCenterY = (mark.a.y + mark.b.y) / 2
            const labelY = sourceCenterY <= ih / 2 ? top - 20 : bottom + 20

            return (
              <ZStack zIndex={layer} frame={{ width: cw, height: ch }}>
                <Rectangle
                  fill="clear"
                  stroke={RED}
                  frame={{ width: w, height: h }}
                  offset={{
                    x: (left + right) / 2 - cw / 2,
                    y: (top + bottom) / 2 - ch / 2,
                  }}
                />
                {index >= 0 ? rectHitAreas(left, right, top, bottom, index) : null}
                {valueLabel(labelFor(mark), (left + right) / 2, labelY, 228, index)}
                {rectHandleView(a, selected)}
                {rectHandleView(b, selected)}
              </ZStack>
            )
          }

          const sourceMidX = (mark.a.x + mark.b.x) / 2
          const sourceMidY = (mark.a.y + mark.b.y) / 2
          const labelPosX = mark.axis === "h"
            ? (a.x + b.x) / 2
            : (sourceMidX <= iw / 2 ? a.x - 72 : a.x + 72)
          const labelPosY = mark.axis === "h"
            ? (sourceMidY <= ih / 2 ? a.y - 20 : a.y + 20)
            : (a.y + b.y) / 2

          return (
            <ZStack zIndex={layer} frame={{ width: cw, height: ch }}>
              <Rectangle
                zIndex={layer}
                fill={RED}
                frame={{
                  width: mark.axis === "h" ? Math.max(2, Math.abs(b.x - a.x)) : 2,
                  height: mark.axis === "v" ? Math.max(2, Math.abs(b.y - a.y)) : 2,
                }}
                offset={{
                  x: (a.x + b.x) / 2 - cw / 2,
                  y: (a.y + b.y) / 2 - ch / 2,
                }}
              />
              {index >= 0 ? distanceHitArea(a, b, mark.axis, index) : null}
              {valueLabel(labelFor(mark), labelPosX, labelPosY, 184, index)}
              {distanceHandleView(a, mark.axis, selected)}
              {distanceHandleView(b, mark.axis, selected)}
            </ZStack>
          )
        }

        function findHandle(start: Point): Handle | null {
          if (selectedMark == null) return null

          const current = marksRef.current ?? marks
          const mark = current[selectedMark]
          if (mark == null) return null

          const a = screenPoint(mark.a)
          const b = screenPoint(mark.b)
          const da = Math.sqrt((start.x - a.x) ** 2 + (start.y - a.y) ** 2)
          const db = Math.sqrt((start.x - b.x) ** 2 + (start.y - b.y) ** 2)

          if (da <= 30 && da <= db) return { index: selectedMark, endpoint: "a" }
          if (db <= 30) return { index: selectedMark, endpoint: "b" }
          return null
        }

        function applyHandleMove(handle: Handle, point: Point) {
          const current = (marksRef.current ?? marks).slice()
          const mark = current[handle.index]
          if (mark == null) return

          const snapped = snapSourcePoint(point, handle.index, mark)
          setSnapState(snapped.state)

          current[handle.index] = updateMarkEndpoint(
            mark,
            handle.endpoint,
            snapped.point
          )
          marksRef.current = current
          setMarks(current)

        }

        const handleDragChanged = (g: any) => {
          if (mode === "pan") {
            setViewportMoving(true)
            const nextPan = clampPan({
              x: panBase.x + g.translation.width,
              y: panBase.y + g.translation.height,
            }, zoom)
            setPan(nextPan)
            return
          }

          let handle = activeHandleRef.current ?? null
          if (handle == null) {
            handle = findHandle(g.startLocation)
            if (handle != null) {
              activeHandleRef.current = handle
              setActiveHandle(handle)
              setDraft(null)
            }
          }

          if (handle != null) {
            applyHandleMove(handle, sourcePoint(g.location))
            return
          }

          if (selectedMark != null) return

          const built = buildDraftMark(g.startLocation, g.location)
          setDraft(built.mark)
          setDraftSnapState(built.endState)
        }

        const handleDragEnded = (g: any) => {
          draftStartRef.current = null
          if (mode === "pan") {
            const nextPan = clampPan({
              x: panBase.x + g.translation.width,
              y: panBase.y + g.translation.height,
            }, zoom)
            setPan(nextPan)
            setPanBase(nextPan)
            setViewportMoving(false)
            return
          }

          const handle = activeHandleRef.current ?? null
          if (handle != null) {
            applyHandleMove(handle, sourcePoint(g.location))
            setActiveHandle(null)
            activeHandleRef.current = null
    draftStartRef.current = null
            setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
            setSelectedMark(null)
            setDraft(null)
            return
          }

          if (selectedMark != null) return

          const distance = Math.sqrt(
            g.translation.width * g.translation.width +
            g.translation.height * g.translation.height
          )
          if (distance < 6) {
            setDraft(null)
            setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
            setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
            return
          }

          const built = buildDraftMark(g.startLocation, g.location)
          const completed = built.mark

          const nextMarks = [...(marksRef.current ?? marks), completed]
          marksRef.current = nextMarks
          setMarks(nextMarks)
          setDraft(null)
          setSelectedMark(null)
          setSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
          setDraftSnapState({ x: false, y: false, xKind: "none", yKind: "none" })
        }

        function panForMagnify(v: any, nextZoom: number): Point {
          const focal = v.startLocation ?? { x: cw / 2, y: ch / 2 }
          const startZoom = Math.max(0.001, zoomBase)
          const ratio = nextZoom / startZoom

          // Preserve the image point that was under the two-finger center when
          // the pinch began. The main image and annotations now share
          // the same explicit source-pixel -> screen rectangle transform.
          const rawPan = {
            x:
              focal.x - cw / 2 -
              (focal.x - cw / 2 - panBase.x) * ratio,
            y:
              focal.y - ch / 2 -
              (focal.y - ch / 2 - panBase.y) * ratio,
          }

          // Only boundary clamping is allowed to move the focal point.
          return clampPan(rawPan, nextZoom)
        }

        const magnify = MagnifyGesture()
          .onChanged((v: any) => {
            setViewportMoving(true)
            const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomBase * v.magnification))
            const nextPan = panForMagnify(v, nextZoom)
            setZoom(nextZoom)
            setPan(nextPan)
          })
          .onEnded((v: any) => {
            const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomBase * v.magnification))
            const nextPan = panForMagnify(v, nextZoom)
            setZoom(nextZoom)
            setZoomBase(nextZoom)
            setPan(nextPan)
            setPanBase(nextPan)
            setViewportMoving(false)
          })

        const canvas = image == null ? (
          <ZStack
            frame={{ width: cw, height: ch }}
            contentShape="rect"
            onTapGesture={pickImage}
          >
            <VStack spacing={12}>
              <Image
                systemName="photo.badge.plus"
                font={44}
                foregroundStyle={MUTED}
              />
              <Text font="headline">导入 UI 截图</Text>
              <Text font="caption" foregroundStyle={MUTED}>
                全屏测量 · 输出 px / pt
              </Text>
            </VStack>
          </ZStack>
        ) : (
          <ZStack
            frame={{ width: cw, height: ch }}
            clipShape="rect"
            contentShape="rect"
            onDragGesture={{
              minDistance: 8,
              coordinateSpace: "local",
              onChanged: handleDragChanged,
              onEnded: handleDragEnded,
            }}
            simultaneousGesture={magnify}
          >
            <Rectangle
              zIndex={-1}
              fill={"quaternaryLabel"}
              frame={{
                width: scaledW + WORKSPACE_MARGIN * 2,
                height: scaledH + WORKSPACE_MARGIN * 2,
              }}
              offset={{ x: pan.x, y: pan.y }}
            />

            <Image
              zIndex={0}
              image={image}
              resizable
              interpolation="none"
              frame={{ width: scaledW, height: scaledH }}
              offset={{ x: pan.x, y: pan.y }}
            />
            <Rectangle
              zIndex={1}
              fill="clear"
              stroke="#8E8E93"
              frame={{ width: scaledW, height: scaledH }}
              offset={{ x: pan.x, y: pan.y }}
            />
            {marks.map((m: Mark, index: number) => overlay(m, index, 20 + index))}
            {draft == null ? null : overlay(draft, -1, 200)}
            {endpointMagnifier()}
          </ZStack>
        )

        return (
          <ZStack
            frame={{ width: cw, height: ch }}
            offset={{ x: viewportOffsetX, y: viewportOffsetY }}
            ignoresSafeArea={true}
            background="systemBackground"
          >
            <Rectangle
              zIndex={-100}
              fill={"quaternaryLabel"}
              frame={{ width: cw, height: ch }}
            />
            {canvas}

            <HStack
              zIndex={1000}
              spacing={2}
              padding={5}
              glassEffect="capsule"
              background={<Capsule fill={"quaternaryLabel"} />}
              offset={{
                x: 0,
                // 26 = half of the ~52pt capsule height; 10 = floating gap.
                y: ch / 2 - safeBottom - 26 - 10,
              }}
            >
              {iconButton("photo.on.rectangle", pickImage)}
              {modeIcon("hand.draw", "pan")}
              {modeIcon("ruler", "distance")}
              {modeIcon("rectangle.dashed", "rect")}
              {iconButton("arrow.uturn.backward", undo)}
              {iconButton("arrow.down.right.and.arrow.up.left", resetView)}

              <Button
                buttonStyle="plain"
                action={cycleLayoutScale}
              >
                <ZStack frame={{ width: 46, height: 42 }}>
                  <Text font="caption" fontWeight="semibold">@{layoutScale}×</Text>
                </ZStack>
              </Button>

              {iconButton("square.and.arrow.down", exportAnnotatedImage)}
              {iconButton("xmark", () => dismiss())}
            </HStack>
          </ZStack>
          )
        }}
      </GeometryReader>
    </ZStack>
  )
}

function MainView() {
  return (
    <EnvironmentValuesReader keys={["displayScale"]}>
      {(env: any) => {
        const deviceScale = Number(env.displayScale) || 1
        return <MarkerView deviceScale={deviceScale} />
      }}
    </EnvironmentValuesReader>
  )
}

;(async () => {
  await Navigation.present({
    element: <MainView />,
    modalPresentationStyle: "overFullScreen",
  })
})()
  .catch(async (e) => {
    await Dialog.alert({
      title: "错误",
      message: String(e),
    })
  })
  .finally(Script.exit)
