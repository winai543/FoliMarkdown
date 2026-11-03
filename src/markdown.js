"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }
  function safeUrl(value, image = false) {
    const url = value.trim();
    if (image && /^asset:[0-9a-f-]{36}$/i.test(url)) {
      const data = imageAssets.get(url.slice(6));
      return data && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(data) ? data : "#";
    }
    if (image && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(url)) return url;
    if (/^https?:\/\//i.test(url) || (!image && (/^mailto:/i.test(url) || /^(\/(?!\/)|\.\/|\.\.\/|#)/.test(url)))) return escapeHtml(url);
    if (image && localImagePath(url)) {
      const stored = mappedImageData(url);
      if (stored) return escapeHtml(stored);
      try {
        const resolved = new URL(url.replace(/\\/g, "/"), document.baseURI);
        if (["http:", "https:", "file:"].includes(resolved.protocol)) return escapeHtml(resolved.href);
      } catch { /* Invalid paths stay blocked. */ }
    }
    return "#";
  }
  // The bundled Marked parser handles GFM nesting, tables, autolinks and task items.
  // Override raw HTML and URLs instead of trusting Markdown as HTML.
  let markdownContext;
  const markdownParser = new marked.Marked({
    gfm: true,
    breaks: false,
    extensions: [COLUMN_EXTENSION, ABSOLUTE_EXTENSION, {
      name: "pagebreak",
      level: "block",
      start(source) { return source.search(/<!--\s*pagebreak\s*-->/i); },
      tokenizer(source) {
        const match = /^ {0,3}<!--\s*pagebreak\s*-->[ \t]*(?:\n|$)/i.exec(source);
        if (match) return { type: "pagebreak", raw: match[0] };
      },
      renderer() { return '<span class="page-break-marker" data-page-break="true"></span>\n'; }
    }]
  });
  markdownParser.use({ renderer: {
    table(token) {
      const index = markdownContext.tableIndex++;
      const codeEdit = `<button type="button" class="library-button widget-code-edit" data-source-start="${token._sourceStart}" data-source-end="${token._sourceEnd}">Edit code</button>`;
      const tableEdit = token._editableTable ? `<button type="button" class="library-button table-edit" data-table-index="${index}">Edit table</button>` : "";
      const caption = `<caption class="table-editor-caption"><span class="widget-toolbar">${tableEdit}${codeEdit}</span></caption>`;
      return marked.Renderer.prototype.table.call(this, token).replace("<table>", `<table data-table-index="${index}" data-source-start="${token._sourceStart}" data-source-end="${token._sourceEnd}">${caption}`);
    },
    heading(token) {
      const id = `heading-${markdownContext.headingIndex++}`;
      const content = this.parser.parseInline(token.tokens);
      if (token._line != null) {
        const label = document.createElement("span");
        label.innerHTML = content;
        markdownContext.headings.push({ id, level: token.depth, text: label.textContent, line: token._line });
      }
      return `<h${token.depth} id="${id}">${content}</h${token.depth}>\n`;
    },
    paragraph(token) {
      return `<p${token._lead ? ' class="lead"' : ""}>${this.parser.parseInline(token.tokens)}</p>\n`;
    },
    code(token) {
      const language = (token.lang || "").split(/\s+/)[0].toLowerCase();
      if (["mermaid", "chart", "diagram"].includes(language)) {
        const index = markdownContext.diagramIndex++;
        markdownContext.diagramKeys.push(`${index}\u0000${token.text}`);
        return `<figure class="mermaid-figure" data-diagram-index="${index}" data-source-start="${token._sourceStart}" data-source-end="${token._sourceEnd}" data-mermaid-source="${escapeHtml(token.text)}"><div class="diagram-state">Rendering diagram…</div></figure>\n`;
      }
      return `<pre data-source-start="${token._sourceStart}" data-source-end="${token._sourceEnd}"><code>${escapeHtml(token.text)}</code></pre>\n`;
    },
    html(token) {
      const escaped = escapeHtml(token.text);
      return token.block ? `<p>${escaped}</p>\n` : escaped;
    },
    link(token) {
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${safeUrl(token.href)}"${title} target="_blank" rel="noopener noreferrer">${this.parser.parseInline(token.tokens)}</a>`;
    },
    image(token) {
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<span class="markdown-image-widget" data-source-start="${token._sourceStart}" data-source-end="${token._sourceEnd}"><img src="${safeUrl(token.href, true)}" alt="${escapeHtml(token.text)}"${title} loading="lazy"></span>`;
    },
    listitem(token) {
      return `<li${token.task ? ' class="task"' : ""}>${this.parser.parse(token.tokens)}</li>\n`;
    }
  } });
  function renderMarkdown(markdown) {
    const source = markdown.replace(/\r\n?/g, "\n");
    const tokens = markdownParser.lexer(source);
    markdownParser.walkTokens(tokens, token => {
      if (token.type === "table") token._editableTable = !!tableFromToken(token);
    });
    visitMarkdownSource(tokens, source, (token, offset) => {
      token._sourceStart = offset;
      token._sourceEnd = offset + token.raw.length;
      if (token.type === "heading") token._line = source.slice(0, offset).split("\n").length - 1;
    });
    const first = tokens.filter(token => token.type !== "space");
    if (first[0]?.type === "heading" && first[1]?.type === "paragraph") first[1]._lead = true;
    markdownContext = { headings: [], diagramKeys: [], headingIndex: 0, diagramIndex: 0, tableIndex: 0 };
    const html = markdownParser.parser(tokens);
    return { html, headings: markdownContext.headings, diagramKeys: markdownContext.diagramKeys };
  }
  function render() {
    const previewSource = previewMarkdownSource(editor.value);
    const result = renderMarkdown(previewSource);
    document.body.classList.toggle("data-preview-active", previewSource !== editor.value);
    lastRenderedHtml = result.html || '<div class="empty-preview"><span class="empty-symbol">▤</span>Start typing Markdown to create a document</div>';
    activeDiagramKeys = new Set(result.diagramKeys);
    for (const key of diagramCache.keys()) if (!activeDiagramKeys.has(key)) diagramCache.delete(key);
    paginate();
    headings = result.headings;
    renderNavigation();
    refreshSearchHighlights();
    const text = editor.value.trim();
    const words = text ? (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length : 0;
    $("#wordCount").textContent = `${words.toLocaleString("en-US")} words`;
    $("#charCount").textContent = `${editor.value.length.toLocaleString("en-US")} characters`;
    $("#lineCount").textContent = `${editor.value.split("\n").length.toLocaleString("en-US")} lines`;
  }
