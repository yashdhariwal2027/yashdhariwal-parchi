import { test } from "node:test";
import assert from "node:assert/strict";
import { loadClarity, validClarityId } from "../src/lib/clarity";

function fakeDoc() {
  const appended: { async?: boolean; src?: string }[] = [];
  const win: Record<string, unknown> = {};
  const doc = {
    defaultView: win,
    createElement: () => ({}) as { async?: boolean; src?: string },
    head: { appendChild: (el: { src?: string }) => appended.push(el) },
  };
  return { doc: doc as unknown as Document, win, appended };
}

test("only accepts real-looking Clarity project IDs", () => {
  assert.equal(validClarityId("abc123xyz0"), "abc123xyz0");
  assert.equal(validClarityId("  abc123xyz0 "), "abc123xyz0");
  assert.equal(validClarityId(undefined), null);
  assert.equal(validClarityId(""), null);
  assert.equal(validClarityId("abc"), null);
  assert.equal(validClarityId('x"><script>'), null);
  assert.equal(validClarityId("https://www.clarity.ms/tag/abc123"), null);
});

test("loads the Clarity tag once on the live site", () => {
  const { doc, win, appended } = fakeDoc();
  assert.equal(loadClarity("abc123xyz0", true, doc), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "https://www.clarity.ms/tag/abc123xyz0");
  assert.equal(appended[0].async, true);
  assert.equal(typeof win.clarity, "function");
  assert.equal(loadClarity("abc123xyz0", true, doc), false, "second call must not add another tag");
  assert.equal(appended.length, 1);
});

test("does nothing in development or without a valid ID", () => {
  for (const [id, prod] of [["abc123xyz0", false], [undefined, true], ["bad id!", true]] as const) {
    const { doc, appended } = fakeDoc();
    assert.equal(loadClarity(id, prod, doc), false);
    assert.equal(appended.length, 0);
  }
});
