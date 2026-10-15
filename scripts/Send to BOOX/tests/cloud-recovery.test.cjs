const test = require("node:test")
const assert = require("node:assert/strict")
const { httpStatus, isGatewayTransient, isUnauthorized, readWithCloudRecovery } =
  require(process.env.BOOX_RECOVERY_MODULE)

const httpError = (status) => Object.assign(new Error("gateway response"), { status })

test("healthy cloud load skips account preflight and retry", async () => {
  let reads = 0, checks = 0, recovery = 0
  const result = await readWithCloudRecovery(
    async () => { reads++; return "page" },
    async () => { checks++ },
    () => { recovery++ },
  )
  assert.equal(result, "page")
  assert.deepEqual([reads, checks, recovery], [1, 0, 0])
})

test("first 504 checks current user and retries with a fresh read", async () => {
  let reads = 0, checks = 0, recovery = 0
  const result = await readWithCloudRecovery(
    async () => { if (++reads === 1) throw httpError(504); return "books" },
    async () => { checks++ },
    () => { recovery++ },
  )
  assert.equal(result, "books")
  assert.deepEqual([reads, checks, recovery], [2, 1, 1])
})

test("502 and 503 qualify for one retry; arbitrary errors do not", async () => {
  for (const status of [502, 503]) {
    let reads = 0
    await readWithCloudRecovery(
      async () => { if (++reads === 1) throw httpError(status); return 1 },
      async () => {},
    )
    assert.equal(reads, 2)
  }
  let calls = 0
  await assert.rejects(
    readWithCloudRecovery(async () => { calls++; throw new Error("unexpected") }, async () => {}),
    /unexpected/,
  )
  assert.equal(calls, 1)
})

test("unauthorized initial request advises login check, never retries", async () => {
  let reads = 0, checks = 0
  await assert.rejects(readWithCloudRecovery(
    async () => { reads++; throw httpError(401) },
    async () => { checks++ },
  ), /登录可能已失效/)
  assert.deepEqual([reads, checks], [1, 0])
})

test("account verification 401 prevents a second cloud request", async () => {
  let reads = 0
  await assert.rejects(readWithCloudRecovery(
    async () => { reads++; throw httpError(504) },
    async () => { throw httpError(401) },
  ), /登录已失效/)
  assert.equal(reads, 1)
})

test("account check failure other than auth does not block one fresh retry", async () => {
  let reads = 0
  const result = await readWithCloudRecovery(
    async () => { if (++reads === 1) throw httpError(504); return "available" },
    async () => { throw httpError(503) },
  )
  assert.equal(result, "available")
  assert.equal(reads, 2)
})

test("two 504s with valid account distinguish gateway from token failure", async () => {
  let reads = 0
  await assert.rejects(readWithCloudRecovery(
    async () => { reads++; throw httpError(504) },
    async () => {},
  ), /账号验证正常，但BOOX 云盘网关暂时不可用（504）/)
  assert.equal(reads, 2)
})

test("if account check also fails, do not claim account valid", async () => {
  await assert.rejects(readWithCloudRecovery(
    async () => { throw httpError(504) },
    async () => { throw new Error("network down") },
  ), (error) => !error.message.includes("账号验证正常") && error.message.includes("504"))
})

test("structured status and legacy HTTP message are recognized safely", () => {
  assert.equal(httpStatus(httpError(504)), 504)
  assert.equal(httpStatus(new Error("BOOX 请求失败 (503)")), 503)
  assert.equal(httpStatus(new Error("connect ETIMEDOUT")), null)
  assert.equal(isGatewayTransient(httpError(503)), true)
  assert.equal(isGatewayTransient(httpError(401)), false)
  assert.equal(isUnauthorized(httpError(403)), true)
})
