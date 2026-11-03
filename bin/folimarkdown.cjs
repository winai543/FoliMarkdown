#!/usr/bin/env node
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { randomUUID, timingSafeEqual } = require("node:crypto");
const Handlebars = require("handlebars");
require("../src/handlebars-formatters.js")(Handlebars);

const root = path.resolve(__dirname, "..");
const fonts = ["system", "Sarabun", "Prompt", "Kanit", "Noto Sans Thai", "Noto Serif Thai", "IBM Plex Sans Thai"];
const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif" };
const help = `Usage: folimarkdown <input.md|template.hbs> [options]
       folimarkdown serve [server options]

Convert Markdown or Handlebars report templates to DOCX and PDF. Both formats are created by default.

Options:
  -f, --format <docx|pdf|both>     Output format (default: both)
  -o, --output <file>             Output file; requires one format
      --out-dir <directory>       Output directory (default: input directory)
      --data <file.json>          Bind JSON data to a Markdown or .hbs template
      --title <text>              Document title and {title} value
      --paper <a4|letter>         Paper size
      --orientation <portrait|landscape>
      --margin <normal|narrow|wide>
      --text-color <#RRGGBB>      Document text color
      --accent-color <#RRGGBB>    Accent for table fills and rules
      --background-color <#RRGGBB> Page background color
      --background-image <file>    Local PNG, JPEG, or WebP background
      --background-fit <cover|contain|stretch>
      --background-opacity <0-100> Image opacity percentage
      --header <text>             Header; supports {title}, {page}, {pages}
      --footer <text>             Footer; supports the same placeholders
      --no-header                 Clear the header
      --no-footer                 Clear the footer
      --page-numbers              Show page numbers
      --no-page-numbers           Hide page numbers
      --first-page-blank          Hide header/footer on the first page
      --no-first-page-blank       Show header/footer on the first page
      --font <name>               Document font: ${fonts.join(", ")}
      --chrome <path>             Chrome/Chromium executable
      --timeout <seconds>         Visual loading timeout (default: 30)
      --force                     Replace existing output files
  -h, --help                      Show this help

Server options:
      --host <address>            Listen address (default: 127.0.0.1)
      --port <number>             Listen port (default: 3000)
      --token <secret>            Bearer token (or FOLIMARKDOWN_API_TOKEN)
      --cors-origin <origin>      Allow one browser origin
      --max-input-mb <number>     Maximum JSON request size (default: 25)
      --max-concurrent <number>   Parallel conversions (default: 2)
      --chrome <path>             Chrome/Chromium executable
      --timeout <seconds>         Visual loading timeout (default: 30)

Examples:
  folimarkdown resume.md
  folimarkdown invoice.md --format pdf --paper letter --footer "Page {page} of {pages}"
  folimarkdown report.md --format docx --output report-final.docx --no-page-numbers
  folimarkdown examples/monthly-report.hbs --data examples/monthly-report.json
  folimarkdown serve --port 3000
`;

function validateLayout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("layout must be an object");
  const allowed = { paperSize: ["a4", "letter"], orientation: ["portrait", "landscape"],
    margin: ["normal", "narrow", "wide"], backgroundSize: ["cover", "contain", "stretch"],
    documentKind: ["certificate", "dashboard"], font: fonts };
  const layout = {};
  for (let [key, field] of Object.entries(value)) {
    if (allowed[key]) {
      if (!allowed[key].includes(field)) throw new Error(`Invalid ${key}: ${field}. Choose ${allowed[key].join(", ")}`);
    } else if (["header", "footer"].includes(key)) {
      if (typeof field !== "string" || field.length > 1000) throw new Error(`${key} must be text under 1000 characters`);
    } else if (key === "backgroundColor") {
      if (typeof field !== "string" || !/^#[0-9a-f]{6}$/i.test(field)) throw new Error("backgroundColor must be #RRGGBB");
    } else if (key === "documentColor") {
      if (typeof field !== "string" || !/^#[0-9a-f]{6}$/i.test(field)) throw new Error("documentColor must be #RRGGBB");
    } else if (key === "accentColor") {
      if (typeof field !== "string" || !/^#[0-9a-f]{6}$/i.test(field)) throw new Error("accentColor must be #RRGGBB");
    } else if (key === "backgroundImage") {
      if (typeof field !== "string" || field.length > 5_592_440 || (field && !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/]+={0,2}$/i.test(field)))
        throw new Error("backgroundImage must be an embedded PNG, JPEG, or WebP data URL under 4 MB");
    } else if (key === "backgroundOpacity") {
      field = Number(field);
      if (!Number.isFinite(field) || field < 0 || field > 100) throw new Error("backgroundOpacity must be between 0 and 100");
    } else if (["pageNumbers", "firstPageBlank"].includes(key)) {
      if (typeof field !== "boolean") throw new Error(`${key} must be true or false`);
    } else throw new Error(`Unknown layout setting: ${key}`);
    Object.defineProperty(layout, key, { value: field, enumerable: true, writable: true });
  }
  return layout;
}

function renderReportTemplate(source, data) {
  if (typeof source !== "string" || source.length > 1_000_000) throw new Error("Template must be text under 1 MB");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Template data must be a JSON object");
  try {
    return Handlebars.compile(source, { noEscape: false })(data);
  } catch (error) {
    throw new Error(`Handlebars template error: ${error.message}`);
  }
}

function parseServerArgs(args) {
  const options = { host: "127.0.0.1", port: 3000, timeout: 30, maxInputMb: 25,
    maxConcurrent: 2, token: process.env.FOLIMARKDOWN_API_TOKEN || "" };
  const keys = { "--host": "host", "--port": "port", "--token": "token", "--cors-origin": "corsOrigin",
    "--max-input-mb": "maxInputMb", "--max-concurrent": "maxConcurrent", "--chrome": "chrome", "--timeout": "timeout" };
  for (let i = 0; i < args.length; i++) {
    if (["--help", "-h"].includes(args[i])) { options.help = true; continue; }
    const key = keys[args[i]];
    if (!key) throw new Error(`Unknown server option: ${args[i]}`);
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${args[i]} requires a value`);
    options[key] = args[++i];
  }
  if (options.help) return options;
  for (const [key, min, max] of [["port", 0, 65535], ["timeout", 1, 600], ["maxInputMb", 1, 100], ["maxConcurrent", 1, 8]]) {
    options[key] = Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key] < min || options[key] > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(options.host) && !options.token)
    throw new Error("A Bearer token is required when listening beyond localhost. Set --token or FOLIMARKDOWN_API_TOKEN.");
  if (options.corsOrigin && options.corsOrigin !== "*") {
    try { const url = new URL(options.corsOrigin); if (!/^https?:$/.test(url.protocol) || url.origin !== options.corsOrigin) throw new Error(); }
    catch { throw new Error("--cors-origin must be an HTTP(S) origin or *"); }
  }
  return options;
}

function parseArgs(args) {
  const options = { format: "both", timeout: 30, layout: {}, force: false };
  const take = (index, flag) => {
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`${flag} requires a value`);
    return args[index + 1];
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") { options.help = true; continue; }
    if (arg === "--force") { options.force = true; continue; }
    if (arg === "--page-numbers") { options.layout.pageNumbers = true; continue; }
    if (arg === "--no-page-numbers") { options.layout.pageNumbers = false; continue; }
    if (arg === "--first-page-blank") { options.layout.firstPageBlank = true; continue; }
    if (arg === "--no-first-page-blank") { options.layout.firstPageBlank = false; continue; }
    if (arg === "--no-header") { options.layout.header = ""; continue; }
    if (arg === "--no-footer") { options.layout.footer = ""; continue; }
    const key = {
      "-f": "format", "--format": "format", "-o": "output", "--output": "output",
      "--out-dir": "outDir", "--data": "data", "--title": "title", "--paper": "paperSize",
      "--orientation": "orientation", "--margin": "margin", "--header": "header",
      "--footer": "footer", "--font": "font", "--text-color": "documentColor", "--accent-color": "accentColor", "--background-color": "backgroundColor",
      "--background-image": "backgroundImagePath", "--background-fit": "backgroundSize",
      "--background-opacity": "backgroundOpacity", "--chrome": "chrome", "--timeout": "timeout"
    }[arg];
    if (key) {
      const value = take(i, arg); i++;
      if (["paperSize", "orientation", "margin", "header", "footer", "font", "documentColor", "accentColor", "backgroundColor", "backgroundSize", "backgroundOpacity"].includes(key)) options.layout[key] = value;
      else options[key] = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.input) throw new Error("Provide exactly one input Markdown file");
    else options.input = arg;
  }
  if (options.help) return options;
  if (!options.input) throw new Error("Provide an input Markdown or .hbs template file");
  const isTemplate = /\.hbs$/i.test(options.input);
  if (isTemplate && !options.data) throw new Error("An .hbs template requires --data <file.json>");
  if (!["docx", "pdf", "both"].includes(options.format)) throw new Error("--format must be docx, pdf, or both");
  if (options.output && options.format === "both") throw new Error("--output requires --format docx or --format pdf");
  if (options.output && options.outDir) throw new Error("Use either --output or --out-dir");
  options.layout = validateLayout(options.layout);
  options.timeout = Number(options.timeout);
  if (!Number.isFinite(options.timeout) || options.timeout < 1 || options.timeout > 600) throw new Error("--timeout must be between 1 and 600 seconds");
  return options;
}

function startServer() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error("Invalid path");
      const bytes = await fs.readFile(file);
      response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function launchBrowser(puppeteer, executable, profile, timeout) {
  const explicit = executable || process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = explicit ? [explicit] : [
    await puppeteer.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    ...(process.env.PROGRAMFILES ? [path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")] : [])
  ];
  let lastError;
  for (const candidate of [...new Set(candidates)]) {
    try {
      await fs.access(candidate);
      return await puppeteer.launch({ headless: true, executablePath: candidate, userDataDir: profile,
        protocolTimeout: Math.max(180000, timeout * 1000),
        args: process.env.PUPPETEER_NO_SANDBOX || (process.platform === "linux" && process.getuid?.() === 0) ? ["--no-sandbox"] : [] });
    } catch (error) { lastError = error; }
  }
  throw new Error(`Could not start Chrome/Chromium${lastError ? `: ${lastError.message.split("\n")[0]}` : ""}. Install Chrome or run with --chrome <path>.`);
}

async function blobBase64(page, format, filename = "document") {
  return page.evaluate(async ({ selected, name }) => {
    let result;
    if (selected === "both") {
      const docxResult = await exportDocx();
      if (docxResult.warnings) return { warnings: docxResult.warnings };
      const print = await buildPdf();
      result = { blob: docxZip(new Map([
        [`${name}.docx`, new Uint8Array(await docxResult.blob.arrayBuffer())],
        [`${name}.pdf`, new Uint8Array(await print.blob.arrayBuffer())]
      ])), pages: print.pages };
    } else result = selected === "docx" ? await exportDocx() : await buildPdf();
    const blob = result.blob;
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { base64: data.slice(data.indexOf(",") + 1), warnings: result.warnings || 0, pages: result.pages || 0 };
  }, { selected: format, name: filename });
}

async function renderDocument({ browser, server, markdown, title, layoutOverrides, formats, resolveImages, timeout, filename = "document", onProgress = () => {} }) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout * 1000);
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction("ready");
    if (pageErrors.length) throw new Error(`FoliMarkdown could not start: ${pageErrors[0]}`);
    const refs = await page.evaluate(({ markdown, title, overrides }) => {
      editor.value = loadMarkdown(markdown);
      layout = { ...DEFAULT_LAYOUT, ...layout, ...overrides };
      docName.value = title;
      syncLayoutControls();
      const assets = [];
      markdownParser.walkTokens(markdownParser.lexer(editor.value), token => {
        if (token.type === "image" && /^asset:/i.test(token.href)) assets.push(token.href);
      });
      return { paths: localImageReferences(editor.value), assets };
    }, { markdown, title, overrides: layoutOverrides });
    if (refs.assets.length) throw new Error("This Markdown contains asset: images stored only in the app. Use Save .md in FoliMarkdown to embed them before converting.");
    const images = await resolveImages(refs.paths, formats);
    await page.evaluate(images => {
      documentImagePaths = {};
      for (const image of images) {
        imageAssets.set(image.id, image.data);
        documentImagePaths[image.reference] = image.id;
      }
      setView("preview");
      render();
    }, images);
    await page.evaluate(() => waitForVisuals());
    await page.waitForFunction(() => scheduledDiagrams.size === 0, { timeout: timeout * 1000 });
    const visualErrors = await page.evaluate(async () => {
      await Promise.all([...pages.querySelectorAll("img")].map(image => image.decode().catch(() => {})));
      paginate();
      return {
        diagrams: [...pages.querySelectorAll(".mermaid-figure")].filter(figure => !figure.querySelector("svg")).length,
        images: [...pages.querySelectorAll("img")].filter(image => !image.naturalWidth).map(image => image.getAttribute("alt") || "unnamed image")
      };
    });
    if (visualErrors.diagrams) throw new Error(`${visualErrors.diagrams} diagram(s) could not render. Mermaid requires an internet connection and valid syntax.`);
    if (visualErrors.images.length) throw new Error(`Could not render image(s): ${visualErrors.images.join(", ")}`);
    if (pageErrors.length) throw new Error(`FoliMarkdown rendering failed: ${pageErrors[0]}`);
    const outputs = [];
    for (const format of formats) {
      onProgress(`Creating ${format.toUpperCase()}...`);
      const result = await blobBase64(page, format, filename);
      if (result.warnings) throw new Error(`DOCX export reported ${result.warnings} image or diagram conversion warning(s)`);
      outputs.push({ format, bytes: Buffer.from(result.base64, "base64") });
    }
    return outputs;
  } finally { await context.close().catch(() => {}); }
}

async function convert(options) {
  const input = path.resolve(options.input);
  if (!/\.(md|markdown|txt|hbs)$/i.test(input)) throw new Error("Input must be a .md, .markdown, .txt, or .hbs file");
  let markdown = await fs.readFile(input, "utf8");
  if (options.backgroundImagePath) {
    const filename = path.resolve(options.backgroundImagePath);
    const kind = mime[path.extname(filename).slice(1).toLowerCase()];
    if (!["image/png", "image/jpeg", "image/webp"].includes(kind)) throw new Error("--background-image requires PNG, JPEG, or WebP");
    const bytes = await fs.readFile(filename);
    if (bytes.length > 4 * 1024 * 1024) throw new Error("Background image must be under 4 MB");
    options.layout.backgroundImage = `data:${kind};base64,${bytes.toString("base64")}`;
  }
  if (options.data) {
    let data;
    try { data = JSON.parse(await fs.readFile(path.resolve(options.data), "utf8")); }
    catch (error) { throw new Error(`Could not read template data JSON: ${error.message}`); }
    markdown = renderReportTemplate(markdown, data);
  }
  const basename = path.parse(input).name;
  const title = options.title === undefined ? basename : options.title;
  const formats = options.format === "both" ? ["docx", "pdf"] : [options.format];
  if (options.output && path.extname(options.output).toLowerCase() !== `.${formats[0]}`)
    throw new Error(`--output must end in .${formats[0]}`);
  const destinations = formats.map(format => path.resolve(options.output || path.join(options.outDir || path.dirname(input), `${basename}.${format}`)));
  if (!options.force) for (const destination of destinations) {
    try { await fs.access(destination); throw new Error(`Output already exists: ${destination}. Use --force to replace it.`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  let browser, server, temporary;
  try {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "folimarkdown-cli-"));
    const { default: puppeteer } = await import("puppeteer");
    browser = await launchBrowser(puppeteer, options.chrome, path.join(temporary, "profile"), options.timeout);
    server = await startServer();
    const outputs = await renderDocument({ browser, server, markdown, title, layoutOverrides: options.layout, formats,
      timeout: options.timeout, onProgress: message => process.stdout.write(message + "\n"),
      resolveImages: async refs => {
        const images = [];
        for (const reference of refs) {
          const extension = path.extname(reference).slice(1).toLowerCase();
          if (!mime[extension]) throw new Error(`Unsupported local image format: ${reference}`);
          const filename = path.resolve(path.dirname(input), reference);
          let bytes;
          try { bytes = await fs.readFile(filename); }
          catch { throw new Error(`Image not found: ${filename}`); }
          if (formats.includes("docx") && bytes.length > 20 * 1024 * 1024) throw new Error(`Image exceeds the 20 MB DOCX limit: ${filename}`);
          images.push({ reference, id: randomUUID(), data: `data:${mime[extension]};base64,${bytes.toString("base64")}` });
        }
        return images;
      } });
    for (let i = 0; i < outputs.length; i++) {
      const destination = destinations[i];
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, outputs[i].bytes, { flag: options.force ? "w" : "wx" });
      process.stdout.write(`Saved ${destination}\n`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers["content-length"]);
  if (declared > maxBytes) throw new ApiError(413, "Request body is too large");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new ApiError(413, "Request body is too large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "Request body must be valid JSON"); }
}

function safeFilename(value) {
  return String(value || "document").replace(/\.(md|markdown|txt|docx|pdf|zip)$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-").replace(/^\.+|\.+$/g, "").slice(0, 80) || "document";
}

function apiImages(attachments) {
  if (attachments === undefined) return {};
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) throw new ApiError(400, "images must be an object keyed by Markdown image path");
  return attachments;
}

function imageFromApi(reference, attachment, formats) {
  if (typeof attachment !== "string") throw new ApiError(422, `Missing image data for ${reference}`);
  const dataUrl = /^data:(image\/(?:png|jpe?g|gif|webp|avif));base64,([a-z0-9+/]+={0,2})$/i.exec(attachment);
  const extension = path.extname(reference).slice(1).toLowerCase();
  const kind = dataUrl?.[1] || mime[extension];
  const encoded = dataUrl?.[2] || attachment;
  if (!kind || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) throw new ApiError(422, `Invalid image data for ${reference}`);
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || (formats.includes("docx") || formats.includes("both")) && bytes.length > 20 * 1024 * 1024)
    throw new ApiError(422, `Image is empty or exceeds the 20 MB DOCX limit: ${reference}`);
  return { reference, id: randomUUID(), data: `data:${kind};base64,${bytes.toString("base64")}` };
}

function authorized(request, token) {
  if (!token) return true;
  const received = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${token}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function serve(options) {
  let browser, assetServer, api, temporary;
  try {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "folimarkdown-api-"));
    const { default: puppeteer } = await import("puppeteer");
    browser = await launchBrowser(puppeteer, options.chrome, path.join(temporary, "profile"), options.timeout);
    assetServer = await startServer();
    let active = 0;
    const sendJson = (response, status, value) => {
      if (response.writableEnded || response.destroyed) return;
      const data = Buffer.from(JSON.stringify(value));
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(data);
    };
    api = http.createServer((request, response) => {
      (async () => {
        const route = new URL(request.url, "http://localhost").pathname;
        const origin = request.headers.origin;
        if (options.corsOrigin && origin && (options.corsOrigin === "*" || origin === options.corsOrigin)) {
          response.setHeader("Access-Control-Allow-Origin", options.corsOrigin === "*" ? "*" : origin);
          response.setHeader("Vary", "Origin");
          response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
          response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        }
        if (request.method === "GET" && route === "/health") {
          sendJson(response, browser.connected ? 200 : 503, { status: browser.connected ? "ok" : "unavailable" }); return;
        }
        if (route !== "/convert") { sendJson(response, 404, { error: "Not found" }); return; }
        if (request.method === "OPTIONS" && options.corsOrigin) { response.writeHead(204); response.end(); return; }
        if (request.method !== "POST") { sendJson(response, 405, { error: "Use POST /convert" }); return; }
        if (!authorized(request, options.token)) { sendJson(response, 401, { error: "Bearer token required" }); return; }
        if (!browser.connected) { sendJson(response, 503, { error: "Renderer is unavailable" }); return; }
        if (active >= options.maxConcurrent) { sendJson(response, 429, { error: "Too many conversions in progress" }); return; }
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
          throw new ApiError(415, "Content-Type must be application/json");
        active++;
        try {
          const body = await readJson(request, options.maxInputMb * 1024 * 1024);
          if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "JSON body must be an object");
          const hasMarkdown = Object.hasOwn(body, "markdown");
          const hasTemplate = Object.hasOwn(body, "template");
          if (hasMarkdown === hasTemplate) throw new ApiError(400, "Provide exactly one of markdown or template");
          if (hasMarkdown && typeof body.markdown !== "string") throw new ApiError(400, "markdown must be a string");
          if (hasTemplate && typeof body.template !== "string") throw new ApiError(400, "template must be a string");
          let markdown = body.markdown;
          if (hasTemplate || body.data !== undefined) {
            if (!body.data || typeof body.data !== "object" || Array.isArray(body.data))
              throw new ApiError(400, "data must be a JSON object when binding a template");
            try { markdown = renderReportTemplate(hasTemplate ? body.template : body.markdown, body.data); }
            catch (error) { throw new ApiError(400, error.message); }
          }
          const format = body.format || "pdf";
          if (!["docx", "pdf", "both"].includes(format)) throw new ApiError(400, "format must be docx, pdf, or both");
          if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 200)) throw new ApiError(400, "title must be text under 200 characters");
          if (body.filename !== undefined && (typeof body.filename !== "string" || body.filename.length > 200)) throw new ApiError(400, "filename must be text under 200 characters");
          let layoutOverrides;
          try { layoutOverrides = validateLayout(body.layout || {}); }
          catch (error) { throw new ApiError(400, error.message); }
          const attachments = apiImages(body.images);
          const filename = safeFilename(body.filename || body.title);
          const outputs = await renderDocument({ browser, server: assetServer, markdown,
            title: body.title || "Document", layoutOverrides, formats: [format], timeout: options.timeout, filename,
            resolveImages: async refs => refs.map(reference => imageFromApi(reference, attachments[reference], [format])) });
          const bytes = outputs[0].bytes;
          const extension = format === "both" ? "zip" : format;
          const types = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip: "application/zip" };
          response.writeHead(200, { "Content-Type": types[extension], "Content-Disposition": `attachment; filename="${filename}.${extension}"`,
            "Content-Length": bytes.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end(bytes);
        } finally { active--; }
      })().catch(error => {
        if (!(error instanceof ApiError)) process.stderr.write(`Conversion failed: ${error.message}\n`);
        sendJson(response, error.status || 422, { error: error.message });
      });
    });
    await new Promise((resolve, reject) => {
      api.once("error", reject);
      api.listen(options.port, options.host, resolve);
    });
    const displayHost = options.host.includes(":") ? `[${options.host}]` : options.host;
    process.stdout.write(`FoliMarkdown API listening on http://${displayHost}:${api.address().port}\n`);
    await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  } finally {
    if (api?.listening) await new Promise(resolve => api.close(resolve));
    if (browser) await browser.close().catch(() => {});
    if (assetServer) await new Promise(resolve => assetServer.close(resolve));
    if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

(async () => {
  try {
    if (process.argv[2] === "serve") {
      const options = parseServerArgs(process.argv.slice(3));
      if (options.help) { process.stdout.write(help); return; }
      await serve(options);
      return;
    }
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { process.stdout.write(help); return; }
    await convert(options);
  } catch (error) {
    process.stderr.write(`folimarkdown: ${error.message}\n`);
    process.exitCode = 1;
  }
})();
