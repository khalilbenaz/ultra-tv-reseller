"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { pickDesktopTag } = require("../updates.cjs");

test("prend la release de bureau publiée la plus récente, pas la release Android « Latest »", () => {
  const rel = [
    { tag_name: "v1.2.22" },
    { tag_name: "desktop-v1.2.17", draft: true },
    { tag_name: "desktop-v1.2.9" },
    { tag_name: "desktop-v1.2.16" },
    { tag_name: "desktop-v1.3.0-beta", prerelease: true },
  ];
  assert.strictEqual(pickDesktopTag(rel), "desktop-v1.2.16");
});

test("aucune release de bureau : null", () => {
  assert.strictEqual(pickDesktopTag([{ tag_name: "v1.2.22" }]), null);
  assert.strictEqual(pickDesktopTag(null), null);
});

test("édition Pro : releases vX.Y.Z du dépôt de distribution, jamais les desktop-v*", () => {
  const rel = [{ tag_name: "desktop-v9.9.9" }, { tag_name: "v1.2.23" }, { tag_name: "v1.3.0" }, { tag_name: "v2.0.0", draft: true }];
  assert.strictEqual(pickDesktopTag(rel, "v"), "v1.3.0");
  assert.strictEqual(pickDesktopTag(rel), "desktop-v9.9.9");
});

test("compareVersions : ordre numérique, pas alphabétique", () => {
  const { compareVersions } = require("../updates.cjs");
  assert.ok(compareVersions("1.2.26", "1.2.9") > 0);
  assert.ok(compareVersions("1.2.9", "1.2.26") < 0);
  assert.strictEqual(compareVersions("1.2.26", "1.2.26"), 0);
  assert.ok(compareVersions("1.3.0", "1.2.99") > 0);
});
