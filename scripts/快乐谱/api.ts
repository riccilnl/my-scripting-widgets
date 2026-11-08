import { fetch } from "scripting"

export const SITE_ORIGIN = "https://www.kuaiyuepu.com"
export const SEARCH_ENDPOINT = SITE_ORIGIN + "/web/song.php?action=search"

export type Song = {
  song_uuid: string
  song_name?: string
  title?: string
  alias_name?: string
  subtitle?: string
  music_composer?: string
  nickname?: string
}

type SearchPayload = {
  errCode?: number
  errMsg?: string
  result?: { count?: number; data_list?: unknown }
}

export function scoreURL(song: Song): string {
  if (!/^[A-Za-z0-9_-]+$/.test(song.song_uuid)) throw new Error("无效曲谱 ID")
  return SITE_ORIGIN + "/jianpu/" + song.song_uuid + ".html"
}

export function titleOf(song: Song): string {
  return song.title || song.song_name || "未命名曲谱"
}

export function subtitleOf(song: Song): string {
  return [song.subtitle || song.alias_name, song.music_composer, song.nickname]
    .filter(Boolean).join(" · ")
}

export function formBody(keyword: string): string {
  return "keyword=" + encodeURIComponent(keyword.trim()) + "&list_name=data_list&subsite=wind"
}

export function parseSearchPayload(input: unknown): Song[] {
  const data = input as SearchPayload
  if (!data || data.errCode !== 0 || !Array.isArray(data.result?.data_list)) {
    throw new Error(data?.errMsg || "搜索接口数据异常")
  }
  return (data.result.data_list as unknown[]).filter((row): row is Song => {
    return typeof row === "object" && row !== null &&
      /^[A-Za-z0-9_-]+$/.test(String((row as Song).song_uuid || ""))
  })
}

export async function searchSongs(keyword: string): Promise<Song[]> {
  if (!keyword.trim()) return []
  const response = await fetch(SEARCH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: formBody(keyword),
    timeout: 20,
  })
  if (!response.ok) throw new Error("搜索失败：HTTP " + response.status)
  return parseSearchPayload(await response.json())
}
