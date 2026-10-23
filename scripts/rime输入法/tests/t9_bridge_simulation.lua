-- Runs the production T9 Lua bridge against an instrumented, deterministic
-- Rime context/menu simulator. Does not claim native librime/iOS coverage.
local source = assert(arg[1], "pass extracted T9BridgeAsset Lua path")
local bridge = assert(loadfile(source))()
local digit_table = {}
for key, letters in pairs({
  ["2"]="abc", ["3"]="def", ["4"]="ghi", ["5"]="jkl",
  ["6"]="mno", ["7"]="pqrs", ["8"]="tuv", ["9"]="wxyz"
}) do
  for i=1,#letters do digit_table[letters:sub(i,i)] = key end
end
local function digits(s)
  return (s:gsub("[a-z]",function(letter)
    return assert(digit_table[letter], letter)
  end):gsub(" ", ""))
end
local function split(s)
  local result = {}
  for word in s:gmatch("[a-z]+") do result[#result+1] = word end
  return result
end
local checks = 0
local function same(got, want, desc)
  checks = checks + 1
  if got ~= want then
    error(desc .. ": expected '" .. tostring(want) .. "' got '" .. tostring(got) .. "'", 2)
  end
end
local function includes(options, want, desc)
  for v in tostring(options):gmatch("[a-z]+") do
    if v == want then checks = checks+1; return end
  end
  error(desc .. ": missing '" .. want .. "' from '" .. tostring(options) .. "'", 2)
end
local function setup(phrase, mode)
  local words = split(phrase)
  local context = {input = digits(phrase), props={}}
  function context:set_property(name, value) self.props[name] = tostring(value or "") end
  function context:get_property(name) return self.props[name] or "" end
  function context:refresh_non_confirmed_composition() return true end
  local menu = { candidates={} }
  function menu:prepare(count) self.prepared = count end
  function menu:candidate_count() return math.min(#self.candidates, self.prepared or 0) end
  function menu:get_candidate_at(index) return self.candidates[index+1] end
  local seg = {start=0, menu=menu}
  context.composition = {
    empty=function()return false end,
    back=function() return seg end
  }
  if mode == "short" or mode == "rank97" then
    local preceding = {}
    for i=1,#words-1 do preceding[#preceding+1] = words[i] end
    local candidate = {comment=table.concat(preceding," "),text="partial"}
    if mode == "short" then
      menu.candidates={candidate}
    else
      for i=1,96 do menu.candidates[i]=candidate end
      menu.candidates[97]={comment=phrase,text="late"}
    end
  elseif mode == "no-menu" then
    seg.menu = nil
  elseif mode == "compact" then
    menu.candidates={{comment=table.concat(words,""),text="whole"}}
  elseif mode == "apostrophe" then
    menu.candidates={{comment=table.concat(words,"'"),text="whole"}}
  else
    menu.candidates={{comment=phrase,text="whole"}}
  end
  local env={engine={context=context}}
  local function send(keycode)
    return bridge.processor.func({
      keycode=keycode,release=function() return false end
    },env)
  end
  bridge.processor.init(env)
  local sim={
    c=context,seg=seg,menu=menu,words=words,
    probe=function()
      send(0xffd4)
      return context:get_property("t9_bridge_options")
    end,
    select=function(label)
      context:set_property("t9_bridge_selection_request",label)
      return send(0xffd5)
    end,
    prepare=function(index)
      context:set_property("t9_bridge_candidate_index",index)
      return send(0xffd6)
    end,
    pending=function()
      return context:get_property("t9_bridge_pending_consume")
    end,
    finalize=function() return send(0xffd7) end,
    selected=function() return context:get_property("t9_bridge_selected") end
  }
  return sim
end

local phrases={
 "shi gan lan","wei ji xian","wo men","zhong guo",
 "bei jing","ming tian","chang lai","hao peng you",
 "ni hao ma","shi jian","kai xin","zai jian",
 "zhong guo ren","shen me","xi an","xian zai",
 "gan lan","shi gan","you hao","lan tian",
 "wei guo","xin nian","xin xi","hong guo"
}

local successful = 0
for _,phrase in ipairs(phrases) do
  for _,mode in ipairs({"full","short","rank97","no-menu","apostrophe"}) do
    for _,drifting in ipairs({false,true}) do
      local sim=setup(phrase,mode)
      local consumed=0
      for i,word in ipairs(sim.words) do
        includes(sim.probe(),word,phrase.." mode="..mode.." drift="..tostring(drifting).." index="..i)
        same(sim.select(word),1,phrase.." accept "..word)
        consumed=consumed+#digits(word)
        if drifting then sim.seg.start=consumed end
      end
      same(sim.selected(),table.concat(sim.words,"'"),phrase.." selected path")
      same(sim.probe(),"",phrase.." all input consumed")
      successful=successful+1
    end
  end
end
-- No advanced exact-digit fallback may mutate Rime's Chinese candidate list.
local independent=setup("shi gan lan","short")
independent.probe()
independent.select("shi")
independent.probe()
independent.select("gan")
includes(independent.probe(),"lan","whole-word candidate not materialized")

local shifted=setup("shi gan lan","full")
shifted.probe()
shifted.select("shi")
shifted.seg.start=3
includes(shifted.probe(),"gan","active segment starts at 3")
shifted.select("gan")
shifted.seg.start=6
includes(shifted.probe(),"lan","active segment starts at 6")

local edited=setup("shi gan lan","full")
edited.probe();edited.select("shi");edited.probe();edited.select("gan")
edited.probe();edited.select("lan")
edited.c.input="74442652" -- remove last digit from selected 'lan'
edited.seg.start=0
includes(edited.probe(),"la","BackSpace inside selected last syllable")
same(edited.selected(),"shi'gan","BackSpace rolls back invalid syllable")
edited.c.input="74442" -- remove into the previous selected 'gan'
includes(edited.probe(),"ga","BackSpace inside penultimate syllable")
same(edited.selected(),"shi","BackSpace preserves only valid selected prefix")

local partial=setup("wei ji xian","full")
partial.c.input="9"
includes(partial.probe(),"w","initial selection")
same(partial.select("w"),1,"partial initial accepted")
partial.c.input="93"
includes(partial.probe(),"we","partial spelling grows")
partial.c.input="934"
includes(partial.probe(),"wei","complete spelling grows")
same(partial.select("wei"),1,"complete syllable accepted")
same(partial.selected(),"wei","complete syllable committed to bridge property")

local invalid=setup("shi gan lan","full")
invalid.probe()
same(invalid.select("xyz"),2,"nonexistent syllable rejected")
same(invalid.selected(),"","invalid label cannot mutate selected state")

local commit=setup("shi gan lan","full")
commit.probe();commit.select("shi");commit.probe();commit.select("gan");commit.probe()
commit.menu.candidates={{comment="shi",text="candidate"}}
same(commit.prepare(0),1,"prepare partial candidate")
same(commit.pending(),"1","consume exactly one selected syllable")
commit.c.input="426526"
commit.menu.candidates={{comment="gan lan",text="unresolved"}}
commit.finalize()
same(commit.selected(),"gan","partial commit retains unconsumed syllable")
includes(commit.probe(),"lan","partial commit continues at lan")
commit.menu.candidates={{comment="gan",text="candidate"}}
same(commit.prepare(0),1,"prepare another partial candidate")
same(commit.pending(),"1","consume next selected syllable")
commit.c.input="526"
commit.menu.candidates={{comment="lan",text="unresolved"}}
commit.finalize()
same(commit.selected(),"","second partial commit removes consumed syllable")
includes(commit.probe(),"lan","second partial commit keeps unconsumed digits")

local clear=setup("shi gan lan","full")
clear.probe();clear.select("shi")
clear.c.input=""
same(clear.probe(),"","empty composition clears options")
same(clear.selected(),"","empty composition clears saved selection")

-- Seeded randomized combinations: verify raw digit composition and segment drift.
math.randomseed(20261023)
local source_words={
 "shi","gan","lan","wei","ji","xian","wo","men","zhong","guo",
 "bei","jing","ming","tian","chang","lai","hao","peng","you",
 "ni","ma","jian","kai","xin","zai","shen","me","xi","an",
 "zhu","wang","yong","xue","di","huang","qin","qing","sheng","zuo"
}
for i=1,300 do
  local words={}
  for j=1,(i%3)+2 do
    words[#words+1]=source_words[math.random(#source_words)]
  end
  local sim=setup(table.concat(words," "),"short")
  local offset=0
  for _,word in ipairs(words) do
    includes(sim.probe(),word,"random sample="..i)
    same(sim.select(word),1,"random accept sample="..i)
    offset=offset+#digits(word)
    sim.seg.start=offset
  end
  successful=successful+1
end
-- The canonical fallback must never move a Rime-sourced left option behind
-- its fallback competitors. For T9 526, multiple syllables are legal.
local ranked=setup("shi gan lan","full")
ranked.probe();ranked.select("shi");ranked.probe();ranked.select("gan")
local ordered=split(ranked.probe())
same(ordered[1],"lan","Rime-provided spelling retains first position")

-- Verify the filtered Chinese candidate stream is not synthetically extended.
local filtered=setup("shi gan lan","full")
filtered.probe();filtered.select("shi");filtered.probe();filtered.select("gan")
local input={ candidates={
  {comment="shi gan lan",text="whole"},
  {comment="shi gan",text="short"},
  {comment="lan",text="tail"},
  {comment="wo men",text="unrelated"}
}}
function input:iter()
  local index=0
  return function() index=index+1;return self.candidates[index] end
end
local kept={}
yield=function(item)kept[#kept+1]=item.text end
bridge.filter.func(input,{engine={context=filtered.c}})
same(table.concat(kept,","),"whole,short,tail","Chinese candidate filtering unchanged")
yield=nil

-- Property fuzz: legal visible spelling must exactly match the unresolved T9
-- digit prefix, and option count/deduplication must remain bounded.
math.randomseed(20261024)
local alphabet="23456789"
for sample=1,1200 do
  local length=(sample%16)+1
  local chars={}
  for i=1,length do
    local idx=math.random(#alphabet)
    chars[i]=alphabet:sub(idx,idx)
  end
  local raw=table.concat(chars)
  local probe=setup("shi gan lan","no-menu")
  probe.c.input=raw
  local options=split(probe.probe())
  same(#options<=48,true,"option limit sample="..sample)
  local seen={}
  for _,label in ipairs(options) do
    same(seen[label]==nil,true,"dedup sample="..sample)
    seen[label]=true
    local spelled=digits(label)
    local compatible=(raw:sub(1,#spelled)==spelled)
      or (spelled:sub(1,#raw)==raw)
    same(compatible,true,"digit prefix sample="..sample.." label="..label)
  end
end

print("T9_BRIDGE_SIM_PASS sequences="..successful.." assertions="..checks)
