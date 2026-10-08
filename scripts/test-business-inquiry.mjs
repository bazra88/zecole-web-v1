import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const source = await readFile(new URL("../app/business/page.js", import.meta.url), "utf8");
const { code } = await transform(source, {
  filename: "page.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});

async function submitWith(reply) {
  const states = [];
  const calls = [];
  let resets = 0;
  const fields = { name: "Test", email: "test@example.com", type: "기타", subject: "Test", message: "Test message", website: "" };
  const form = { reset() { resets += 1; } };
  const event = { currentTarget: form, preventDefault() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(id) {
      if (id === "react") return { useState: () => [{ type: "idle", message: "" }, state => states.push(state)] };
      if (id === "@/components/SectionHeader") return { default: () => null };
      return require(id);
    },
    FormData: class {
      constructor(target) { assert.equal(target, form); }
      *[Symbol.iterator]() { yield* Object.entries(fields); }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      // React clears currentTarget when its synchronous event dispatch finishes.
      event.currentTarget = null;
      return reply();
    },
  });
  const tree = module.exports.default();
  const formElement = tree.props.children.find(child => child.type === "form");
  await formElement.props.onSubmit(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/business-inquiry");
  assert.deepEqual(JSON.parse(calls[0].options.body), fields);
  return { states, resets };
}

const success = await submitWith(() => ({ ok: true, json: async () => ({ ok: true }) }));
assert.equal(success.states.at(-1).type, "success", success.states.at(-1).message);
assert.equal(success.resets, 1);

const rejected = await submitWith(() => ({ ok: false, json: async () => ({ error: "메일 전송에 실패했습니다." }) }));
assert.equal(rejected.states.at(-1).type, "error");
assert.equal(rejected.states.at(-1).message, "메일 전송에 실패했습니다.");
assert.equal(rejected.resets, 0, "Keep the message available for retry on failure");

const offline = await submitWith(() => { throw new Error("Network error"); });
assert.equal(offline.states.at(-1).type, "error");
assert.equal(offline.resets, 0);
console.log("Business inquiry: async success resets the saved form; server and network errors preserve input.");
