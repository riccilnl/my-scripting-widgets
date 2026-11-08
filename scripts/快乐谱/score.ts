import { Song, titleOf } from "./api"

export type ScoreProbe = {
  url: string
  title: string
  login: boolean
  hasSheet: boolean
  sheetWidth: number
  hasCompiler: boolean
  svgs: string[]
  compileError: string
  nativeDsl: string
  sourceUuid: string
  sourceTitle: string
  sourceComposer: string
  sourceKey: string
  sourceRhythm: string
  sourceError: string
}

// 站点在加载 JS 后由 Song.compile()/hc.parse() 在浏览器内生成 SVG。
// 初次只读 DOM。若网站未完成绘制，再调用站点公开在页面上的编译函数。
export function probeScript(compileFallback = false): string {
  return `
var sheet = document.getElementById('sheet');
var svgs = Array.from(document.querySelectorAll('#sheet svg'))
  .filter(el => !el.parentElement?.closest('svg'))
  .map(el => el.outerHTML);
var compileError = '';
if (!svgs.length && ${compileFallback ? 'true' : 'false'} &&
    window.Song && typeof window.Song.compile === 'function') {
  try {
    var compiled = window.Song.compile();
    if (compiled && typeof compiled.svg === 'string' && compiled.svg.indexOf('<svg') >= 0) {
      svgs = [compiled.svg];
    }
  } catch (error) { compileError = String(error); }
}
// Official buildSource() is the only DSL source. Never reconstruct notes from SVG.
var nativeDsl = '';
var sourceUuid = '';
var sourceTitle = '';
var sourceComposer = '';
var sourceKey = '';
var sourceRhythm = '';
var sourceError = '';
if (svgs.length && window.Song && typeof window.Song.buildSource === 'function' &&
    window.Kit && window.Kit.context && typeof window.Kit.context.getContext === 'function') {
  try {
    var raw = window.Kit.context.getContext();
    if (!raw || typeof raw.notation !== 'string' || !raw.notation.trim()) {
      throw new Error('网站未提供完整原始记谱数据');
    }
    sourceUuid = String(raw.song_uuid || '');
    sourceTitle = String(raw.song_name || '');
    sourceComposer = String(raw.music_composer || '');
    sourceKey = String(raw.keynote || '');
    sourceRhythm = String(raw.rhythm || '');
    var built = window.Song.buildSource();
    if (typeof built !== 'string' || built.length > 2000000 || built.indexOf(raw.notation) < 0) {
      throw new Error('官网生成的 DSL 与原始 notation 不一致');
    }
    nativeDsl = built;
  } catch (e) {
    sourceError = String(e);
  }
}
return JSON.stringify({
  nativeDsl: nativeDsl, sourceUuid: sourceUuid, sourceTitle: sourceTitle,
  sourceComposer: sourceComposer, sourceKey: sourceKey,
  sourceRhythm: sourceRhythm, sourceError: sourceError,
  url: location.href,
  title: document.title || '',
  login: /\\/web\\/user\\.php/.test(location.pathname) || !!document.querySelector('#login-card'),
  hasSheet: !!sheet,
  sheetWidth: sheet ? Math.round(sheet.getBoundingClientRect().width) : 0,
  hasCompiler: !!(window.Song && typeof window.Song.compile === 'function'),
  svgs: svgs,
  compileError: compileError
});`
}

export function parseScoreProbe(raw: unknown): ScoreProbe {
  let value: any
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw }
  catch { throw new Error('网页诊断结果不是有效 JSON') }
  if (!value || typeof value !== 'object' || typeof value.url !== 'string') {
    throw new Error('网页未返回有效的页面状态')
  }
  const svgs = Array.isArray(value.svgs) ? value.svgs : []
  if (svgs.length > 20 || svgs.some((s: unknown) =>
    typeof s !== 'string' || !/^\s*<svg(?:\s|>)/i.test(s) || s.length > 8_000_000)) {
    throw new Error('网页返回的 SVG 内容异常')
  }
  return {
    url: value.url,
    title: String(value.title || ''),
    login: Boolean(value.login),
    hasSheet: Boolean(value.hasSheet),
    sheetWidth: Number(value.sheetWidth) || 0,
    hasCompiler: Boolean(value.hasCompiler),
    svgs,
    compileError: String(value.compileError || ''),
    nativeDsl: typeof value.nativeDsl === 'string' && value.nativeDsl.length <= 2_000_000
      ? value.nativeDsl : '',
    sourceUuid: String(value.sourceUuid || ''),
    sourceTitle: String(value.sourceTitle || ''),
    sourceComposer: String(value.sourceComposer || ''),
    sourceKey: String(value.sourceKey || ''),
    sourceRhythm: String(value.sourceRhythm || ''),
    sourceError: String(value.sourceError || ''),
  }
}

export function normalizeSvg(svg: string): string {
  let result = /<svg\b[^>]*\bxmlns\s*=/.test(svg) ? svg :
    svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  // 若引擎只给出宽高，补 viewBox 以便在窄屏上等比缩放。
  const tag = result.match(/^\s*<svg\b[^>]*>/i)?.[0] || ''
  if (!/\bviewBox\s*=/.test(tag)) {
    const w = tag.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)
    const h = tag.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)
    if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) {
      result = result.replace(/<svg\b/i, `<svg viewBox="0 0 ${w[1]} ${h[1]}"`)
    }
  }
  return result
}

export function readerHTML(svgs: string[]): string {
  if (!svgs.length) throw new Error('缺少 SVG 谱面')
  const body = svgs.map(s => `<section class="page">${normalizeSvg(s)}</section>`).join('')
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
html,body{margin:0;padding:0;background:#f1f2f5;color:#161616;overflow-x:hidden;}
main{padding:8px 6px 24px;box-sizing:border-box;}
.page{width:100%;background:#fff;overflow:hidden;margin:0 0 10px;padding:3px;box-sizing:border-box;}
.page>svg{display:block;width:100%!important;height:auto!important;max-width:100%;}
</style></head><body><main>${body}</main></body></html>`
}

function safeName(input: string): string {
  return input.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 60) || "简谱"
}

export async function saveSvgFiles(song: Song, svgs: string[]): Promise<string[]> {
  if (!svgs.length || svgs.length > 20) throw new Error('没有可保存的 SVG')
  const folder = FileManager.documentsDirectory + "/快乐谱"
  await FileManager.createDirectory(folder, true)
  const files: string[] = []
  for (let i = 0; i < svgs.length; i++) {
    const stem = safeName(titleOf(song)) + "_" + song.song_uuid + (svgs.length > 1 ? "_" + (i+1) : "")
    let path = folder + "/" + stem + ".svg"
    for (let n = 2; await FileManager.exists(path); n++) path = folder + "/" + stem + "_" + n + ".svg"
    await FileManager.writeAsString(path, normalizeSvg(svgs[i]))
    files.push(path)
  }
  return files
}

export function describeFailure(probe: ScoreProbe | null): string {
  if (!probe) return '未能读取网页状态，请检查网络或稍后重试'
  if (probe.login) return '网站要求登录。请在下方原网页登录后，点击「重新读取」。'
  if (!probe.hasSheet) return `当前不是曲谱页（${probe.title || probe.url}），未找到 #sheet。`
  if (!probe.hasCompiler) return '曲谱渲染脚本未加载（Song.compile 不存在），请检查站点资源访问。'
  if (probe.compileError) return '渲染出错：' + probe.compileError.slice(0, 180)
  return `网站未生成 SVG（谱面宽度 ${probe.sheetWidth}px）。请检查网络或重试。`
}
