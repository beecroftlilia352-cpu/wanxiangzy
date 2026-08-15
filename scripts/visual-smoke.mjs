// 视觉冒烟：headless Chrome（channel: 'chrome'）遍历公共页面，
// 收集 console/pageerror，检查可见文本无 i18n 键路径泄漏，输出截图到 /tmp/smoke/。
// 用法：node scripts/visual-smoke.mjs [baseURL]（默认 http://localhost:3000）
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = "/tmp/smoke";
mkdirSync(OUT, { recursive: true });

const results = [];
const errors = [];

function record(page, context) {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[${context}] console.error: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => errors.push(`[${context}] pageerror: ${String(err).slice(0, 300)}`));
}

// i18n 键路径泄漏特征：小驼峰点路径出现在可见文本里
const KEY_LEAK = /(ProductSet|Create|Shared|Model|Pose|Grass|GeneralImage|FaceSwap|Garment3d|ModelBackground|Pricing|OutfitFusion|Metadata)\.[a-zA-Z0-9_.]+/;

async function checkPage(browser, { path, name, lang, assert }) {
  const ctx = await browser.newContext({ locale: lang || "zh-CN", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  record(page, name);
  try {
    const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
    const status = res?.status() ?? 0;
    const url = page.url();
    const title = await page.title();
    const innerText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const leak = innerText.match(KEY_LEAK);
    const assertion = assert ? await assert(page) : { ok: true, note: "" };
    const shot = `${OUT}/${name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    results.push({ name, status, url, title: title.slice(0, 60), leak: leak ? leak[0] : null, assertion });
    console.log(`[${name}] status=${status} url=${url.split("?")[0]} title="${title.slice(0, 40)}" leak=${leak ? leak[0] : "none"} assert=${assertion.ok ? "ok" : "FAIL:" + assertion.note}`);
  } catch (err) {
    results.push({ name, error: String(err).slice(0, 200) });
    console.log(`[${name}] ERROR ${String(err).slice(0, 150)}`);
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

// 1. 首页 zh（默认）
await checkPage(browser, {
  path: "/", name: "home-zh", lang: "zh-CN",
  assert: async (p) => ({ ok: (await p.title()).includes("Pixel Diffusion"), note: "title" }),
});
// 2. 首页 en（cookie 协商）
{
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  record(page, "home-en");
  try {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 45000 });
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    const innerText = await page.evaluate(() => document.body?.innerText || "");
    const leak = innerText.match(KEY_LEAK);
    const hasEnglish = /\b(Try|Generate|Create|Upload)\b/i.test(innerText);
    const shot = `${OUT}/home-en.png`;
    await page.screenshot({ path: shot });
    results.push({ name: "home-en", htmlLang, hasEnglish, leak: leak ? leak[0] : null });
    console.log(`[home-en] lang=${htmlLang} english-text=${hasEnglish} leak=${leak ? leak[0] : "none"}`);
  } catch (err) {
    results.push({ name: "home-en", error: String(err).slice(0, 200) });
    console.log(`[home-en] ERROR ${String(err).slice(0, 150)}`);
  } finally {
    await ctx.close();
  }
}
// 3. 登录页（autofocus 邮箱）
await checkPage(browser, {
  path: "/login", name: "login", lang: "zh-CN",
  assert: async (p) => {
    const focused = await p.evaluate(() => document.activeElement?.getAttribute("type") || document.activeElement?.tagName);
    return { ok: focused === "email", note: `activeElement=${focused}` };
  },
});
// 4. 定价页
await checkPage(browser, { path: "/pricing", name: "pricing", lang: "zh-CN" });
// 5. 鉴权重定向
await checkPage(browser, {
  path: "/model", name: "model-redirect", lang: "zh-CN",
  assert: async (p) => ({ ok: p.url().includes("/login"), note: "redirect" }),
});

await browser.close();

const failed = results.filter((r) => r.error || (r.assertion && !r.assertion.ok) || r.leak);
console.log("\n===== SUMMARY =====");
console.log(`pages: ${results.length}, failures: ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log("FAIL", JSON.stringify(f));
  process.exit(1);
}
if (errors.length) {
  console.log(`console/page errors: ${errors.length}`);
  for (const e of errors.slice(0, 12)) console.log(" ", e);
}
console.log("screenshots:", OUT);
