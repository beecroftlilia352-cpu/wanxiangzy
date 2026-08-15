// 工作台（登录态）审计：登录后遍历 studio 页面，复用 ui-audit 的检查项 + 截图。
// 用法：PW_EMAIL=... PW_PASSWORD=... node scripts/studio-audit.mjs [baseURL]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = process.env.PW_EMAIL || "";
const PASSWORD = process.env.PW_PASSWORD || "";
const OUT = "/tmp/studio-audit";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { path: "/create", name: "create" },
  { path: "/model", name: "model" },
  { path: "/pose", name: "pose" },
  { path: "/face-swap", name: "face-swap" },
  { path: "/general-image", name: "general-image" },
  { path: "/grass", name: "grass" },
  { path: "/garment-3d", name: "garment-3d" },
  { path: "/model-background", name: "model-background" },
  { path: "/material-enhancement", name: "material-enhancement" },
  { path: "/product-set", name: "product-set" },
  { path: "/history", name: "history" },
];

const findings = [];
const consoleErrors = [];

function report(pageName, viewport, category, detail) {
  findings.push({ page: pageName, viewport, category, detail });
  console.log(`[${pageName}@${viewport}] ${category}: ${detail}`);
}

async function auditPage(page, { path, name }, viewport) {
  try {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}-${viewport}.png` });

    const data = await page.evaluate(() => {
      const doc = document.documentElement;
      const width = doc.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > width + 8 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} right=${Math.round(r.right)}`);
          if (offenders.length >= 4) break;
        }
      }
      const isVisible = (el) => {
        let n = el;
        while (n) {
          const st = getComputedStyle(n);
          if (st.display === "none" || st.visibility === "hidden") return false;
          n = n.parentElement;
        }
        return true;
      };
      const small = [];
      for (const el of document.querySelectorAll("button, a, [role=button]")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40) && isVisible(el)) {
          const label = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 14) || el.tagName;
          small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (small.length >= 8) break;
        }
      }
      const tiny = [];
      for (const el of document.querySelectorAll("p, span, a, button, label, div, li")) {
        if (el.children.length > 0) continue;
        const text = el.textContent?.trim();
        if (!text || text.length < 2 || !isVisible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size > 0 && size < 10.5) {
          tiny.push(`"${text.slice(0, 10)}" ${size}px`);
          if (tiny.length >= 6) break;
        }
      }
      const broken = [];
      for (const img of document.querySelectorAll("img")) {
        // 仅检查视口内图片：懒加载的视口外图片 complete 且 naturalWidth=0 是正常状态
        const r = img.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        if (img.complete && img.naturalWidth === 0) {
          broken.push(img.src.slice(0, 50));
          if (broken.length >= 3) break;
        }
      }
      return { width, scrollW: doc.scrollWidth, offenders, small, tiny, broken };
    });

    if (data.scrollW > data.width + 8) {
      report(name, viewport, "overflow", `scrollW=${data.scrollW}>clientW=${data.width}: ${data.offenders.join(" | ")}`);
    }
    if (viewport === "mobile" && data.small.length) report(name, viewport, "tap-target", data.small.join(" | "));
    if (data.tiny.length) report(name, viewport, "tiny-font", data.tiny.join(" | "));
    if (data.broken.length) report(name, viewport, "broken-image", data.broken.join(" | "));
  } catch (err) {
    console.log(`[${name}@${viewport}] ERROR ${String(err).slice(0, 120)}`);
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`${msg.text().slice(0, 200)}`);
});

// 登录：填表提交（模拟真实用户路径）
await page.goto(BASE + "/login", { waitUntil: "load", timeout: 45000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => console.log("login redirect timeout"));
await page.waitForTimeout(2000);
console.log("logged in at:", page.url());

for (const p of PAGES) {
  for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await auditPage(page, p, vp.name);
  }
}

await browser.close();

console.log("\n===== STUDIO AUDIT SUMMARY =====");
console.log(`pages: ${PAGES.length}, findings: ${findings.length}`);
for (const f of findings) console.log(`- [${f.page}@${f.viewport}] ${f.category}: ${f.detail.slice(0, 130)}`);
if (consoleErrors.length) {
  const unique = [...new Set(consoleErrors)].filter((e) => !e.includes("401"));
  console.log(`console errors (excl 401): ${unique.length}`);
  for (const e of unique.slice(0, 10)) console.log("  ", e.slice(0, 150));
}
console.log(`screenshots: ${OUT}`);
