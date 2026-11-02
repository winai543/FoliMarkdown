"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  const initialText = `# Welcome to FoliMarkdown

Write in Markdown and see your document take shape as you type.

## Getting started

Select text and use the toolbar above, or type Markdown directly.

- **Format quickly** with headings, bold, italics, and links
- **See a live preview** of your document
- **Save automatically** in your browser and download a .md file

## Markdown examples

> Every great idea starts with a blank page.

| Feature | How to use it |
| --- | --- |
| Heading | Start a line with # |
| List | Start a line with - or 1. |
| Code | Wrap text in \`backticks\` |

### To do

- [x] Open the document
- [ ] Write your story

---

*Ready? Delete this example and start writing.*`;
  const STORAGE_KEY = "markdown-word-document-v1";
  const LIBRARY_KEY = "markdown-word-library-v2";
  const DRAFT_KEY = "markdown-word-draft-v2";
  const ACTIVE_KEY = "markdown-word-active-v2";
  const ASSETS_KEY = "markdown-word-assets-v1";
  const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs";
  const GOOGLE_FONTS = new Set(["Sarabun", "Prompt", "Kanit", "Noto Sans Thai", "Noto Serif Thai", "IBM Plex Sans Thai"]);
  const $ = selector => document.querySelector(selector);
  const editor = $("#editor");
  const pages = $("#pages");
  const docName = $("#docName");
  const region = $("#editorRegion");
  const sourceWrap = $("#sourceWrap");
  const previewScroll = $("#previewScroll");
  const outline = $("#outline");
  let currentView = "split";
  let currentNav = "outline";
  let headings = [];
  let history = [];
  let historyIndex = -1;
  let lastHistoryAt = 0;
  let toastTimer;
  let saveTimer;
  let database = null;
  const imageAssets = new Map();
  let compactTimer;
  let documents = [];
  let activeId = null;
  let saveQueue = Promise.resolve();
  let libraryBusy = false;
  let libraryFilter = "active";
  let lastLibraryFocus = null;
  let ready = false;
  const DEFAULT_LAYOUT = Object.freeze({ paperSize: "a4", orientation: "portrait", margin: "normal", header: "{title}", footer: "FoliMarkdown", pageNumbers: true, firstPageBlank: false, font: "system" });
  let layout = { ...DEFAULT_LAYOUT };
  let fontRequest = 0;
  let fontReady = Promise.resolve();
  let pendingLayout = false;
  let lastRenderedHtml = "";
  let imageRelayoutTimer;
  let mermaidModulePromise;
  let mermaidLoadAttempt = 0;
  let diagramWork = Promise.resolve();
  let diagramSerial = 0;
  let activeDiagramKeys = new Set();
  const diagramCache = new Map();
  const scheduledDiagrams = new Set();
