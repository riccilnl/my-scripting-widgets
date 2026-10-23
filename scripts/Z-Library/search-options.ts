export type Choice = {value: string; label: string}
export const YEAR_CHOICES: Choice[] = [
  { value: "", label: "不限" },
  ...Array.from({length: new Date().getFullYear() - 1919}, (_, i) => {
    const year = new Date().getFullYear() - i
    return {value: String(year), label: String(year)}
  })
]
export const LANGUAGES: Choice[] = [
  ["", "所有语言"], ["chinese", "中文"], ["english", "英语"], ["japanese", "日语"],
  ["korean", "韩语"], ["russian", "俄语"], ["german", "德语"], ["french", "法语"],
  ["spanish", "西班牙语"], ["italian", "意大利语"], ["portuguese", "葡萄牙语"],
  ["arabic", "阿拉伯语"], ["dutch", "荷兰语"], ["polish", "波兰语"],
  ["ukrainian", "乌克兰语"], ["turkish", "土耳其语"], ["persian", "波斯语"],
  ["swedish", "瑞典语"], ["greek", "希腊语"], ["latin", "拉丁语"],
  ["czech", "捷克语"], ["indonesian", "印尼语"], ["vietnamese", "越南语"],
  ["hindi", "印地语"], ["thai", "泰语"], ["hebrew", "希伯来语"],
  ["bulgarian", "保加利亚语"], ["romanian", "罗马尼亚语"],
  ["hungarian", "匈牙利语"], ["serbian", "塞尔维亚语"],
  ["croatian", "克罗地亚语"], ["kazakh", "哈萨克语"],
  ["belarusian", "白俄罗斯语"], ["lithuanian", "立陶宛语"],
  ["catalan", "加泰罗尼亚语"], ["finnish", "芬兰语"],
  ["azerbaijani", "阿塞拜疆语"], ["bengali", "孟加拉语"],
  ["esperanto", "世界语"], ["urdu", "乌尔都语"],
  ["danish", "丹麦语"], ["uzbek", "乌兹别克语"],
  ["slovak", "斯洛伐克语"], ["norwegian", "挪威语"],
  ["indigenous", "原住民语言"], ["bashkir", "巴什基尔语"],
  ["marathi", "马拉地语"], ["kirghiz", "吉尔吉斯语"],
  ["tajik", "塔吉克语"], ["tatar", "鞑靼语"],
  ["albanian", "阿尔巴尼亚语"], ["somali", "索马里语"],
  ["icelandic", "冰岛语"], ["mongolian", "蒙古语"],
  ["latvian", "拉脱维亚语"], ["georgian", "格鲁吉亚语"],
  ["sanskrit", "梵语"], ["slovenian", "斯洛文尼亚语"],
  ["malayalam", "马拉雅拉姆语"], ["afrikaans", "南非荷兰语"],
  ["nepali", "尼泊尔语"], ["sinhala", "僧伽罗语"]
].map(([value,label]) => ({value,label}))
export const FORMATS: Choice[] = [
  ["", "所有格式"], ["epub", "EPUB"], ["pdf", "PDF"], ["mobi", "MOBI"],
  ["azw3", "AZW3"], ["azw", "AZW"], ["djvu", "DJVU"], ["fb2", "FB2"],
  ["txt", "TXT"], ["rtf", "RTF"], ["doc", "DOC"], ["docx", "DOCX"],
  ["rar", "RAR"], ["lit", "LIT"]
].map(([value,label]) => ({value,label}))
export const ORDERS: Choice[] = [
  ["relevance", "相关性优先"], ["date", "最近收录"],
  ["year", "出版年份"], ["popular", "最受欢迎"]
].map(([value,label]) => ({value,label}))

export type SearchPrefs = {
  query: string
  yearFrom: string
  yearTo: string
  language: string
  format: string
  order: string
}
export const DEFAULT_PREFS: SearchPrefs = {
  query: "", yearFrom: "", yearTo: "", language: "", format: "", order: "relevance"
}
const SEARCH_PREFS_KEY = "zlibrary-search-preferences-v1"
export function readSearchPrefs(): SearchPrefs | null {
  try {
    const candidate = Storage.get<Partial<SearchPrefs>>(SEARCH_PREFS_KEY)
    if (!candidate || typeof candidate !== "object") return null
    const values: SearchPrefs = {...DEFAULT_PREFS}
    for (const key of Object.keys(values) as (keyof SearchPrefs)[]) {
      if (typeof candidate[key] === "string") values[key] = candidate[key]
    }
    if (!YEAR_CHOICES.some(i => i.value === values.yearFrom)) values.yearFrom = ""
    if (!YEAR_CHOICES.some(i => i.value === values.yearTo)) values.yearTo = ""
    if (!LANGUAGES.some(i => i.value === values.language)) values.language = ""
    if (!FORMATS.some(i => i.value === values.format)) values.format = ""
    if (!ORDERS.some(i => i.value === values.order)) values.order = "relevance"
    return values
  } catch { return null }
}
export function saveSearchPrefs(value: SearchPrefs | null): void {
  try {
    if (value) Storage.set(SEARCH_PREFS_KEY, value)
    else Storage.remove(SEARCH_PREFS_KEY)
  } catch { /* Storage is best-effort; never block searching. */ }
}
export function searchPrefsLabel(options: Choice[], value: string): string {
  return options.find(x => x.value === value)?.label || options[0].label
}
