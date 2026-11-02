"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function searchMatches(limit = 2000) {
    const query = $("#search").value.trim();
    if (!query) return [];
    const text = editor.value.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    const matches = [];
    let from = 0, at;
    while ((at = text.indexOf(needle, from)) !== -1 && matches.length < limit) {
      matches.push(at);
      from = at + needle.length;
    }
    return matches;
  }
  function refreshSearchHighlights() {
    const overlay = $("#searchHighlights");
    const query = $("#search").value.trim();
    const matches = searchMatches();
    const fragment = document.createDocumentFragment();
    if (query && matches.length) {
      let previous = 0;
      for (const position of matches) {
        fragment.append(document.createTextNode(editor.value.slice(previous, position)));
        const mark = document.createElement("mark");
        mark.textContent = editor.value.slice(position, position + query.length);
        if (editor.selectionStart === position && editor.selectionEnd === position + query.length) mark.className = "current";
        fragment.append(mark);
        previous = position + query.length;
      }
      fragment.append(document.createTextNode(editor.value.slice(previous)));
    }
    overlay.replaceChildren(fragment);
    overlay.hidden = !query || !matches.length;
    editor.classList.toggle("searching", !overlay.hidden);
    const index = matches.indexOf(editor.selectionStart);
    $("#searchCount").textContent = query
      ? `${index >= 0 && editor.selectionEnd === editor.selectionStart + query.length ? `${index + 1} / ` : ""}${matches.length === 2000 ? "2000+" : matches.length} matches`
      : "0 matches";
    ["searchPrevious", "searchNext", "replaceOne", "replaceAll"].forEach(id => $(`#${id}`).disabled = !matches.length);
  }
  function refreshPreviewHighlights() {
    if (!window.Highlight || !CSS.highlights) return;
    CSS.highlights.delete("folimarkdown-search");
    const query = $("#search").value.trim().toLocaleLowerCase();
    if (!query) return;
    const ranges = [];
    const walker = document.createTreeWalker(pages, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && ranges.length < 500) {
      const node = walker.currentNode;
      if (node.parentElement?.closest(".page-header, .page-footer, .diagram-error")) continue;
      const value = node.textContent.toLocaleLowerCase();
      let from = 0, at;
      while ((at = value.indexOf(query, from)) !== -1 && ranges.length < 500) {
        const range = new Range();
        range.setStart(node, at);
        range.setEnd(node, at + query.length);
        ranges.push(range);
        from = at + query.length;
      }
    }
    if (ranges.length) CSS.highlights.set("folimarkdown-search", new Highlight(...ranges));
  }
  function renderNavigation() {
    const query = $("#search").value.trim().toLocaleLowerCase();
    if (currentNav === "results") {
      const positions = searchMatches(100);
      outline.replaceChildren();
      if (!query) { outline.innerHTML = '<div class="outline-empty">Enter a search term above</div>'; return; }
      if (!positions.length) { outline.innerHTML = '<div class="outline-empty">No matches found</div>'; return; }
      positions.forEach(position => {
        const lineStart = editor.value.lastIndexOf("\n", position - 1) + 1;
        const lineNumber = editor.value.slice(0, lineStart).split("\n").length;
        const start = Math.max(lineStart, position - 28);
        const end = Math.min(editor.value.indexOf("\n", position) < 0 ? editor.value.length : editor.value.indexOf("\n", position), position + query.length + 40);
        const button = document.createElement("button");
        button.className = "outline-item";
        button.append(document.createTextNode(`${lineNumber}  ${start > lineStart ? "…" : ""}${editor.value.slice(start, position)}`));
        const mark = document.createElement("mark");
        mark.textContent = editor.value.slice(position, position + query.length);
        button.append(mark, document.createTextNode(editor.value.slice(position + query.length, end) + (end < editor.value.length && editor.value[end] !== "\n" ? "…" : "")));
        button.addEventListener("click", () => selectMatch(position));
        outline.append(button);
      });
      return;
    }
    outline.innerHTML = "";
    if (!headings.length) { outline.innerHTML = '<div class="outline-empty">Add a heading with # to create an outline</div>'; return; }
    headings.forEach(item => {
      const button = document.createElement("button");
      button.className = `outline-item level-${Math.min(item.level, 3)}`;
      button.textContent = item.text;
      button.title = item.text;
      button.addEventListener("click", () => {
        if (currentView === "source") selectLine(item.line);
        else document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      outline.append(button);
    });
  }
  function selectLine(lineNumber, query = "") {
    if (currentView === "preview") setView("split");
    const lines = editor.value.split("\n");
    const offset = lines.slice(0, lineNumber).reduce((sum, line) => sum + line.length + 1, 0);
    const matchAt = query ? lines[lineNumber].toLocaleLowerCase().indexOf(query) : 0;
    editor.focus();
    editor.setSelectionRange(offset + Math.max(matchAt, 0), offset + Math.max(matchAt, 0) + query.length);
    const approximateLineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
    sourceWrap.scrollTop = Math.max(0, lineNumber * approximateLineHeight - sourceWrap.clientHeight / 3);
  }
  function selectMatch(position) {
    if (currentView === "preview") setView("split");
    const length = $("#search").value.trim().length;
    editor.focus();
    editor.setSelectionRange(position, position + length);
    const before = editor.value.slice(0, position);
    const line = before.split("\n").length - 1;
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
    sourceWrap.scrollTop = Math.max(0, line * lineHeight - sourceWrap.clientHeight / 3);
    refreshSearchHighlights();
  }
  function stepMatch(direction = 1, from = editor.selectionEnd) {
    const matches = searchMatches();
    if (!matches.length) return;
    const next = direction > 0 ? matches.find(at => at >= from) ?? matches[0]
      : [...matches].reverse().find(at => at < from) ?? matches.at(-1);
    selectMatch(next);
  }
  function replaceOne() {
    const query = $("#search").value.trim();
    const matches = searchMatches();
    if (!query || !matches.length) return;
    const start = editor.selectionStart;
    const valid = editor.selectionEnd === start + query.length
      && editor.value.slice(start, editor.selectionEnd).toLocaleLowerCase() === query.toLocaleLowerCase();
    const position = valid ? start : matches.find(at => at >= start) ?? matches[0];
    const replacement = $("#replacement").value;
    editor.setRangeText(replacement, position, position + query.length, "end");
    update(true);
    stepMatch(1, position + replacement.length);
    toast("Replaced 1 match");
  }
  function replaceAll() {
    const query = $("#search").value.trim();
    if (!query) return;
    const needle = query.toLocaleLowerCase();
    const lower = editor.value.toLocaleLowerCase();
    const replacement = $("#replacement").value;
    let count = 0, from = 0, at;
    const parts = [];
    while ((at = lower.indexOf(needle, from)) !== -1) {
      parts.push(editor.value.slice(from, at), replacement);
      from = at + query.length;
      count++;
    }
    if (!count) return;
    parts.push(editor.value.slice(from));
    const cursor = editor.selectionStart;
    editor.value = parts.join("");
    editor.setSelectionRange(Math.min(cursor, editor.value.length), Math.min(cursor, editor.value.length));
    update(true);
    toast(`Replaced ${count.toLocaleString("en-US")} matches`);
  }
