import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import QRCode from "qrcode";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "output");
const repository = process.env.GITHUB_REPOSITORY;
const issueNumber = Number(process.env.ISSUE_NUMBER);
const token = process.env.GITHUB_TOKEN;

if (!repository || !issueNumber || !token) {
  throw new Error("GITHUB_REPOSITORY, ISSUE_NUMBER and GITHUB_TOKEN are required.");
}

const [owner, repo] = repository.split("/");
const apiRoot = "https://api.github.com";
const palette = {
  ink: "211F1A",
  charcoal: "302C25",
  cream: "F7F0E3",
  paper: "FFF9ED",
  terracotta: "B64E2E",
  coral: "DA6B4E",
  amber: "D3912B",
  green: "3E7655",
  azure: "0078D4",
  azurePale: "DCEEFF",
  muted: "7B6D5E",
  line: "D8C9B4",
  white: "FFFFFF",
};

async function github(pathname) {
  const response = await fetch(`${apiRoot}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function stripMarkdown(value = "") {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>`~]/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value, max) {
  const clean = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  return `${sliced.slice(0, Math.max(0, sliced.lastIndexOf(" ")))}…`;
}

function conciseClauses(value, clauseCount, max) {
  const clean = stripMarkdown(value).replace(/\s+/g, " ").trim();
  const clauses = clean
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return truncate(clauses.slice(0, clauseCount).join("; "), max);
}

function clipSentence(value, max) {
  const clean = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return /[.!?]$/.test(clean) ? clean : `${clean}.`;
  const boundaries = [", ", "; ", " — ", " – "]
    .map((separator) => clean.indexOf(separator))
    .filter((index) => index >= Math.floor(max * 0.45) && index < max);
  const end = boundaries.length ? Math.max(...boundaries) : clean.lastIndexOf(" ", max - 1);
  return `${clean.slice(0, Math.max(1, end)).replace(/[,:;–—\s]+$/g, "")}.`;
}

function compactItems(items, count, max) {
  return items
    .slice(0, count)
    .map((item) => clipSentence(item, max))
    .filter(Boolean)
    .join("\n\n");
}

function actionSentence(value, max) {
  const clean = stripMarkdown(value)
    .replace(/\s*\([^)]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstAction = clean.split(/\s+(?:and|while|so that)\s+/i)[0];
  return clipSentence(firstAction, max);
}

function compactActions(items, count, max) {
  return items
    .slice(0, count)
    .map((item) => actionSentence(item, max))
    .filter(Boolean)
    .join("\n\n");
}

function decisionSummary(value) {
  if (/owns|operates|operator/i.test(value)) return "Choose the long-term operator.";
  if (/comparator|real-world-evidence|statistical analysis/i.test(value)) {
    return "Set the rules for comparator-data access.";
  }
  if (/pseudonym|re-identification/i.test(value)) return "Agree the pseudonymisation method.";
  return actionSentence(value, 78);
}

function audienceServiceLabel(value) {
  if (/API Management/i.test(value)) return "Secure site gateway";
  if (/Functions|container per site/i.test(value)) return "Local screening adapter";
  if (/SQL|Cosmos|storage/i.test(value)) return "Pseudonymised aggregates";
  if (/AI Foundry|agent/i.test(value)) return "Agent orchestration";
  if (/Service Bus|Event Grid/i.test(value)) return "Async message backbone";
  if (/Container Apps|App Service|web app/i.test(value)) return "Coordinator workspace";
  if (/Entra/i.test(value)) return "Federated identity";
  if (/Monitor|Insights/i.test(value)) return "Operational evidence";
  return truncate(value, 38);
}

function canonicalAzureService(value) {
  if (/API Management/i.test(value)) return "Azure API Management";
  if (/Functions|container per site/i.test(value)) return "Azure Functions / Container Apps";
  if (/SQL/i.test(value)) return "Azure SQL Database";
  if (/AI Foundry/i.test(value)) return "Azure AI Foundry Agent Service";
  if (/Service Bus/i.test(value)) return "Azure Service Bus";
  if (/Container Apps/i.test(value)) return "Azure Container Apps";
  if (/Entra/i.test(value)) return "Microsoft Entra ID";
  if (/Monitor|Insights/i.test(value)) return "Azure Monitor / Application Insights";
  return clipSentence(value, 42).replace(/\.$/, "");
}

function pillarSummary(name, fallbackDesign, fallbackValidate) {
  const key = name.toLowerCase();
  if (key.includes("reliab")) {
    return {
      design: "Design for site outages and a four-hour recovery target.",
      validate: "Set the RPO and test offline queues.",
    };
  }
  if (key.includes("security")) {
    return {
      design: "Federated identity, mTLS, pseudonymisation and encryption.",
      validate: "Complete country DPIAs and threat models.",
    };
  }
  if (key.includes("cost")) {
    return {
      design: "Scale serverless capacity with active sites and trials.",
      validate: "Separate onboarding cost from platform run cost.",
    };
  }
  if (key.includes("operational")) {
    return {
      design: "Use one adapter pattern with central observability.",
      validate: "Pilot first to expose real adapter variance.",
    };
  }
  if (key.includes("performance")) {
    return {
      design: "Decouple site checks with asynchronous messaging.",
      validate: "Load-test ingestion and agent throughput.",
    };
  }
  return {
    design: clipSentence(fallbackDesign, 88),
    validate: clipSentence(fallbackValidate, 78),
  };
}

function markdownHeading(line) {
  const hashHeading = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
  if (hashHeading) return stripMarkdown(hashHeading[1]).toLowerCase();
  const boldHeading = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
  if (boldHeading) return stripMarkdown(boldHeading[1]).toLowerCase();
  return null;
}

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const wanted = heading.toLowerCase();
  const start = lines.findIndex((line) => markdownHeading(line) === wanted);
  if (start < 0) return "";
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (markdownHeading(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join("\n").trim();
}

function listItems(markdown, limit = 6) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)?.[1])
    .filter(Boolean)
    .map((line) => truncate(line, 180))
    .slice(0, limit);
}

function parseTable(markdown, heading) {
  const body = section(markdown, heading);
  const rows = body
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => stripMarkdown(cell).trim()),
    )
    .filter((row) => row.length >= 3 && !row.every((cell) => /^-+$/.test(cell)));
  return rows.slice(1);
}

function findComment(comments, needle) {
  return [...comments].reverse().find((comment) => comment.body?.includes(needle));
}

function presentationPlan(comments) {
  const comment = [...comments]
    .reverse()
    .find(
      (candidate) =>
        candidate.user?.type === "Bot" &&
        candidate.body?.includes("### 🎨 Presentation revision plan"),
    );
  if (!comment) return null;
  const match = comment.body?.match(/```json\s*([\s\S]*?)```/i);
  if (!match) {
    throw new Error("The latest presentation revision plan does not contain a JSON block.");
  }
  const plan = JSON.parse(match[1]);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("The latest presentation revision plan must be a JSON object.");
  }
  return plan;
}

function applyPresentationPlan(data, plan) {
  if (!plan) return data;
  const limits = {
    tagline: 175,
    problem: 280,
    dream: 320,
    moment: 175,
    assistant: 220,
    human: 190,
    demoCaption: 180,
    outcome: 260,
    architectureLeft: 300,
    architectureRight: 300,
  };
  for (const [key, max] of Object.entries(limits)) {
    if (typeof plan[key] === "string" && plan[key].trim()) {
      data[key] = clipSentence(plan[key], max);
    }
  }
  if (Array.isArray(plan.delivery) && plan.delivery.length === 3) {
    data.delivery = plan.delivery.map((item) => clipSentence(String(item), 145));
  }
  if (Array.isArray(plan.decisions) && plan.decisions.length === 3) {
    data.decisions = plan.decisions.map((item) => clipSentence(String(item), 102));
  }
  return data;
}

function formatDuration(from, to) {
  const minutes = Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getPreviewUrl(comments) {
  const releases = comments.filter((comment) =>
    comment.body?.includes("oncology-hackathon-release:"),
  );
  const latest = releases.at(-1);
  return latest?.body?.match(
    /https:\/\/[^\s*]+\/#\/idea\/\d+/,
  )?.[0];
}

async function capturePreview(previewUrl) {
  if (!previewUrl) return null;
  const screenshotPath = path.join(outputDir, `issue-${issueNumber}-demo.png`);
  const launchOptions = { headless: true };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return screenshotPath;
  } catch (error) {
    console.warn(`Preview screenshot unavailable: ${error.message}`);
    return null;
  } finally {
    await browser?.close();
  }
}

function addFooter(slide, number, dark = false) {
  slide.addText("ONCOLOGY HACKATHON 2026 · MUNICH", {
    x: 0.55,
    y: 7.12,
    w: 5.4,
    h: 0.16,
    fontFace: "Aptos",
    fontSize: 8,
    bold: true,
    charSpacing: 1.4,
    color: dark ? "BFAE99" : palette.muted,
    margin: 0,
  });
  slide.addText(String(number).padStart(2, "0"), {
    x: 12.25,
    y: 7.05,
    w: 0.45,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 9,
    bold: true,
    color: dark ? palette.cream : palette.terracotta,
    align: "right",
    margin: 0,
  });
}

function addSlideTitle(slide, title, kicker, dark = false) {
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: 0.65,
      y: 0.42,
      w: 5.8,
      h: 0.22,
      fontFace: "Aptos",
      fontSize: 10,
      bold: true,
      charSpacing: 1.6,
      color: dark ? palette.coral : palette.terracotta,
      margin: 0,
    });
  }
  slide.addText(title, {
    x: 0.65,
    y: 0.72,
    w: 11.9,
    h: 0.62,
    fontFace: "Georgia",
    fontSize: 28,
    bold: true,
    color: dark ? palette.cream : palette.ink,
    margin: 0,
    fit: "shrink",
  });
}

function addCard(slide, { x, y, w, h, title, body, accent = palette.terracotta, dark = false }) {
  slide.addShape(slide._pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: dark ? "2A2722" : palette.paper },
    line: { color: dark ? "4A433A" : palette.line, width: 1 },
    shadow: { type: "outer", color: "000000", blur: 3, offset: 1, angle: 135, opacity: 0.12 },
  });
  slide.addShape(slide._pptx.ShapeType.rect, {
    x,
    y,
    w: 0.08,
    h,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.16,
    w: w - 0.38,
    h: 0.28,
    fontFace: "Aptos",
    fontSize: 13,
    bold: true,
    color: dark ? palette.cream : palette.ink,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.52,
    w: w - 0.38,
    h: h - 0.66,
    fontFace: "Aptos",
    fontSize: 10.5,
    color: dark ? "D8CCBC" : palette.muted,
    margin: 0,
    breakLine: false,
    valign: "top",
    fit: "shrink",
  });
}

function addArrow(slide, x, y, w, color = palette.terracotta, dashed = false) {
  slide.addShape(slide._pptx.ShapeType.line, {
    x,
    y,
    w,
    h: 0,
    line: {
      color,
      width: 2,
      beginArrowType: "none",
      endArrowType: "triangle",
      dashType: dashed ? "dash" : "solid",
    },
  });
}

function bulletRuns(items) {
  return items.flatMap((item, index) => [
    {
      text: item,
      options: { bullet: true, breakLine: index < items.length - 1, paraSpaceAfterPt: 8 },
    },
  ]);
}

async function buildDeck(data) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Oncology Hackathon 2026 Munich";
  pptx.subject = `Showcase presentation for issue #${issueNumber}`;
  pptx.title = data.title;
  pptx.company = "Health Rewired";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: "Georgia",
    bodyFontFace: "Aptos",
    lang: "en-US",
  };
  pptx.defineSlideMaster({
    title: "LIGHT",
    background: { color: palette.cream },
    objects: [],
  });
  pptx.defineSlideMaster({
    title: "DARK",
    background: { color: palette.ink },
    objects: [],
  });

  let slide = pptx.addSlide("DARK");
  slide._pptx = pptx;
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.55,
    y: -1.0,
    w: 5.5,
    h: 5.5,
    fill: { color: palette.terracotta, transparency: 8 },
    line: { transparency: 100 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 10.0,
    y: 3.75,
    w: 3.8,
    h: 3.8,
    fill: { color: palette.amber, transparency: 18 },
    line: { transparency: 100 },
  });
  slide.addText("WHAT BECOMES POSSIBLE WHEN WE LEARN FROM EVERY CANCER PATIENT IN EUROPE?", {
    x: 0.72,
    y: 0.62,
    w: 7.2,
    h: 0.44,
    fontFace: "Aptos",
    fontSize: 12,
    bold: true,
    charSpacing: 1.6,
    color: palette.coral,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(data.title, {
    x: 0.72,
    y: 1.45,
    w: 8.4,
    h: 2.2,
    fontFace: "Georgia",
    fontSize: 35,
    bold: true,
    color: palette.cream,
    margin: 0,
    valign: "mid",
    fit: "shrink",
  });
  slide.addText(data.tagline, {
    x: 0.76,
    y: 4.1,
    w: 7.3,
    h: 1.05,
    fontFace: "Aptos",
    fontSize: 18,
    color: "D8CCBC",
    margin: 0,
    fit: "shrink",
  });
  slide.addText(`IDEA #${issueNumber} · AUDIENCE SHOWCASE`, {
    x: 9.25,
    y: 5.9,
    w: 3.1,
    h: 0.28,
    fontFace: "Aptos",
    fontSize: 10,
    bold: true,
    align: "right",
    charSpacing: 1.2,
    color: palette.cream,
    margin: 0,
  });
  addFooter(slide, 1, true);

  slide = pptx.addSlide("LIGHT");
  slide._pptx = pptx;
  addSlideTitle(slide, "The biggest dream, made concrete", "01 · The idea");
  slide.addText(data.problem, {
    x: 0.72,
    y: 1.62,
    w: 5.95,
    h: 1.45,
    fontFace: "Georgia",
    fontSize: 19,
    bold: true,
    color: palette.ink,
    margin: 0,
    valign: "top",
    fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.72,
    y: 3.35,
    w: 5.95,
    h: 2.42,
    fill: { color: "EFE3D2" },
    line: { color: palette.line, width: 1 },
  });
  slide.addText("THE DREAM", {
    x: 1.0,
    y: 3.65,
    w: 1.25,
    h: 0.2,
    fontFace: "Aptos",
    fontSize: 9,
    bold: true,
    charSpacing: 1.4,
    color: palette.terracotta,
    margin: 0,
  });
  slide.addText(data.dream, {
    x: 1.0,
    y: 4.03,
    w: 5.38,
    h: 1.28,
    fontFace: "Aptos",
    fontSize: 15,
    bold: true,
    color: palette.charcoal,
    margin: 0,
    fit: "shrink",
  });
  addCard(slide, {
    x: 7.25,
    y: 1.55,
    w: 5.25,
    h: 1.5,
    title: "The moment it helps",
    body: data.moment,
    accent: palette.terracotta,
  });
  addCard(slide, {
    x: 7.25,
    y: 3.35,
    w: 5.25,
    h: 1.55,
    title: "The assistant contributes",
    body: data.assistant,
    accent: palette.amber,
  });
  addCard(slide, {
    x: 7.25,
    y: 5.1,
    w: 5.25,
    h: 1.35,
    title: "People remain responsible",
    body: data.human,
    accent: palette.green,
  });
  addFooter(slide, 2);

  slide = pptx.addSlide("LIGHT");
  slide._pptx = pptx;
  addSlideTitle(slide, "From one issue to a future architecture", "02 · The process");
  const timelineX = [0.85, 3.15, 5.45, 7.75, 10.05];
  for (let index = 0; index < timelineX.length - 1; index += 1) {
    addArrow(slide, timelineX[index] + 0.85, 3.0, 1.38, palette.line);
  }
  data.timeline.forEach((item, index) => {
    const x = timelineX[index];
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: 2.55,
      w: 0.86,
      h: 0.86,
      fill: { color: [palette.terracotta, palette.coral, palette.amber, palette.green, palette.azure][index] },
      line: { transparency: 100 },
    });
    slide.addText(String(index + 1), {
      x,
      y: 2.73,
      w: 0.86,
      h: 0.25,
      align: "center",
      fontFace: "Aptos",
      fontSize: 14,
      bold: true,
      color: palette.white,
      margin: 0,
    });
    slide.addText(item.title, {
      x: x - 0.25,
      y: 3.62,
      w: 1.4,
      h: 0.46,
      fontFace: "Aptos",
      fontSize: 12,
      bold: true,
      align: "center",
      color: palette.ink,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(item.detail, {
      x: x - 0.33,
      y: 4.15,
      w: 1.56,
      h: 0.95,
      fontFace: "Aptos",
      fontSize: 10.5,
      align: "center",
      color: palette.charcoal,
      margin: 0,
      fit: "shrink",
    });
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.75,
    y: 5.65,
    w: 11.85,
    h: 0.82,
    fill: { color: "EFE3D2" },
    line: { color: palette.line, width: 1 },
  });
  slide.addText(
    `One issue carried the idea from coaching to ${data.releaseCount} live version${data.releaseCount === 1 ? "" : "s"}, ${data.revisionCount} revision round${data.revisionCount === 1 ? "" : "s"}, architecture and presentation.`,
    {
      x: 1.05,
      y: 5.88,
      w: 11.2,
      h: 0.28,
      fontFace: "Aptos",
      fontSize: 14,
      bold: true,
      align: "center",
      color: palette.ink,
      margin: 0,
      fit: "shrink",
    },
  );
  addFooter(slide, 3);

  slide = pptx.addSlide("DARK");
  slide._pptx = pptx;
  addSlideTitle(slide, "A working story—not an architecture diagram", "03 · The demo", true);
  if (data.screenshotPath) {
    slide.addImage({
      path: data.screenshotPath,
      x: 0.68,
      y: 1.52,
      w: 8.65,
      h: 4.85,
      sizing: { type: "contain", w: 8.65, h: 4.85 },
      altText: `Live prototype for ${data.title}`,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.88,
      y: 5.62,
      w: 8.25,
      h: 0.52,
      fill: { color: palette.ink, transparency: 8 },
      line: { transparency: 100 },
    });
    slide.addText(data.demoCaption, {
      x: 1.12,
      y: 5.76,
      w: 7.75,
      h: 0.2,
      fontFace: "Aptos",
      fontSize: 10.5,
      bold: true,
      color: palette.cream,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.68,
      y: 1.52,
      w: 8.65,
      h: 4.85,
      fill: { color: "2A2722" },
      line: { color: "4A433A", width: 1 },
    });
    slide.addText("Preview screenshot unavailable\nUse the live demo link", {
      x: 2.1,
      y: 3.35,
      w: 5.8,
      h: 0.9,
      fontFace: "Georgia",
      fontSize: 22,
      color: palette.cream,
      align: "center",
      margin: 0,
    });
  }
  slide.addShape(pptx.ShapeType.rect, {
    x: 9.7,
    y: 1.55,
    w: 2.85,
    h: 4.82,
    fill: { color: palette.cream },
    line: { color: palette.cream },
  });
  slide.addText("TRY THE DEMO", {
    x: 10.08,
    y: 1.95,
    w: 2.1,
    h: 0.25,
    fontFace: "Aptos",
    fontSize: 11,
    bold: true,
    charSpacing: 1.4,
    align: "center",
    color: palette.terracotta,
    margin: 0,
  });
  slide.addImage({
    data: data.qrData,
    x: 10.15,
    y: 2.4,
    w: 2.0,
    h: 2.0,
    altText: "QR code to the live prototype",
  });
  slide.addText("Open the live prototype", {
    x: 9.98,
    y: 4.72,
    w: 2.25,
    h: 0.34,
    fontFace: "Aptos",
    fontSize: 10.5,
    bold: true,
    color: palette.terracotta,
    align: "center",
    margin: 0,
    hyperlink: { url: data.previewUrl },
  });
  slide.addText("Synthetic data · hackathon prototype · not for clinical use", {
    x: 9.95,
    y: 5.78,
    w: 2.35,
    h: 0.38,
    fontFace: "Aptos",
    fontSize: 8.5,
    bold: true,
    color: palette.terracotta,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  addFooter(slide, 4, true);

  slide = pptx.addSlide("LIGHT");
  slide._pptx = pptx;
  addSlideTitle(slide, "What the prototype proved", "04 · The outcome");
  const proofCards = [
    ["Visible mechanism", data.proofs[0] ?? "The guided story makes the mechanism understandable."],
    ["Meaningful AI work", data.proofs[1] ?? "The assistant does specific work inside the workflow."],
    ["Human control", data.proofs[2] ?? data.human],
  ];
  proofCards.forEach(([title, body], index) => {
    addCard(slide, {
      x: 0.72 + index * 4.18,
      y: 1.65,
      w: 3.72,
      h: 2.28,
      title,
      body,
      accent: [palette.terracotta, palette.amber, palette.green][index],
    });
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.72,
    y: 4.5,
    w: 11.85,
    h: 1.68,
    fill: { color: palette.ink },
    line: { color: palette.ink },
  });
  slide.addText("The outcome is not “AI produced an answer.”", {
    x: 1.05,
    y: 4.88,
    w: 4.95,
    h: 0.72,
    fontFace: "Georgia",
    fontSize: 18,
    bold: true,
    color: palette.cream,
    margin: 0,
  });
  slide.addText(data.outcome, {
    x: 6.25,
    y: 4.83,
    w: 5.72,
    h: 0.98,
    fontFace: "Aptos",
    fontSize: 12.5,
    color: "D8CCBC",
    margin: 0,
    fit: "shrink",
  });
  addFooter(slide, 5);

  slide = pptx.addSlide("DARK");
  slide._pptx = pptx;
  addSlideTitle(slide, "The future platform: trust by design", "05 · The architecture", true);
  addArrow(slide, 3.48, 3.72, 0.58, palette.coral);
  addArrow(slide, 9.2, 3.72, 0.58, palette.green);
  slide.addShape(pptx.ShapeType.line, {
    x: 3.82,
    y: 1.45,
    w: 0,
    h: 4.92,
    line: { color: palette.coral, width: 1.3, dashType: "dash" },
  });
  slide.addText("TRUST BOUNDARY", {
    x: 3.28,
    y: 1.48,
    w: 1.1,
    h: 0.2,
    fontFace: "Aptos",
    fontSize: 8,
    bold: true,
    charSpacing: 0.8,
    color: palette.coral,
    margin: 0,
  });
  addCard(slide, {
    x: 0.68,
    y: 1.65,
    w: 2.7,
    h: 4.45,
    title: data.architectureLeftTitle,
    body: data.architectureLeft,
    accent: palette.coral,
    dark: true,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.08,
    y: 1.58,
    w: 5.05,
    h: 4.6,
    fill: { color: "17293A" },
    line: { color: palette.azure, width: 1.4 },
  });
  slide.addText("AZURE COORDINATION PLATFORM", {
    x: 4.35,
    y: 1.85,
    w: 4.5,
    h: 0.24,
    fontFace: "Aptos",
    fontSize: 10,
    bold: true,
    charSpacing: 1.3,
    color: "7DC5FF",
    align: "center",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 6.54,
    y: 2.55,
    w: 0,
    h: 2.75,
    line: {
      color: "4DA8E8",
      width: 1.2,
      endArrowType: "triangle",
    },
  });
  data.services.slice(0, 6).forEach((service, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 4.38 + col * 2.28;
    const y = 2.34 + row * 1.17;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 2.05,
      h: 0.9,
      fill: { color: "203B52" },
      line: { color: "4DA8E8", width: 0.9 },
    });
    slide.addText(service.choice, {
      x: x + 0.13,
      y: y + 0.13,
      w: 1.79,
      h: 0.38,
      fontFace: "Aptos",
      fontSize: 10,
      bold: true,
      color: palette.white,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(service.area, {
      x: x + 0.13,
      y: y + 0.56,
      w: 1.79,
      h: 0.16,
      fontFace: "Aptos",
      fontSize: 8,
      color: "A7D8FA",
      margin: 0,
      fit: "shrink",
    });
  });
  slide.addText("site signals  →  coordinated evidence  →  human decision", {
    x: 4.65,
    y: 5.78,
    w: 3.9,
    h: 0.18,
    fontFace: "Aptos",
    fontSize: 8.5,
    bold: true,
    color: "7DC5FF",
    align: "center",
    margin: 0,
  });
  addCard(slide, {
    x: 9.82,
    y: 1.65,
    w: 2.75,
    h: 4.45,
    title: "People decide",
    body: data.architectureRight,
    accent: palette.green,
    dark: true,
  });
  slide.addText("Real implementation assumptions · not production approval", {
    x: 4.15,
    y: 6.42,
    w: 5.0,
    h: 0.24,
    align: "center",
    fontFace: "Aptos",
    fontSize: 10,
    italic: true,
    color: "A7D8FA",
    margin: 0,
  });
  addFooter(slide, 6, true);

  slide = pptx.addSlide("LIGHT");
  slide._pptx = pptx;
  addSlideTitle(slide, "Five tradeoffs to validate—not a score", "06 · Well-Architected review");
  const pillarColors = [palette.green, palette.terracotta, palette.amber, palette.azure, palette.coral];
  data.pillars.slice(0, 5).forEach((pillar, index) => {
    const x = 0.7 + index * 2.48;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.62,
      w: 2.16,
      h: 4.65,
      fill: { color: palette.paper },
      line: { color: palette.line, width: 1 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.68,
      y: 1.93,
      w: 0.8,
      h: 0.8,
      fill: { color: pillarColors[index] },
      line: { transparency: 100 },
    });
    slide.addText(String(index + 1), {
      x: x + 0.68,
      y: 2.13,
      w: 0.8,
      h: 0.2,
      align: "center",
      fontFace: "Aptos",
      fontSize: 13,
      bold: true,
      color: palette.white,
      margin: 0,
    });
    slide.addText(pillar.name, {
      x: x + 0.15,
      y: 2.95,
      w: 1.86,
      h: 0.52,
      fontFace: "Georgia",
      fontSize: 14,
      bold: true,
      align: "center",
      color: palette.ink,
      margin: 0,
      fit: "shrink",
    });
    slide.addText("DESIGN", {
      x: x + 0.2,
      y: 3.65,
      w: 0.7,
      h: 0.16,
      fontFace: "Aptos",
      fontSize: 8,
      bold: true,
      charSpacing: 1,
      color: pillarColors[index],
      margin: 0,
    });
    slide.addText(pillar.design, {
      x: x + 0.2,
      y: 3.92,
      w: 1.76,
      h: 0.72,
      fontFace: "Aptos",
      fontSize: 10.5,
      color: palette.charcoal,
      margin: 0,
      fit: "shrink",
    });
    slide.addText("VALIDATE NEXT", {
      x: x + 0.2,
      y: 4.92,
      w: 1.1,
      h: 0.16,
      fontFace: "Aptos",
      fontSize: 8,
      bold: true,
      charSpacing: 1,
      color: pillarColors[index],
      margin: 0,
    });
    slide.addText(pillar.validate, {
      x: x + 0.2,
      y: 5.18,
      w: 1.76,
      h: 0.7,
      fontFace: "Aptos",
      fontSize: 10,
      color: palette.muted,
      margin: 0,
      fit: "shrink",
    });
  });
  addFooter(slide, 7);

  slide = pptx.addSlide("DARK");
  slide._pptx = pptx;
  addSlideTitle(slide, "A staged path from hackathon insight to real-world evidence", "07 · The plan", true);
  const stages = [
    { title: "PILOT", body: data.delivery[0] ?? "Validate the smallest safe real-world workflow.", color: palette.coral },
    { title: "MULTI-SITE", body: data.delivery[1] ?? "Prove interoperability, governance and operations.", color: palette.amber },
    { title: "PRODUCTION", body: data.delivery[2] ?? "Build resilience, security evidence, support and scale.", color: palette.green },
  ];
  stages.forEach((stage, index) => {
    const x = 0.76 + index * 4.16;
    if (index < stages.length - 1) addArrow(slide, x + 3.45, 3.05, 0.54, "756B5F");
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.75,
      w: 3.62,
      h: 3.35,
      fill: { color: "2A2722" },
      line: { color: stage.color, width: 1.5 },
    });
    slide.addText(`0${index + 1}`, {
      x: x + 0.22,
      y: 2.03,
      w: 0.6,
      h: 0.3,
      fontFace: "Georgia",
      fontSize: 20,
      bold: true,
      color: stage.color,
      margin: 0,
    });
    slide.addText(stage.title, {
      x: x + 0.95,
      y: 2.05,
      w: 2.25,
      h: 0.26,
      fontFace: "Aptos",
      fontSize: 13,
      bold: true,
      charSpacing: 1.4,
      color: palette.cream,
      margin: 0,
    });
    slide.addText(stage.body, {
      x: x + 0.26,
      y: 2.72,
      w: 3.08,
      h: 1.6,
      fontFace: "Aptos",
      fontSize: 13,
      color: "D8CCBC",
      margin: 0,
      valign: "mid",
      fit: "shrink",
    });
  });
  slide.addText("Decide\nnext", {
    x: 0.82,
    y: 5.52,
    w: 1.0,
    h: 0.58,
    fontFace: "Georgia",
    fontSize: 17,
    bold: true,
    color: palette.coral,
    margin: 0,
  });
  data.decisions.slice(0, 3).forEach((decision, index) => {
    const x = 1.9 + index * 3.52;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 5.48,
      w: 3.18,
      h: 0.75,
      fill: { color: "2A2722" },
      line: { color: [palette.coral, palette.amber, palette.green][index], width: 1 },
    });
    slide.addText(clipSentence(decision, 78), {
      x: x + 0.18,
      y: 5.65,
      w: 2.82,
      h: 0.36,
      fontFace: "Aptos",
      fontSize: 12,
      color: palette.cream,
      margin: 0,
      align: "center",
      fit: "shrink",
    });
  });
  addFooter(slide, 8, true);

  const filename = path.join(outputDir, `issue-${issueNumber}-showcase.pptx`);
  await pptx.writeFile({ fileName: filename });
  return filename;
}

await fs.mkdir(outputDir, { recursive: true });
const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
const comments = await github(
  `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
);
const editorialPlan = presentationPlan(comments);
const proposal = findComment(comments, "## 🚀 Implementation proposal")?.body ?? "";
const architecture =
  findComment(comments, "## 🏗️ Future Azure architecture")?.body ?? "";
if (!architecture) {
  throw new Error("No final architecture comment was found on the issue.");
}

const previewUrl = getPreviewUrl(comments);
if (!previewUrl) {
  throw new Error("No live preview URL was found on the issue.");
}
const screenshotPath = await capturePreview(previewUrl);
const qrData = await QRCode.toDataURL(previewUrl, {
  margin: 1,
  width: 640,
  color: { dark: `#${palette.ink}`, light: `#${palette.cream}` },
});

const releaseComments = comments.filter((comment) =>
  comment.body?.includes("oncology-hackathon-release:"),
);
const proposalComment = findComment(comments, "## 🚀 Implementation proposal");
const architectureComment = findComment(comments, "## 🏗️ Future Azure architecture");
const serviceRows = parseTable(architecture, "Azure building blocks");
const pillarRows = parseTable(architecture, "Well-Architected review");
const delivery = listItems(section(architecture, "Delivery path"), 3);
const decisions = listItems(section(architecture, "Decisions the team still needs to make"), 5);
const proposalSteps = listItems(section(proposal, "What you will see"), 5);
const assistantItems = listItems(section(proposal, "What the assistant does for you"), 4);
const humanItems = listItems(section(proposal, "What stays with you"), 3);
const assumptions = listItems(section(architecture, "Assumptions and decisions"), 6);
const flow = listItems(section(architecture, "How information moves"), 9);
const problem = section(issue.body, "What problem or opportunity do you see?");
const desiredApplication = section(issue.body, "What would you like the application to do?");
const aiOpportunity = section(issue.body, "Where could AI make this fundamentally better?");
const humanJudgment = section(issue.body, "What should remain a human judgment?");

const data = {
  title: truncate(issue.title.replace(/^\[Idea]\s*/i, ""), 110),
  tagline:
    clipSentence(section(proposal, "The moment it helps"), 175) ||
    clipSentence(issue.body, 175),
  problem: truncate(problem, 310),
  dream: truncate(desiredApplication, 360),
  moment: clipSentence(section(proposal, "The moment it helps"), 175),
  assistant: compactActions(assistantItems, 3, 82) || clipSentence(aiOpportunity, 210),
  human: compactActions(humanItems, 2, 92) || clipSentence(humanJudgment, 190),
  timeline: [
    {
      title: "Dream submitted",
      detail: new Date(issue.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    },
    {
      title: "Idea coached",
      detail: proposalComment
        ? formatDuration(issue.created_at, proposalComment.created_at)
        : "One concrete scenario",
    },
    {
      title: "Prototype live",
      detail: releaseComments[0]
        ? formatDuration(issue.created_at, releaseComments[0].created_at)
        : "Clickable first version",
    },
    {
      title: "Participant shaped it",
      detail: `${Math.max(0, releaseComments.length - 1)} focused revision round${releaseComments.length - 1 === 1 ? "" : "s"}`,
    },
    {
      title: "Future designed",
      detail: architectureComment
        ? formatDuration(issue.created_at, architectureComment.created_at)
        : "Azure architecture",
    },
  ],
  releaseCount: releaseComments.length,
  revisionCount: Math.max(0, releaseComments.length - 1),
  previewUrl,
  screenshotPath,
  qrData,
  demoCaption: "Watch the flow: start with the signal → inspect the evidence → approve the next action.",
  proofs: [
    compactItems(proposalSteps, 2, 88),
    compactActions(assistantItems, 2, 88) || clipSentence(aiOpportunity, 180),
    compactActions(humanItems, 2, 88) || clipSentence(humanJudgment, 180),
  ],
  outcome:
    "The prototype made the mechanism visible and kept consequential decisions with people. The future architecture carries that operating model into real-world scale.",
  architectureLeftTitle:
    assumptions.find((item) => /data boundary|federat|site|hospital/i.test(item))
      ? "Data stays close to care"
      : "Sources and sites",
  architectureLeft:
    assumptions
      .filter((item) => /data|site|hospital|residen|federat/i.test(item))
      .slice(0, 3)
      .map((item) => clipSentence(item, 96))
      .join("\n\n") ||
    assumptions
      .slice(0, 3)
      .map((item) => clipSentence(item, 96))
      .join("\n\n"),
  architectureRight: (
    flow.filter((item) => /approve|human|investigator|clinician|patient|statistician/i.test(item))
      .slice(0, 3)
      .map((item) => actionSentence(item, 88))
      .join("\n\n") || compactActions(humanItems, 3, 96)
  ),
  services: serviceRows.map(([area, choice]) => ({
    area: canonicalAzureService(choice.replace(/\s*\([^)]*\)/g, "")),
    choice: audienceServiceLabel(choice),
  })),
  pillars: pillarRows.map(([name, design, _risk, validate]) => ({
    name: truncate(name, 32),
    ...pillarSummary(name, design, validate),
  })),
  delivery: [
    "Connect the first hospitals. Validate data mapping, workflow and governance.",
    "Expand to the pilot network. Standardise country approvals and cross-border evidence.",
    "Scale repeatably. Prove security, recovery, support and onboarding.",
  ],
  decisions: decisions.map(decisionSummary),
};

applyPresentationPlan(data, editorialPlan);

while (data.services.length < 6) {
  data.services.push({
    area: ["Integration", "AI orchestration", "Data", "Identity", "Operations", "Experience"][
      data.services.length
    ],
    choice: ["API Management", "Azure AI Foundry", "Azure SQL", "Microsoft Entra ID", "Azure Monitor", "Container Apps"][
      data.services.length
    ],
  });
}
while (data.pillars.length < 5) {
  const names = [
    "Reliability",
    "Security",
    "Cost Optimization",
    "Operational Excellence",
    "Performance Efficiency",
  ];
  data.pillars.push({
    name: names[data.pillars.length],
    design: "Make the design decision explicit.",
    validate: "Test the assumption before production.",
  });
}

const filename = await buildDeck(data);
console.log(`Generated ${filename}`);
