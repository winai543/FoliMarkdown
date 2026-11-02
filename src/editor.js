"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function setEditorButtonIcon(button, symbol) {
    const paths = {
      '×': 'M6 6l12 12M18 6 6 18',
      '↑': 'm6 10 6-6 6 6M12 4v16',
      '↓': 'm6 14 6 6 6-6M12 4v16',
      '←': 'm10 6-6 6 6 6M4 12h16',
      '→': 'm14 6 6 6-6 6M4 12h16'
    };
    if (!paths[symbol]) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[symbol]); svg.append(path);
    button.replaceChildren(svg);
    button.classList.add('editor-icon-button');
  }
  function recordHistory(force = false) {
    const now = Date.now();
    const state = editor.value;
    if (history[historyIndex] === state) return;
    if (!force && now - lastHistoryAt < 750 && historyIndex > 0 && historyIndex === history.length - 1) history[historyIndex] = state;
    else {
      history = history.slice(0, historyIndex + 1);
      history.push(state);
      if (history.length > 100) history.shift();
      historyIndex = history.length - 1;
    }
    lastHistoryAt = force ? 0 : now;
  }
  function refreshEditorHeight() {
    editor.style.height = "auto";
    editor.style.height = Math.max(sourceWrap.clientHeight - 70, editor.scrollHeight) + "px";
  }
  function update(forceHistory = false) {
    recordHistory(forceHistory);
    render();
    scheduleSave();
    refreshEditorHeight();
  }
  function replaceSelection(before, after = "", placeholder = "text") {
    if (currentView === "preview") setView("split");
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.slice(start, end) || placeholder;
    editor.setRangeText(before + selected + after, start, end, "select");
    editor.setSelectionRange(start + before.length, start + before.length + selected.length);
    editor.focus();
    update(true);
  }
  function prefixLines(prefix) {
    if (currentView === "preview") setView("split");
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = editor.value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = editor.value.length;
    const content = editor.value.slice(lineStart, lineEnd);
    const replacement = content.split("\n").map((line, i) => typeof prefix === "function" ? prefix(line, i) : prefix + line).join("\n");
    editor.setRangeText(replacement, lineStart, lineEnd, "select");
    editor.focus();
    update(true);
  }
  function insertBlock(value) {
    if (currentView === "preview") setView("split");
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = start > 0 && editor.value[start - 1] !== "\n" ? "\n\n" : (start > 0 ? "\n" : "");
    const after = end < editor.value.length && editor.value[end] !== "\n" ? "\n\n" : "\n";
    editor.setRangeText(before + value + after, start, end, "end");
    editor.focus();
    update(true);
  }
  function insertMermaid(source) {
    insertBlock(`\`\`\`mermaid\n${source}\n\`\`\``);
    if (currentView === "source" && window.innerWidth > 680) setView("split");
    requestAnimationFrame(() => {
      const figure = [...pages.querySelectorAll(".mermaid-figure")].reverse()
        .find(item => item.dataset.mermaidSource === source);
      figure?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  function heading(level) {
    if (currentView === "preview") setView("split");
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = editor.value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = editor.value.length;
    const content = editor.value.slice(lineStart, lineEnd).replace(/^#{1,6}\s+/, "");
    const replacement = level ? `${"#".repeat(level)} ${content || "Heading"}` : content;
    editor.setRangeText(replacement, lineStart, lineEnd, "select");
    editor.focus();
    update(true);
  }
