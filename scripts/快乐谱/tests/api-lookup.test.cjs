const assert = require("node:assert/strict")
const fs = require("node:fs")
const vm = require("node:vm")
const { stripTypeScriptTypes } = require("node:module")
const source = fs.readFileSync("mysheet.ts", "utf8")
const js = stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm, "").replace(/^export /gm, ""))

function createContext(mode) {
  const state = { mode, calls: [], posts: 0, reads: 0, id7Failures: 0, persisted: null, duplicate: null, postFail: false }
  const rows = Array.from({length:45}, (_,i) => ({id:i+1,title:"Other"}))
  const response = (status,data,mime="application/json") => ({
    status, ok:status>=200&&status<300,
    headers:{get:key=> key==="content-type" ? mime : null},
    json:async()=>data,
    text:async()=>{throw Error("no text fallback")}
  })
  const ctx = {
    URL, console, setTimeout,
    Storage:{get:()=> "https://mysheet.example.test"},
    Keychain:{get:()=> "x".repeat(48)},
    titleOf:s=>s.song_name,
    fetch:async(url, init)=>{
      assert.equal(init.headers.Authorization,"Bearer "+"x".repeat(48))
      assert.equal(init.headers.Accept,"application/json")
      state.calls.push((init.method||"GET")+" "+url)
      const method=init.method||"GET"
      if (method==="POST") {
        state.posts++
        if (state.postFail) throw TypeError("write not completed")
        const input=JSON.parse(init.body)
        state.persisted={id:46,title:input.title,content_json:input.content_json}
        return response(201,state.persisted)
      }
      if (url.includes("source_provider=kuaiyuepu&source_uuid=")) {
        if (mode==="modern") return response(200,{lookup:"source_uuid_v1",matches:state.persisted?[state.persisted]:[]})
        if (mode==="ambiguous") return response(200,{lookup:"source_uuid_v1",matches:[state.duplicate,state.duplicate]})
        return response(200,rows)
      }
      if (url.endsWith("/api/songs/46")) return response(200,state.persisted)
      if (/\/api\/songs\/\d+$/.test(url)) {
        const id=Number(url.split("/").at(-1))
        if (id===7 && state.id7Failures<1) {
          state.id7Failures++
          throw TypeError("transient network")
        }
        state.reads++
        if (id===24 && state.duplicate) return response(200,state.duplicate)
        return response(200,{id,title:"Other",content_json:'{"source":{"provider":"manual","uuid":"none"}}'})
      }
      if (url.endsWith("/api/songs")) return response(200,rows)
      throw Error("Unexpected URL "+url)
    }
  }
  vm.runInNewContext(js+"; globalThis.exports = {saveToMySheet,testMySheetConnection};",ctx)
  return {api:ctx.exports,state}
}

const song={song_uuid:"abc_123",song_name:"Song"}
const dsl="{title:Song}1|2|3"
const probe={nativeDsl:dsl,sourceUuid:"abc_123",sourceTitle:"Song",sourceKey:"C",sourceRhythm:"4/4"}
;(async()=>{
  {
    const {api,state}=createContext("modern")
    assert.deepEqual(JSON.parse(JSON.stringify(await api.saveToMySheet(song,probe))),{id:46,alreadyExists:false})
    assert.equal(state.posts,1)
    assert.equal(state.reads,0)
    assert.equal(state.calls.length,3)
    assert.deepEqual(JSON.parse(JSON.stringify(await api.saveToMySheet(song,probe))),{id:46,alreadyExists:true})
    assert.equal(state.posts,1)
  }
  {
    const {api,state}=createContext("legacy")
    state.duplicate={id:24,title:"Song",content_json:JSON.stringify({source:{provider:"kuaiyuepu",uuid:"abc_123",native_dsl:dsl}})}
    const found=await api.saveToMySheet(song,probe)
    assert.equal(found.id,24)
    assert.equal(found.alreadyExists,true)
    assert.equal(state.id7Failures,1)
    assert.equal(state.reads,24)
    assert.equal(state.posts,0)
  }
  {
    const {api,state}=createContext("legacy")
    state.duplicate={id:24,title:"Renamed",content_json:JSON.stringify({source:{provider:"kuaiyuepu",uuid:"abc_123",native_dsl:"different"}})}
    await assert.rejects(()=>api.saveToMySheet(song,probe),e=>e.message.includes("DSL 不一致"))
    assert.equal(state.posts,0)
  }
  {
    const {api,state}=createContext("modern")
    state.postFail=true
    await assert.rejects(()=>api.saveToMySheet(song,probe),e=>e.message.includes("写入新曲谱"))
    assert.equal(state.posts,1)
  }
  {
    const {api,state}=createContext("ambiguous")
    state.duplicate={id:1,title:"Song",content_json:JSON.stringify({source:{provider:"kuaiyuepu",uuid:"abc_123",native_dsl:dsl}})}
    await assert.rejects(()=>api.saveToMySheet(song,probe),e=>e.message.includes("多首相同来源 UUID"))
    assert.equal(state.posts,0)
  }
  console.log("KYP_016_NATIVE_API_TESTS=PASS; modern-3-requests; legacy-transient-retry; conflicting-uuid; POST-no-retry; duplicate-uuid-guard")
})().catch(e=>{console.error(e);process.exitCode=1})
