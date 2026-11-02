"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => perform(button.dataset.action)));
  pages.addEventListener("click", event => {
    const retry = event.target.closest(".diagram-retry");
    if (!retry) return;
    const figure = retry.closest(".mermaid-figure");
    diagramCache.delete(diagramKey(figure));
    mermaidModulePromise = null;
    mermaidLoadAttempt++;
    paginate();
  });
  pages.addEventListener("dblclick", event => {
    const target = event.target.closest(".page-header, .page-footer");
    if (!target) return;
    document.querySelector('[data-tab="layout"]').click();
    const input = target.classList.contains("page-header") ? $("#headerText") : $("#footerText");
    input.focus();
    input.select();
  });
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll("[data-ribbon]").forEach(ribbon => ribbon.hidden = ribbon.dataset.ribbon !== button.dataset.tab);
  }));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => {
    setNavigationTab(button.dataset.nav);
  }));
  $("#styleSelect").addEventListener("change", event => {
    const value = event.target.value;
    if (value === "quote") perform("quote");
    else heading(value === "paragraph" ? 0 : Number(value[1]));
    event.target.value = "paragraph";
  });
  $("#search").addEventListener("input", () => {
    if ($("#search").value.trim()) setNavigationTab("results");
    else renderNavigation();
    refreshSearchHighlights();
    refreshPreviewHighlights();
  });
  $("#search").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1, event.shiftKey ? editor.selectionStart : editor.selectionEnd); }
  });
  $("#searchPrevious").addEventListener("click", () => stepMatch(-1, editor.selectionStart));
  $("#searchNext").addEventListener("click", () => stepMatch());
  $("#replaceOne").addEventListener("click", replaceOne);
  $("#replaceAll").addEventListener("click", replaceAll);
  $("#docFont").addEventListener("change", event => {
    layout.font = event.target.value;
    applyDocumentFont();
    paginate();
    scheduleSave();
  });
  ["paperSize", "orientation", "margin", "headerText", "footerText", "pageNumbers", "firstPageBlank"].forEach(id => {
    const control = $(`#${id}`);
    control.addEventListener(id.endsWith("Text") ? "input" : "change", () => {
      layout = { ...layout,
        paperSize: $("#paperSize").value, orientation: $("#orientation").value, margin: $("#margin").value,
        header: $("#headerText").value, footer: $("#footerText").value,
        pageNumbers: $("#pageNumbers").checked, firstPageBlank: $("#firstPageBlank").checked
      };
      paginate();
      scheduleSave();
    });
  });
  $("#newTop").addEventListener("click", () => perform("new"));
  $("#libraryTop").addEventListener("click", () => perform("library"));
  $("#downloadTop").addEventListener("click", () => perform("download"));
  $("#closeLibrary").addEventListener("click", closeLibrary);
  $("#libraryOverlay").addEventListener("click", event => {
    if (event.target === $("#libraryOverlay")) closeLibrary();
  });
  $("#libraryNew").addEventListener("click", () => libraryAction("new"));
  $("#librarySearch").addEventListener("input", renderLibrary);
  document.querySelectorAll("[data-library-filter]").forEach(button => button.addEventListener("click", () => {
    libraryFilter = button.dataset.libraryFilter;
    renderLibrary();
  }));
  $("#libraryList").addEventListener("click", event => {
    const button = event.target.closest("[data-library-action]");
    if (button) libraryAction(button.dataset.libraryAction, button.dataset.id);
  });
  $("#toggleNav").addEventListener("click", () => {
    const nav = $("#navigation");
    const isOpen = window.innerWidth <= 800 ? nav.classList.contains("open") : !nav.classList.contains("collapsed");
    setNavigationOpen(!isOpen);
  });
  $("#openNav").addEventListener("click", () => setNavigationOpen(true));
  $("#closeNav").addEventListener("click", () => setNavigationOpen(false));
  docName.addEventListener("input", () => { render(); scheduleSave(); });
  editor.addEventListener("input", () => {
    update();
    clearTimeout(compactTimer);
    compactTimer = setTimeout(compactCurrentEditor, 650);
  });
  editor.addEventListener("click", refreshSearchHighlights);
  editor.addEventListener("keyup", refreshSearchHighlights);
  document.addEventListener("paste", event => {
    if (event.target !== editor && !event.target.closest?.(".preview-side") && event.target !== document.body) return;
    const images = [...(event.clipboardData?.items || [])].filter(item => item.kind === "file" && IMAGE_TYPES.has(item.type))
      .map(item => item.getAsFile()).filter(Boolean);
    if (!images.length) return;
    event.preventDefault();
    insertImages(images);
  });
  editor.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      editor.setRangeText("  ", start, editor.selectionEnd, "end");
      update(true);
    }
  });
  document.addEventListener("keydown", event => {
    if (document.querySelector(".desktop-prompt[open]")) return;
    if (event.key === "Escape" && !$("#libraryOverlay").hidden) { event.preventDefault(); closeLibrary(); return; }
    if (!$("#libraryOverlay").hidden) {
      if (event.key === "Tab") {
        const focusable = [...$("#libraryOverlay").querySelectorAll("button:not([disabled]), input:not([disabled])")];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const actions = { b: "bold", i: "italic", k: "link", s: "download", o: "open" };
    const editing = document.activeElement === editor;
    if (key === "p") { event.preventDefault(); perform("print"); }
    else if (key === "s" || key === "o") { event.preventDefault(); perform(actions[key]); }
    else if (key === "f") { event.preventDefault(); perform("find"); }
    else if (editing && key === "enter") { event.preventDefault(); perform("pagebreak"); }
    else if (editing && key === "z") { event.preventDefault(); perform(event.shiftKey ? "redo" : "undo"); }
    else if (editing && key === "y") { event.preventDefault(); perform("redo"); }
    else if (editing && actions[key]) { event.preventDefault(); perform(actions[key]); }
  });
  $("#fileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importFile(file);
    event.target.value = "";
  });
  $("#imageInput").addEventListener("change", async event => {
    if (event.target.files?.length) await insertImages(event.target.files);
    event.target.value = "";
  });
  document.addEventListener("dragover", event => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    sourceWrap.classList.toggle("image-drop", event.target.closest(".source-wrap") === sourceWrap);
  });
  document.addEventListener("dragleave", event => { if (!event.relatedTarget) sourceWrap.classList.remove("image-drop"); });
  document.addEventListener("drop", async event => {
    sourceWrap.classList.remove("image-drop");
    const files = [...(event.dataTransfer?.files || [])];
    const file = files[0];
    if (!file) return;
    event.preventDefault();
    if (IMAGE_TYPES.has(file.type)) { await insertImages(files); return; }
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { toast("Supported files: .md, .markdown, and .txt"); return; }
    await importFile(file);
  });
  function effectiveZoom() {
    const [width] = paperDimensions();
    const fit = Math.min(1, (previewScroll.clientWidth - 48) / width);
    return Math.max(35, Math.round(Number($("#zoom").value) * fit));
  }
  function setZoom(value) {
    const zoom = Math.max(70, Math.min(130, Number(value)));
    $("#zoom").value = zoom;
    $("#zoomLabel").textContent = `${zoom}%`;
    pages.querySelectorAll(".page").forEach(page => page.style.zoom = `${effectiveZoom()}%`);
  }
  $("#zoom").addEventListener("input", event => setZoom(event.target.value));
  $("#zoomOut").addEventListener("click", () => setZoom(Number($("#zoom").value) - 10));
  $("#zoomIn").addEventListener("click", () => setZoom(Number($("#zoom").value) + 10));
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 680 && currentView === "split") setView("source");
    refreshEditorHeight();
    setZoom($("#zoom").value);
  });
  window.addEventListener("pagehide", () => { draftSnapshot(); persist(); });
