const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const base = path.resolve(__dirname, "..");
const mockStorage = new Map();
global.Storage = {
  get: key => mockStorage.get(key) ?? null,
  set: (key,value) => { mockStorage.set(key,value); return true },
  remove: key => mockStorage.delete(key),
};
global.Keychain = {get:()=>null,set:()=>true,remove:()=>true};
global.createElement = (type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
let queue = [], calls = [];
const original = Module._load;
Module._load = function(name,parent,main) {
  if (name === "scripting") return {
    fetch: async(url,options={}) => {
      calls.push({url,options});
      if (!queue.length) throw new Error("unexpected API call");
      return {ok:true,status:200,text:async()=>JSON.stringify(queue.shift())};
    },
    ...Object.fromEntries(["List","Section","Text","Button","Image","NavigationLink","VStack","HStack","Spacer"].map(s=>[s,s]))
  };
  if (name === "./detail" && parent?.filename.endsWith("/results.js")) return {BookDetails: () => null};
  return original.call(this,name,parent,main);
};
const prefs = require(path.join(base,"tests/.compiled/search-options.js"));
const {Results} = require(path.join(base,"tests/.compiled/results.js"));
const api = require(path.join(base,"tests/.compiled/api.js"));
Module._load=original;

test("search filters remember all fields only when checked, and uncheck resets",()=>{
  mockStorage.clear();
  assert.equal(prefs.readSearchPrefs(),null);
  const value = {query:"历史",yearFrom:"2018",yearTo:"2026",
    language:"chinese",format:"epub",order:"date"};
  prefs.saveSearchPrefs(value);
  assert.deepEqual(prefs.readSearchPrefs(),value);
  prefs.saveSearchPrefs(null);
  assert.equal(prefs.readSearchPrefs(),null);
  assert.equal(prefs.DEFAULT_PREFS.order,"relevance");
});

test("invalid saved selectors fall back, without losing legitimate keywords",()=>{
  mockStorage.clear();
  prefs.saveSearchPrefs({query:"React",yearFrom:"1899",yearTo:"9999",
    language:"zz",format:"evil",order:"unexpected"});
  const saved=prefs.readSearchPrefs();
  assert.equal(saved.query,"React");
  for (const key of ["yearFrom","yearTo","language","format"])
    assert.equal(saved[key],"");
  assert.equal(saved.order,"relevance");
  prefs.saveSearchPrefs(null);
  assert.ok(prefs.YEAR_CHOICES.some(x=>x.value==="1920"));
  assert.ok(prefs.YEAR_CHOICES.some(x=>x.value===String(new Date().getFullYear())));
});

test("search sends selected ordering and all official-style filters",async()=>{
  queue=[{success:1,books:[],pagination:{total_items:0}}];
  calls.length=0;
  await api.search("history",2,"chinese","epub","2020","2026","date");
  assert.equal(calls.length,1);
  const url=calls[0].url;
  assert.match(url,/eapi\/book\/search/);
  const form=new URLSearchParams(calls[0].options.body);
  assert.equal(form.get("message"),"history");
  assert.equal(form.get("page"),"2");
  assert.equal(form.get("order"),"date");
  assert.equal(form.get("yearFrom"),"2020");
  assert.equal(form.get("yearTo"),"2026");
  assert.deepEqual(form.getAll("languages[]"),["chinese"]);
  assert.deepEqual(form.getAll("extensions[]"),["epub"]);
});

test("results scroll geometry triggers next page before footer becomes visible",()=>{
  let calls=0;
  const props={books:[{id:"1",hash:"h",cover:"",title:"book",author:"a",language:"",year:2026,extension:"EPUB",size:""}],
    busy:false,error:"",total:100,nextPage:2,canLoadMore:true,
    refresh:()=>{},loadMore:()=>{calls++}};
  const tree=Results(props);
  assert.equal(tree.type,"List");
  assert.equal(tree.props.onScrollGeometryChange.of,"geometry");
  const onChanged=tree.props.onScrollGeometryChange.onChanged;
  onChanged(null,{contentOffset:{x:0,y:200},containerSize:{height:500,width:300},contentSize:{height:2100,width:300}});
  assert.equal(calls,0,"do not request when not near bottom");
  onChanged(null,{contentOffset:{x:0,y:1500},containerSize:{height:500,width:300},contentSize:{height:2100,width:300}});
  assert.equal(calls,1,"request when bottom is in prefetch range");
  const disabled=Results({...props,busy:true});
  disabled.props.onScrollGeometryChange.onChanged(null,
    {contentOffset:{x:0,y:1800},containerSize:{height:500,width:300},contentSize:{height:2100,width:300}});
  assert.equal(calls,1,"never load while busy");
});

test("results has onAppear and visibility fallback with a keyed page sentinel",()=>{
  const props={books:[{id:"1",hash:"h",cover:"",title:"book",author:"a",language:"",year:2026,extension:"EPUB",size:""}],
    busy:false,error:"",total:100,nextPage:3,canLoadMore:true,refresh:()=>{},loadMore:()=>{}};
  const tree=Results(props);
  const flat=x=>(!x || typeof x!=="object")?[]:[x,...(x.children||[]).flatMap(flat)];
  const sentinel=flat(tree).find(n=>n.props?.key==="page-sentinel-3");
  assert.ok(sentinel);
  assert.equal(typeof sentinel.props.onAppear,"function");
  assert.equal(typeof sentinel.props.onScrollVisibilityChange.onChanged,"function");
});

test("search form contains all requested controls and filter snapshot",()=>{
  const source=fs.readFileSync(path.join(base,"catalog.tsx"),"utf8");
  for (const value of ["搜索书籍","时间","语言","格式","排列方式","记住搜索偏好"])
    assert.ok(source.includes(value),value);
  assert.match(source,/activeFilters\.current/);
  assert.match(source,/proxy\.size\.width \/ 2/);
  assert.match(source,/saveSearchPrefs/);
});
