const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const calls = [];
let responses = [];
const stored = new Map();
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === "scripting") return {
    fetch: async (url, options={}) => {
      calls.push({url,options});
      if (!responses.length) throw new Error("Unexpected request");
      const response=responses.shift();
      if (response instanceof Error) throw response;
      return {ok:true,status:200,text:async()=>JSON.stringify(response)};
    }
  };
  return originalLoad.call(this,name,parent,main);
};
global.Keychain={get:()=>null,set:()=>true,remove:()=>true};
global.Storage={
  get:key=>stored.get(key)??null,
  set:(key,val)=>{stored.set(key,val);return true},
  remove:key=>stored.delete(key)
};
const api=require(path.resolve(__dirname,".compiled/api.js"));
Module._load=originalLoad;
const book=(id,extension)=>({id,hash:"hash"+id,title:"Book "+id,author:"Writer",extension,language:"Chinese"});

test("Chinese recent single request with date ordering, no legacy round trip",async()=>{
  calls.length=0;stored.clear();responses=[{success:1,books:[book(11,"pdf")],pagination:{total_items:1}}];
  const result=await api.recent(1,true);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/eapi\/book\/search$/);
  const form=new URLSearchParams(calls[0].options.body);
  assert.equal(form.get("message"),"");
  assert.equal(form.get("order"),"date");
  assert.deepEqual(form.getAll("languages[]"),["chinese"]);
  assert.equal(result.books.length,1);
});

test("valid cache avoids network on repeat and invalidates on refresh",async()=>{
  calls.length=0; responses=[];
  assert.equal((await api.recent(1)).books.length,1);
  assert.equal(calls.length,0);
  responses=[{success:1,books:[book(12,"epub")],pagination:{total_items:1}}];
  const updated=await api.recent(1,true);
  assert.equal(updated.books[0].id,"12");
  assert.equal(calls.length,1);
});

test("format choices prefer available EPUB without inventing conversion",async()=>{
  calls.length=0;responses=[{success:1,books:[book(12,"epub")]}];
  const original=api.parseBookPage({books:[book(11,"pdf")]}).books[0];
  const choices=await api.formats(original);
  assert.equal(choices.length,2);
  assert.equal(api.preferredFormat(choices).extension,"EPUB");
  responses=[{success:1,books:[]}];
  const only=await api.formats(original);
  assert.equal(only.length,1);
  assert.equal(api.preferredFormat(only).extension,"PDF");
});

test("automatic scroll pagination, fitted covers, detail limit, session check and remote update metadata",()=>{
  const base=path.resolve(__dirname,"..");
  const read=n=>fs.readFileSync(path.join(base,n),"utf8");
  assert.match(read("results.tsx"),/onScrollVisibilityChange/);
  assert.match(read("results.tsx"),/contentMode: "fit"/);
  assert.doesNotMatch(read("results.tsx"),/加载更多（第/);
  assert.match(read("catalog.tsx"),/中文最新收录/);
  assert.match(read("catalog.tsx"),/排列方式/);
  assert.match(read("detail.tsx"),/lineLimit=\{5\}/);
  assert.match(read("detail.tsx"),/preferredFormat/);
  assert.match(read("index.tsx"),/AppEvents.scenePhase/);
  assert.match(read("index.tsx"),/Script.exit/);
  const meta=JSON.parse(read("script.json"));
  assert.equal(meta.version,"0.4.0-preview.2");
  assert.equal(meta.remoteResource.url,"https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/zlibrary-ui-preview/Z-Library.zip");
});
