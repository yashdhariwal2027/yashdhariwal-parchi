import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl } from "../src/lib/site";

test("www. goes to the plain domain, keeping the page; everything else stays", () => {
  assert.equal(canonicalUrl("https://www.getparchi.com/pricing?x=1#faq"), "https://getparchi.com/pricing?x=1#faq");
  assert.equal(canonicalUrl("https://www.getparchi.com/"), "https://getparchi.com/");
  assert.equal(canonicalUrl("https://getparchi.com/plan"), null);
  assert.equal(canonicalUrl("https://parchi.pages.dev/"), null);
  assert.equal(canonicalUrl("https://abc123.parchi.pages.dev/"), null);
  assert.equal(canonicalUrl("http://localhost:5173/"), null);
});
