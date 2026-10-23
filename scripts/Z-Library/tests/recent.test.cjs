const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const calls = [];
let queue = [];
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === "scripting") {
    return {
      fetch: async (url, options = {}) => {
        calls.push({ url, options });
        if (queue.length === 0) throw new Error("Unexpected network call");
        const response = queue.shift();
        return { ok: true, status: 200, text: async () => JSON.stringify(response) };
      },
    };
  }
  return originalLoad.call(this, name, parent, isMain);
};
global.Keychain = { get: () => null, set: () => true, remove: () => true };
const api = require(path.resolve(__dirname, ".compiled/api.js"));
Module._load = originalLoad;
const book = {
  id: 129349314,
  hash: "abcde123",
  title: "Recent title",
  author: "Author",
  year: 2026,
  extension: "epub",
};

test("legacy recently endpoint with books uses its response directly", async () => {
  calls.length = 0;
  queue = [{ success: 1, books: [book], pagination: { total_items: 32 } }];
  const response = await api.recent(1);
  assert.equal(response.books.length, 1);
  assert.equal(response.total, 32);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /eapi\/book\/recently/);
});

test("successful response without books falls back to date-sorted search", async () => {
  calls.length = 0;
  queue = [
    { success: 1 },
    { success: 1, books: [book], pagination: { total_items: 500 } },
  ];
  const response = await api.recent(2);
  assert.equal(response.books.length, 1);
  assert.equal(response.books[0].title, book.title);
  assert.equal(response.total, 500);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /eapi\/book\/search/);
  const form = new URLSearchParams(calls[1].options.body);
  assert.equal(form.get("order"), "date");
  assert.equal(form.get("message"), "");
  assert.equal(form.get("page"), "2");
  assert.equal(form.get("limit"), "20");
});

test("legacy endpoint no books and fallback empty books is valid empty state", async () => {
  calls.length = 0;
  queue = [{ success: 1 }, { success: 1, books: [], pagination: { total_items: 0 } }];
  const response = await api.recent(1);
  assert.deepEqual(response.books, []);
  assert.equal(response.total, 0);
});

test("duplicate refresh is disabled only for latest; exit tab uses dismiss", () => {
  const fs = require("node:fs");
  const dir = path.resolve(__dirname, "..");
  const latest = fs.readFileSync(path.join(dir, "catalog.tsx"), "utf8");
  const results = fs.readFileSync(path.join(dir, "results.tsx"), "utf8");
  const tabs = fs.readFileSync(path.join(dir, "index.tsx"), "utf8");
  assert.match(latest, /showRefresh=\{false\}/);
  assert.match(results, /showRefresh \? /);
  assert.match(tabs, /title="退出"/);
  assert.match(tabs, /Navigation\.useDismiss/);
  assert.match(tabs, /Script\.exit\(\)/);
});
