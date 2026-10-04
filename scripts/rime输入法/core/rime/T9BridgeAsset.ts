export const T9_BRIDGE_LUA = `local kAccepted = 1
local kNoop = 2

-- Private control keys. They never replace ordinary T9 digit/backspace input.
local kProbeKey = 0xffd4 -- F23: publish next-pinyin options from CURRENT filtered Rime menu
local kApplySelectionKey = 0xffd5 -- F24: append one user-confirmed pinyin constraint
local kPrepareCandidateKey = 0xffd6 -- F25: inspect the CURRENT Rime candidate about to be selected
local kFinalizeCandidateKey = 0xffd7 -- F26: consume the selected pinyin prefix after Rime selects it

local kReadyProperty = "t9_bridge_ready"
local kOptionsProperty = "t9_bridge_options"
local kSelectionRequestProperty = "t9_bridge_selection_request"
local kSelectedProperty = "t9_bridge_selected"
local kPartialPrefixProperty = "t9_bridge_partial_prefix"
local kCandidateIndexProperty = "t9_bridge_candidate_index"
local kPendingConsumeProperty = "t9_bridge_pending_consume"
local kMenuPrepareLimit = 96
local kOptionLimit = 48

-- Exact T9 mapping used only to VERIFY an already Rime-provided active-tail
-- pinyin label. It never enumerates labels from digits and contains no fuzzy
-- aliases. If selected pinyin no longer maps exactly onto the raw numeric
-- prefix (for example because abbreviation/fuzzy spelling is involved), the
-- fallback is disabled and the original 4.6 Rime-path logic remains in charge.
local T9_EXACT_DIGIT = {
  a = "2", b = "2", c = "2",
  d = "3", e = "3", f = "3",
  g = "4", h = "4", i = "4",
  j = "5", k = "5", l = "5",
  m = "6", n = "6", o = "6",
  p = "7", q = "7", r = "7", s = "7",
  t = "8", u = "8", v = "8",
  w = "9", x = "9", y = "9", z = "9",
}

local T9_DIGIT_CACHE = {}

local function exact_t9_digits(label)
  local key = tostring(label or ""):lower()
  local cached = T9_DIGIT_CACHE[key]
  if cached ~= nil then return cached end
  local out = {}
  for ch in key:gmatch("[a-z]") do
    local digit = T9_EXACT_DIGIT[ch]
    if digit == nil then
      T9_DIGIT_CACHE[key] = ""
      return ""
    end
    out[#out + 1] = digit
  end
  local result = table.concat(out)
  T9_DIGIT_CACHE[key] = result
  return result
end

local function active_numeric_input(context)
  local raw = tostring(context and context.input or "")
  if raw == "" or raw:match("^[2-9]+$") == nil then return nil end

  -- Rime can keep the full raw input after a leading candidate has been
  -- confirmed while composition:back() already points at the unresolved
  -- segment. Left-column options come from that active segment menu, so their
  -- digit verification must use the same segment-local raw slice.
  local ok, start = pcall(function()
    local composition = context and context.composition or nil
    if composition == nil or composition:empty() then return 0 end
    local segment = composition:back()
    if segment == nil then return 0 end
    return tonumber(segment.start or 0) or 0
  end)
  if not ok then return raw end
  start = math.floor(tonumber(start or 0) or 0)
  if start < 0 or start > #raw then return raw end
  return raw:sub(start + 1)
end

local function exact_remaining_tail(context, selected)
  local raw = active_numeric_input(context)
  if raw == nil or raw == "" then return nil end
  local prefix = {}
  for _, syllable in ipairs(selected or {}) do
    local digits = exact_t9_digits(syllable)
    if digits == "" then return nil end
    prefix[#prefix + 1] = digits
  end
  local joined = table.concat(prefix)
  if joined == "" or raw:sub(1, #joined) ~= joined then return nil end
  return raw:sub(#joined + 1)
end

local function unresolved_tail(context, selected)
  local raw = active_numeric_input(context)
  if raw == nil or raw == "" then return nil end
  if selected == nil or #selected == 0 then return raw end
  return exact_remaining_tail(context, selected)
end

local function exact_tail_match(label, tail)
  tail = tostring(tail or "")
  if tail == "" then return false end
  local digits = exact_t9_digits(label)
  if digits == "" then return false end
  return tail:sub(1, #digits) == digits or digits:sub(1, #tail) == tail
end

-- Project a Rime-provided full syllable onto exactly the amount of unresolved
-- T9 input the user has typed. This prevents a single digit such as 9 from
-- exploding into dozens of completed syllables (wang/wei/wen/...) in the UI.
-- The returned prefix is still derived from Rime; digits only verify/truncate it.
local function option_prefix_for_tail(label, tail)
  label = tostring(label or ""):lower()
  tail = tostring(tail or "")
  if label == "" or tail == "" then return nil, false end

  local take = math.min(#label, #tail)
  local prefix = label:sub(1, take)
  local prefix_digits = exact_t9_digits(prefix)
  if prefix_digits == "" then return nil, false end
  if tail:sub(1, #prefix_digits) ~= prefix_digits then return nil, false end

  if #label <= #tail then
    if prefix_digits == "" or tail:sub(1, #prefix_digits) ~= prefix_digits then return nil, false end
    return label, true
  end

  if #prefix_digits ~= #tail or prefix_digits ~= tail then return nil, false end
  return prefix, false
end

-- Canonical Mandarin syllables serve two deliberately narrow purposes:
-- 1) parse compact pinyin strings already emitted by Rime;
-- 2) when the unresolved T9 tail is exactly ONE digit and Rime cannot expose
--    every initial yet, fill the left panel with legal Mandarin initials for
--    that digit (for example 5 -> j/k/l). This is display/selection metadata
--    only: ordinary digits, candidates, ranking and commits stay Rime-owned.
local PINYIN_PARSE_SYLLABLES = [[
a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong
chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo
da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan
dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao
ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao
he hei hen heng hm hng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao
jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke ken keng kong kou ku
kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang
liao lie lin ling liu lo long lou lu luan lun luo lv lve m ma mai man mang mao me
mei men meng mi mian miao mie min ming miu mo mou mu n na nai nan nang nao ne nei
nen neng ng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa
pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian
qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri
rong rou ru ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang
shao she shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song
sou su suan sui sun suo ta tai tan tang tao te teng ti tian tiao tie ting tong tou
tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie
xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu
yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhen
zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu
zuan zui zun zuo
]]

local PINYIN_PARSE_SET = nil
local SINGLE_DIGIT_INITIALS = nil

local function pinyin_parse_set()
  if PINYIN_PARSE_SET ~= nil then return PINYIN_PARSE_SET end
  local result = {}
  for word in tostring(PINYIN_PARSE_SYLLABLES):gmatch("[a-zv]+") do result[word] = true end
  PINYIN_PARSE_SET = result
  return result
end

local function single_digit_initials(tail)
  tail = tostring(tail or "")
  if tail:match("^[2-9]$") == nil then return {} end
  if SINGLE_DIGIT_INITIALS == nil then
    local by_digit = {}
    local seen = {}
    for word in tostring(PINYIN_PARSE_SYLLABLES):gmatch("[a-zv]+") do
      local first = word:sub(1, 1)
      local digit = exact_t9_digits(first)
      if first ~= "" and digit ~= "" and not seen[first] then
        seen[first] = true
        by_digit[digit] = by_digit[digit] or {}
        by_digit[digit][#by_digit[digit] + 1] = first
      end
    end
    SINGLE_DIGIT_INITIALS = by_digit
  end
  return SINGLE_DIGIT_INITIALS[tail] or {}
end

local function split_compact_pinyin(token)
  token = tostring(token or ""):lower()
  if token == "" then return {} end
  local syllables = pinyin_parse_set()
  if syllables[token] then return { token } end

  local memo = {}
  local function solve(pos)
    if pos > #token then return {} end
    if memo[pos] ~= nil then return memo[pos] or nil end
    local max_len = math.min(6, #token - pos + 1)
    for len = max_len, 1, -1 do
      local part = token:sub(pos, pos + len - 1)
      if syllables[part] then
        local rest = solve(pos + len)
        if rest ~= nil then
          local result = { part }
          for _, item in ipairs(rest) do result[#result + 1] = item end
          memo[pos] = result
          return result
        end
      end
    end
    memo[pos] = false
    return nil
  end
  return solve(1) or { token }
end

local function normalize_pinyin_text(text)
  local value = tostring(text or ""):lower()
  if value == "" then return {} end
  value = value:gsub("ǖ", "v"):gsub("ǘ", "v"):gsub("ǚ", "v"):gsub("ǜ", "v"):gsub("ü", "v")
  value = value:gsub("ā", "a"):gsub("á", "a"):gsub("ǎ", "a"):gsub("à", "a")
  value = value:gsub("ō", "o"):gsub("ó", "o"):gsub("ǒ", "o"):gsub("ò", "o")
  value = value:gsub("ē", "e"):gsub("é", "e"):gsub("ě", "e"):gsub("è", "e")
  value = value:gsub("ī", "i"):gsub("í", "i"):gsub("ǐ", "i"):gsub("ì", "i")
  value = value:gsub("ū", "u"):gsub("ú", "u"):gsub("ǔ", "u"):gsub("ù", "u")
  value = value:gsub("ń", "n"):gsub("ň", "n"):gsub("ǹ", "n"):gsub("ḿ", "m")
  -- Wanxiang auxiliary codes after ';' are not pinyin.
  value = value:gsub(";[^%s'，,]*", "")
  value = value:gsub("[1-5]", "")

  local raw = {}
  for word in value:gmatch("[a-zv]+") do raw[#raw + 1] = word end
  if #raw ~= 1 then return raw end
  return split_compact_pinyin(raw[1])
end

local function candidate_pinyin_path(candidate)
  if candidate == nil then return {} end

  -- The bridge filter is registered before Wanxiang's display filters, so the
  -- translator comment is the first and most direct Rime-owned spelling path.
  local path = normalize_pinyin_text(candidate.comment)
  if #path > 0 then return path end

  -- Wrapped candidates can hide the original comment. Read the genuine phrase
  -- DictEntry code, still without inventing any pinyin from raw digits.
  local ok_genuine, genuine = pcall(function()
    if candidate.get_genuine == nil then return nil end
    return candidate:get_genuine()
  end)
  if ok_genuine and genuine ~= nil then
    local ok_phrase, phrase = pcall(function()
      if genuine.to_phrase == nil then return nil end
      return genuine:to_phrase()
    end)
    if ok_phrase and phrase ~= nil and phrase.entry ~= nil then
      path = normalize_pinyin_text(phrase.entry.custom_code)
      if #path > 0 then return path end
    end
  end

  return normalize_pinyin_text(candidate.preedit)
end

local function path_starts_with(path, prefix)
  if #prefix > #path then return false end
  for index = 1, #prefix do
    if path[index] ~= prefix[index] then return false end
  end
  return true
end

local function paths_prefix_compatible(a, b)
  return path_starts_with(a, b) or path_starts_with(b, a)
end

local function set_property(context, name, value)
  if context == nil or context.set_property == nil then return false end
  return pcall(function() context:set_property(name, tostring(value or "")) end)
end

local function get_property(context, name)
  if context == nil or context.get_property == nil then return "" end
  local ok, value = pcall(function() return context:get_property(name) end)
  return ok and tostring(value or "") or ""
end

local function decode_selected(context)
  local result = {}
  for item in get_property(context, kSelectedProperty):gmatch("[a-zv]+") do
    result[#result + 1] = item
  end
  return result
end

local function encode_selected(selected)
  return table.concat(selected or {}, "'")
end

local function write_selected(context, selected)
  return set_property(context, kSelectedProperty, encode_selected(selected))
end

local function read_partial_prefix(context)
  return get_property(context, kPartialPrefixProperty):lower():match("^([a-zv]+)$") or ""
end

local function write_partial_prefix(context, prefix)
  return set_property(context, kPartialPrefixProperty, tostring(prefix or ""))
end

local function starts_with_text(value, prefix)
  value = tostring(value or "")
  prefix = tostring(prefix or "")
  return prefix == "" or value:sub(1, #prefix) == prefix
end

local function active_segment(context)
  if context == nil or context.composition == nil then return nil end
  local ok, segment = pcall(function()
    local composition = context.composition
    if composition:empty() then return nil end
    return composition:back()
  end)
  return ok and segment or nil
end

local function active_menu(context, prepare_count)
  local segment = active_segment(context)
  local menu = segment and segment.menu or nil
  if menu ~= nil and prepare_count ~= nil and menu.prepare ~= nil then
    pcall(function() menu:prepare(prepare_count) end)
  end
  return menu
end

local function menu_candidate_count(menu)
  if menu == nil or menu.candidate_count == nil then return 0 end
  local ok, count = pcall(function() return menu:candidate_count() end)
  if not ok then return 0 end
  return tonumber(count or 0) or 0
end

local function collect_option_records(context)
  local selected = decode_selected(context)
  local partial = read_partial_prefix(context)
  local tail = unresolved_tail(context, selected)
  local menu = active_menu(context, kMenuPrepareLimit)
  local candidate_count = menu_candidate_count(menu)
  local result = {}
  local by_label = {}

  if tail == nil or tail == "" then
    return result, candidate_count
  end

  -- Xime/Hamster-style T9 frontends keep a first-syllable source independent
  -- from whether the current Rime menu has already materialized candidates.
  -- We only need the missing first-key capability here. Restrict the canonical
  -- fallback to a one-digit unresolved tail so later/fuzzy/completion ordering
  -- remains entirely sourced from the live Wanxiang menu.
  if #tail == 1 then
    for _, label in ipairs(single_digit_initials(tail)) do
      if starts_with_text(label, partial) then
        local record = {
          label = label,
          complete = false,
        }
        by_label[label] = record
        result[#result + 1] = record
      end
    end
  end

  if menu == nil or menu.get_candidate_at == nil then
    return result, candidate_count
  end

  for index = 0, candidate_count - 1 do
    local ok, candidate = pcall(function() return menu:get_candidate_at(index) end)
    if not ok or candidate == nil then break end
    local path = candidate_pinyin_path(candidate)
    local syllable = nil

    if #selected == 0 then
      syllable = path[1]
    elseif path_starts_with(path, selected) and #path > #selected then
      syllable = path[#selected + 1]
    else
      -- Rime may expose only the active unresolved segment after a selected
      -- prefix. It remains eligible only under exact raw-digit proof.
      local candidate_label = path[1]
      if candidate_label ~= nil and exact_tail_match(candidate_label, tail) then
        syllable = candidate_label
      end
    end

    if syllable ~= nil and starts_with_text(syllable, partial) then
      local label, complete = option_prefix_for_tail(syllable, tail)
      if label ~= nil and label:match("^[a-zv]+$") then
        local existing = by_label[label]
        if existing == nil then
          existing = {
            label = label,
            complete = complete and label == syllable,
          }
          by_label[label] = existing
          result[#result + 1] = existing
          if #result >= kOptionLimit then break end
        else
          -- A canonical single-key prefix becomes a completed option as soon
          -- as the live Rime menu exposes that same full syllable.
          if complete and label == syllable then existing.complete = true end
        end
      end
    end
  end
  return result
end

local function refresh_context(context)
  if context == nil or context.refresh_non_confirmed_composition == nil then return false end
  return pcall(function() context:refresh_non_confirmed_composition() end)
end

local function menu_supports_selected(context, selected)
  if #selected == 0 then return true end
  local menu = active_menu(context, kMenuPrepareLimit)
  local count = menu_candidate_count(menu)
  if menu == nil or menu.get_candidate_at == nil then return false end
  local tail = exact_remaining_tail(context, selected)
  for index = 0, count - 1 do
    local ok, candidate = pcall(function() return menu:get_candidate_at(index) end)
    if not ok or candidate == nil then break end
    local path = candidate_pinyin_path(candidate)
    -- A shorter legal candidate (for example 为 when selected is wei'ji'xian)
    -- does NOT by itself prove that the full selected path is still valid.
    if path_starts_with(path, selected) then return true end
    -- But an active-tail candidate can prove the prefix remains valid when the
    -- raw numeric input still matches the selected prefix exactly. This keeps
    -- abbreviation/fuzzy cases out of the fallback unless Rime supplies a
    -- normal full compatible path.
    if path[1] ~= nil and exact_tail_match(path[1], tail) then return true end
  end
  return false
end

local function reconcile_selected_from_rime(context)
  if context == nil or tostring(context.input or "") == "" then
    write_selected(context, {})
    return
  end
  local selected = decode_selected(context)
  while #selected > 0 do
    if menu_supports_selected(context, selected) then return end
    -- A normal Rime edit (most commonly BackSpace) invalidated the latest
    -- explicit choice. Roll back ONE selected syllable, ask Rime to recompose,
    -- and let the new Rime menu decide whether the remaining prefix is valid.
    table.remove(selected)
    write_selected(context, selected)
    if not refresh_context(context) then return end
  end
end

local function reconcile_partial_prefix(context)
  local partial = read_partial_prefix(context)
  if partial == "" then return end
  local selected = decode_selected(context)
  local tail = unresolved_tail(context, selected)
  local digits = exact_t9_digits(partial)
  if tail == nil or digits == "" or tail:sub(1, #digits) ~= digits then
    write_partial_prefix(context, "")
  end
end

local function publish_options(context)
  if context == nil or tostring(context.input or "") == "" then
    write_selected(context, {})
    write_partial_prefix(context, "")
    set_property(context, kOptionsProperty, "")
    return true
  end

  reconcile_selected_from_rime(context)
  reconcile_partial_prefix(context)
  local records = collect_option_records(context)
  local labels = {}
  for _, item in ipairs(records) do labels[#labels + 1] = item.label end
  local options_ok = set_property(context, kOptionsProperty, table.concat(labels, ";"))
  return options_ok
end

local function current_option_map(context)
  local records = collect_option_records(context)
  local result = {}
  for _, item in ipairs(records) do result[item.label] = item end
  return result
end

local function apply_selection(env)
  local context = env.engine.context
  local request = get_property(context, kSelectionRequestProperty):lower():match("^%s*([a-zv]+)%s*$")
  set_property(context, kSelectionRequestProperty, "")
  if request == nil then return false end

  -- Validate against the same resolved option set shown by the UI: current
  -- Rime menu records plus the one-digit canonical prefix fallback. The
  -- fallback constrains selection/display only and never replaces input.
  local options = current_option_map(context)
  if options[request] == nil then return false end

  local record = options[request]
  if record.complete then
    local selected = decode_selected(context)
    selected[#selected + 1] = request
    if not write_selected(context, selected) then return false end
    write_partial_prefix(context, "")
  else
    -- A short typed prefix (for example 9 -> w) is a constraint on the next
    -- Rime syllable, not a completed syllable. Keep it separate from selected.
    if not write_partial_prefix(context, request) then return false end
  end
  set_property(context, kOptionsProperty, "")
  return refresh_context(context)
end

local function prepare_candidate_selection(env)
  local context = env.engine.context
  local raw_index = tonumber(get_property(context, kCandidateIndexProperty) or "")
  set_property(context, kCandidateIndexProperty, "")
  set_property(context, kPendingConsumeProperty, "")
  if raw_index == nil or raw_index < 0 then return false end

  local selected = decode_selected(context)
  if #selected == 0 then
    set_property(context, kPendingConsumeProperty, 0)
    return true
  end

  local index = math.floor(raw_index)
  local menu = active_menu(context, index + 1)
  if menu == nil or menu.get_candidate_at == nil then return false end
  local ok, candidate = pcall(function() return menu:get_candidate_at(index) end)
  if not ok or candidate == nil then return false end

  -- The number of selected syllables consumed by a right-side candidate is
  -- derived from THAT candidate's Rime spelling path, never from offsets.
  local path = candidate_pinyin_path(candidate)
  local consumed = 0
  local limit = math.min(#path, #selected)
  while consumed < limit and path[consumed + 1] == selected[consumed + 1] do
    consumed = consumed + 1
  end
  if consumed <= 0 then return false end
  set_property(context, kPendingConsumeProperty, consumed)
  return true
end

local function finalize_candidate_selection(env)
  local context = env.engine.context
  write_partial_prefix(context, "")
  local consumed = tonumber(get_property(context, kPendingConsumeProperty) or "") or 0
  set_property(context, kPendingConsumeProperty, "")
  if consumed <= 0 then return true end

  local selected = decode_selected(context)
  local remaining = {}
  for index = consumed + 1, #selected do remaining[#remaining + 1] = selected[index] end
  if tostring(context.input or "") == "" then remaining = {} end
  if not write_selected(context, remaining) then return false end
  set_property(context, kOptionsProperty, "")
  if tostring(context.input or "") == "" then return true end
  return refresh_context(context)
end

local function clear_bridge_state(context)
  write_selected(context, {})
  write_partial_prefix(context, "")
  set_property(context, kOptionsProperty, "")
  set_property(context, kSelectionRequestProperty, "")
  set_property(context, kCandidateIndexProperty, "")
  set_property(context, kPendingConsumeProperty, "")
end

local function processor_init(env)
  clear_bridge_state(env.engine.context)
end

local function processor_fini(env)
end

local function processor_func(key, env)
  if key:release() then return kNoop end
  if key.keycode == kProbeKey then
    publish_options(env.engine.context)
    if set_property(env.engine.context, kReadyProperty, "1") then return kAccepted end
    return kNoop
  end
  if key.keycode == kApplySelectionKey then
    if apply_selection(env) then return kAccepted end
    return kNoop
  end
  if key.keycode == kPrepareCandidateKey then
    if prepare_candidate_selection(env) then return kAccepted end
    return kNoop
  end
  if key.keycode == kFinalizeCandidateKey then
    if finalize_candidate_selection(env) then return kAccepted end
    return kNoop
  end
  -- Ordinary digits, BackSpace, apostrophe, selection keys and commits remain
  -- Rime/Wanxiang-owned. The bridge only handles the four private control keys.
  return kNoop
end

local function filter_func(input, env)
  local context = env.engine.context
  local selected = decode_selected(context)
  local partial = read_partial_prefix(context)
  if #selected == 0 and partial == "" then
    for candidate in input:iter() do yield(candidate) end
    return
  end

  for candidate in input:iter() do
    local path = candidate_pinyin_path(candidate)
    local keep = false

    if #path > 0 and paths_prefix_compatible(path, selected) then
      if partial == "" then
        keep = true
      elseif #path <= #selected then
        -- A shorter candidate may legally consume already-selected syllables.
        keep = true
      else
        keep = starts_with_text(path[#selected + 1], partial)
      end
    elseif #path > 0 then
      -- Active-tail fallback remains Rime-sourced and exact-code verified.
      local tail = unresolved_tail(context, selected)
      if exact_tail_match(path[1], tail) and starts_with_text(path[1], partial) then
        keep = true
      end
    end

    if keep then yield(candidate) end
  end
end

local processor = {
  init = processor_init,
  fini = processor_fini,
  func = processor_func,
}

local filter = {
  func = filter_func,
}

t9_bridge = {
  processor = processor,
  filter = filter,
}

return {
  processor = processor,
  filter = filter,
}
`;
