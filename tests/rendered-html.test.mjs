import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("defines the growth operating system shell and metadata", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /<Dashboard/);
  assert.match(page, /levels=\{levels\}/);
  assert.match(layout, /<html lang="zh-CN"/i);
  assert.match(layout, /千问计划 · AI 能力成长系统/);
  assert.match(layout, /证据驱动的 AI 能力成长/);
});

test("keeps the product information architecture and trust boundaries explicit", async () => {
  const [dashboard, api, schema, css, levels] = await Promise.all([
    readFile(new URL("app/Dashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/workspace/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/data.ts", root), "utf8"),
  ]);

  for (const label of ["我的成长", "能力阶梯", "评审中心", "团队"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.doesNotMatch(dashboard, /id: "assets"/);
  assert.match(dashboard, /成员概览/);
  assert.match(dashboard, /成果库/);
  assert.match(dashboard, /选择本次主评人/);
  assert.match(dashboard, /十级能力阶梯/);
  assert.match(dashboard, /成员与评审人/);
  assert.match(dashboard, /当前认证/);
  assert.match(dashboard, /认证层级不可自改/);
  assert.match(dashboard, /complianceConfirmed/);
  assert.match(dashboard, /\/login/);

  assert.match(api, /getChatGPTUser/);
  assert.match(api, /status: 401/);
  assert.match(api, /authorizedMemberId/);
  assert.match(api, /review_decision/);
  assert.match(api, /save_framework_level/);
  assert.match(api, /publish_framework/);
  assert.match(api, /reviewerEmail/);
  assert.match(api, /只能处理分配给自己的评审/);
  assert.match(api, /update_user_access/);
  assert.match(api, /review_asset/);
  assert.match(api, /ownerName: "团队成员"/);
  assert.match(schema, /level_history/);
  assert.match(schema, /audit_logs/);
  assert.match(schema, /framework_versions/);
  assert.match(schema, /framework_levels/);
  assert.match(schema, /group_name/);
  assert.match(schema, /nominate_asset/);

  for (let level = 1; level <= 10; level += 1) {
    assert.match(levels, new RegExp(`level: ${level},`));
  }
  assert.match(levels, /criteria:/);
  assert.match(levels, /evidenceHint/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);

  await assert.rejects(access(new URL("app/api/members/route.ts", root)));
});
