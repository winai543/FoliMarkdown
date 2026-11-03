"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function addWidgetCodeButton(widget) {
    if (widget.querySelector(":scope > .widget-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "widget-toolbar";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-button widget-code-edit";
    button.dataset.sourceStart = widget.dataset.sourceStart;
    button.dataset.sourceEnd = widget.dataset.sourceEnd;
    button.textContent = "Edit code";
    button.setAttribute("aria-label", "Edit this widget’s Markdown source");
    if (widget.matches(".markdown-row")) {
      widget.querySelectorAll(":scope > .markdown-col").forEach(column => {
        const editColumn = document.createElement("button");
        editColumn.type = "button";
        editColumn.className = "library-button column-edit";
        editColumn.dataset.rowStart = column.dataset.rowStart;
        editColumn.dataset.columnIndex = column.dataset.columnIndex;
        editColumn.textContent = `Col ${Number(column.dataset.columnIndex) + 1}`;
        editColumn.title = `Edit column ${Number(column.dataset.columnIndex) + 1}`;
        editColumn.setAttribute("aria-label", `Edit column ${Number(column.dataset.columnIndex) + 1}`);
        toolbar.append(editColumn);
      });
    }
    const diagramEdit = widget.querySelector(":scope > .diagram-edit");
    if (diagramEdit) toolbar.append(diagramEdit);
    toolbar.append(button);
    widget.append(toolbar);
  }
  function paperDimensions() {
    const portrait = layout.paperSize === "letter" ? [816, 1056] : [794, 1123];
    return layout.orientation === "landscape" ? portrait.reverse() : portrait;
  }
  function fontStylesheetUrl(font) {
    return GOOGLE_FONTS.has(font)
      ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`
      : "";
  }
  function applyDocumentFont() {
    const font = GOOGLE_FONTS.has(layout.font) ? layout.font : "system";
    layout.font = font;
    $("#docFont").value = font;
    pages.style.setProperty("--document-font", font === "system"
      ? 'system-ui, sans-serif'
      : `"${font}", system-ui, sans-serif`);
    const link = $("#googleFontStyle");
    const request = ++fontRequest;
    link.onload = null;
    link.onerror = null;
    if (font === "system") {
      fontReady = Promise.resolve();
      link.removeAttribute("href");
      return;
    }
    let resolveFont;
    fontReady = new Promise(resolve => { resolveFont = resolve; });
    link.onload = () => {
      Promise.all([
        document.fonts.load(`400 14px "${font}"`, "Sample text"),
        document.fonts.load(`700 22px "${font}"`, "Sample text")
      ]).catch(() => {}).finally(() => {
        if (request === fontRequest && lastRenderedHtml) paginate();
        resolveFont();
      });
    };
    link.onerror = resolveFont;
    link.href = fontStylesheetUrl(font);
  }
  function waitForVisuals() {
    return Promise.race([Promise.all([fontReady, diagramWork]), new Promise(resolve => setTimeout(resolve, 7500))]);
  }
  function applyPaperSettings() {
    const [width, height] = paperDimensions();
    pages.style.setProperty("--page-width", `${width}px`);
    pages.style.setProperty("--page-height", `${height}px`);
    pages.style.setProperty("--page-margin", `${({ normal: 76, narrow: 48, wide: 100 })[layout.margin] || 76}px`);
    const [printWidth, printHeight] = layout.paperSize === "letter" ? [8.5, 11] : [210, 297];
    const dimensions = layout.orientation === "landscape" ? [printHeight, printWidth] : [printWidth, printHeight];
    const unit = layout.paperSize === "letter" ? "in" : "mm";
    $("#pagePrintStyle").textContent = `@media print { @page { size: ${layout.paperSize === "letter" ? "letter" : "A4"} ${layout.orientation === "landscape" ? "landscape" : "portrait"}; margin: 0; } .page { width: ${dimensions[0]}${unit}; height: ${dimensions[1]}${unit}; } }`;
  }
  function pageText(text, page, total) {
    return text.replace(/\{title\}/gi, docName.value.trim() || "Untitled")
      .replace(/\{page\}/gi, String(page)).replace(/\{pages\}/gi, String(total));
  }
  function makePage(number) {
    const page = document.createElement("article");
    page.className = "page";
    page.setAttribute("aria-label", `Page ${number}`);
    page.innerHTML = '<div class="page-header" title="Double-click to edit header"></div><div class="page-body document"></div><div class="page-footer" title="Double-click to edit footer"><span></span><span></span></div>';
    pages.append(page);
    return page;
  }
  function fits(body) {
    const last = [...body.children].findLast(child => !child.classList.contains("markdown-absolute"));
    return !last || last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1;
  }
  function splitTextBlock(block, body, fitsWithin = () => fits(body)) {
    const nodes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.length && !walker.currentNode.parentElement?.closest(".table-editor-caption, .markdown-absolute")) nodes.push(walker.currentNode);
    const length = nodes.reduce((sum, node) => sum + node.length, 0);
    if (length < 2) return null;
    const positionAt = count => {
      for (const node of nodes) {
        if (count <= node.length) return [node, count];
        count -= node.length;
      }
      return [nodes.at(-1), nodes.at(-1).length];
    };
    const clonePart = (from, to) => {
      const range = document.createRange();
      if (from === 0) range.setStart(block, 0);
      else { const [node, offset] = positionAt(from); range.setStart(node, offset); }
      if (to === length) range.setEnd(block, block.childNodes.length);
      else { const [node, offset] = positionAt(to); range.setEnd(node, offset); }
      const part = block.cloneNode(false);
      part.append(range.cloneContents());
      if (from) { part.removeAttribute("id"); part.classList.remove("lead"); }
      return part;
    };
    let low = 1, high = length - 1, best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = clonePart(0, mid);
      body.append(candidate);
      const okay = fitsWithin();
      candidate.remove();
      if (okay) { best = mid; low = mid + 1; }
      else high = mid - 1;
    }
    if (!best) return null;
    const first = clonePart(0, best);
    const rest = clonePart(best, length);
    body.append(first);
    return rest;
  }
  function splitRows(block, body, fitsWithin = () => fits(body)) {
    const table = block.tagName === "TABLE";
    const children = table ? [...block.tBodies[0]?.rows || []] : [...block.children];
    if (children.length < 2) return null;
    const first = block.cloneNode(false);
    const rest = block.cloneNode(false);
    let firstHolder = first, restHolder = rest;
    if (table) {
      if (block.caption) { first.append(block.caption.cloneNode(true)); rest.append(block.caption.cloneNode(true)); }
      if (block.tHead) { first.append(block.tHead.cloneNode(true)); rest.append(block.tHead.cloneNode(true)); }
      firstHolder = first.createTBody();
      restHolder = rest.createTBody();
    }
    body.append(first);
    let splitAt = 0;
    for (const child of children) {
      firstHolder.append(child.cloneNode(true));
      if (!fitsWithin()) { firstHolder.lastChild.remove(); break; }
      splitAt++;
    }
    if (!splitAt || splitAt === children.length) { first.remove(); return null; }
    children.slice(splitAt).forEach(child => restHolder.append(child.cloneNode(true)));
    if (block.tagName === "OL") rest.start = (Number(block.getAttribute("start")) || 1) + splitAt;
    rest.removeAttribute("id");
    return rest;
  }
  function splitColumnRow(block, body, fitsWithin = () => fits(body)) {
    const first = block.cloneNode(false), rest = block.cloneNode(false);
    for (const column of block.children) {
      first.append(column.cloneNode(false)); rest.append(column.cloneNode(false));
    }
    body.append(first);
    let moved = false, remaining = false;
    [...block.children].forEach((column, index) => {
      const target = first.children[index], remainder = rest.children[index];
      const children = [...column.children];
      while (children.length) {
        const child = children.shift().cloneNode(true);
        target.append(child);
        if (child.classList.contains('markdown-absolute')) continue;
        if (fitsWithin()) { moved = true; continue; }
        child.remove();
        const tail = child.classList.contains('markdown-row') ? splitColumnRow(child, target, fitsWithin)
          : ['TABLE', 'UL', 'OL'].includes(child.tagName) ? splitRows(child, target, fitsWithin)
          : child.classList.contains('mermaid-figure') ? null : splitTextBlock(child, target, fitsWithin);
        if (tail) { moved = true; remainder.append(tail); }
        else remainder.append(child);
        remainder.append(...children.map(element => element.cloneNode(true)));
        remaining = true;
        break;
      }
    });
    if (!moved || !remaining) { first.remove(); return null; }
    return rest;
  }
  function paginate() {
    applyPaperSettings();
    if (currentView === "source") { pendingLayout = true; return; }
    pendingLayout = false;
    const scrollY = previewScroll.scrollTop;
    pages.replaceChildren();
    const source = document.createElement("div");
    source.innerHTML = lastRenderedHtml;
    // Reserve known image dimensions before measuring the pages. Recreated image
    // elements may report incomplete even when their URL is already cached.
    source.querySelectorAll("img").forEach(image => {
      image.loading = "eager";
      const size = previewImageSizes.get(image.src);
      if (size) {
        image.width = size.width;
        image.height = size.height;
      }
    });
    const figures = [...source.querySelectorAll(".mermaid-figure")];
    const editableDiagrams = new Map();
    if (figures.length) for (const block of editableChartBlocks()) {
      if (block.settings?.type === "diagramTimeline") editableDiagrams.set(block.index, "diagram");
      else if (block.settings) editableDiagrams.set(block.index, "chart");
      else if (parseDiagramSource(block.source)) editableDiagrams.set(block.index, "diagram");
    }
    figures.forEach(figure => {
      populateDiagram(figure);
      if (editableDiagrams.has(Number(figure.dataset.diagramIndex))) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "diagram-edit library-button";
        const editorType = editableDiagrams.get(Number(figure.dataset.diagramIndex));
        edit.dataset.editor = editorType;
        edit.textContent = editorType === "chart" ? "Edit chart" : "Edit diagram";
        edit.setAttribute("aria-label", editorType === "chart" ? "Edit chart or timeline settings" : "Edit diagram settings");
        figure.append(edit);
      }
    });
    let page = makePage(1);
    let body = page.querySelector(".page-body");
    const queue = [...source.children];
    let safety = 0;
    while (queue.length && safety++ < 10000) {
      const block = queue.shift();
      if (block.dataset.pageBreak) {
        // Consecutive explicit breaks intentionally create blank pages.
        page = makePage(pages.children.length + 1);
        body = page.querySelector(".page-body");
        continue;
      }
      body.append(block);
      if (block.classList.contains("markdown-absolute") || fits(body)) continue;
      block.remove();
      const splittable = ["UL", "OL", "TABLE"].includes(block.tagName);
      const trySplit = () => block.classList.contains("markdown-row") ? splitColumnRow(block, body) : block.classList.contains("mermaid-figure") ? null : (splittable ? splitRows(block, body) : splitTextBlock(block, body));
      if ([...body.children].some(child => !child.classList.contains("markdown-absolute"))) {
        const remainder = trySplit();
        if (remainder) {
          page = makePage(pages.children.length + 1);
          body = page.querySelector(".page-body");
          queue.unshift(remainder);
          continue;
        }
        page = makePage(pages.children.length + 1);
        body = page.querySelector(".page-body");
        queue.unshift(block);
        continue;
      }
      const remainder = trySplit() || (splittable ? splitTextBlock(block, body) : null);
      if (remainder) {
        page = makePage(pages.children.length + 1);
        body = page.querySelector(".page-body");
        queue.unshift(remainder);
      } else {
        // A single unbreakable element (such as an image) stays on its own page.
        body.append(block);
      }
    }
    const total = pages.children.length;
    [...pages.children].forEach((item, index) => {
      const number = index + 1;
      const blank = index === 0 && layout.firstPageBlank;
      item.classList.toggle("first-blank", blank);
      item.querySelector(".page-header").textContent = blank ? "" : pageText(layout.header, number, total);
      const footer = item.querySelector(".page-footer").children;
      footer[0].textContent = blank ? "" : pageText(layout.footer, number, total);
      footer[1].textContent = blank || !layout.pageNumbers ? "" : `${number} / ${total}`;
      item.style.zoom = `${effectiveZoom()}%`;
    });
    $("#pageCount").textContent = `${total.toLocaleString("en-US")} pages`;
    previewScroll.scrollTop = Math.min(scrollY, previewScroll.scrollHeight - previewScroll.clientHeight);
    pages.querySelectorAll("img").forEach(image => {
      const rememberSize = () => {
        if (!image.isConnected || !image.naturalWidth || !image.naturalHeight) return;
        const previous = previewImageSizes.get(image.src);
        if (previous?.width === image.naturalWidth && previous?.height === image.naturalHeight) return;
        previewImageSizes.set(image.src, { width: image.naturalWidth, height: image.naturalHeight });
        clearTimeout(imageRelayoutTimer);
        imageRelayoutTimer = setTimeout(paginate, 100);
      };
      if (image.complete) rememberSize();
      else image.addEventListener("load", rememberSize, { once: true });
    });
    queueDiagrams(figures);
    pages.querySelectorAll("[data-source-start][data-source-end]").forEach(widget => {
      if (widget.matches("table")) return;
      if (widget.matches("img")) return;
      if (widget.matches(".markdown-image-widget")) {
        addWidgetCodeButton(widget);
        return;
      }
      if (widget.matches(".markdown-row, .markdown-absolute, .mermaid-figure, pre")) addWidgetCodeButton(widget);
    });
    refreshPreviewHighlights();
  }
