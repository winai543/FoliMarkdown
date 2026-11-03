"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function resetDocumentState() {
    history = [editor.value];
    historyIndex = 0;
    lastHistoryAt = 0;
    syncHistoryTools();
    $("#search").value = "";
    currentNav = "outline";
    document.querySelectorAll("[data-nav]").forEach(tab => tab.classList.toggle("active", tab.dataset.nav === "outline"));
    sourceWrap.scrollTop = 0;
    previewScroll.scrollTop = 0;
    render();
    refreshEditorHeight();
    scheduleSave();
  }
  function displayDocument(record) {
    activeId = record.id;
    try { localStorage.setItem(ACTIVE_KEY, record.id); } catch {}
    docName.value = record.name;
    editor.value = record.text;
    documentImagePaths = { ...(record.imagePaths || {}) };
    layout = { ...DEFAULT_LAYOUT, ...record.layout };
    if (layout.footer === "Markdown Word" || layout.footer === "\u0e2b\u0e19\u0e49\u0e32\u0e40\u0e02\u0e35\u0e22\u0e19") layout.footer = DEFAULT_LAYOUT.footer;
    syncLayoutControls();
    resetDocumentState();
  }
  async function flushDocument() {
    clearTimeout(saveTimer);
    return await persist();
  }
  function renderLibrary() {
    const list = $("#libraryList");
    const search = $("#librarySearch").value.trim().toLocaleLowerCase();
    document.querySelectorAll("[data-library-filter]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.libraryFilter === libraryFilter)));
    list.replaceChildren();
    const items = documents.filter(item => libraryFilter === "trash" ? item.deletedAt : !item.deletedAt)
      .filter(item => item.name.toLocaleLowerCase().includes(search))
      .sort((a, b) => (libraryFilter === "trash" ? b.deletedAt - a.deletedAt : b.updatedAt - a.updatedAt));
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty";
      empty.textContent = libraryFilter === "trash" ? "Trash is empty" : "No documents found";
      list.append(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "library-row";
      const info = document.createElement("div");
      info.className = "library-info";
      const name = document.createElement("strong");
      name.textContent = item.name + (item.id === activeId ? " · open" : "");
      const date = document.createElement("small");
      date.textContent = `${item.deletedAt ? "Deleted" : "Edited"} ${new Date(item.deletedAt || item.updatedAt).toLocaleString("en-US")}`;
      info.append(name, date);
      const buttons = document.createElement("div");
      buttons.className = "library-row-actions";
      const actions = libraryFilter === "trash"
        ? [["restore", "Restore"], ["purge", "Delete permanently"]]
        : [["select", "Open"], ["rename", "Rename"], ["duplicate", "Duplicate"], ["delete", "Delete"]];
      actions.forEach(([action, label]) => {
        const button = document.createElement("button");
        button.className = `library-button${action === "delete" || action === "purge" ? " danger" : ""}`;
        button.dataset.libraryAction = action;
        button.dataset.id = item.id;
        button.textContent = label;
        buttons.append(button);
      });
      row.append(info, buttons);
      list.append(row);
    });
  }
  function closeLibrary() {
    $("#libraryOverlay").hidden = true;
    lastLibraryFocus?.focus();
  }
  async function openLibrary() {
    if (!ready) return;
    if (libraryBusy) return;
    if (!await flushDocument()) return;
    lastLibraryFocus = document.activeElement;
    $("#libraryOverlay").hidden = false;
    renderLibrary();
    $("#librarySearch").focus();
  }
  async function libraryAction(action, id) {
    if (!ready) return;
    if (libraryBusy) return;
    libraryBusy = true;
    try {
      if (!await flushDocument()) return;
      const item = documents.find(doc => doc.id === id);
      if (!item && action !== "new") return;
      if (action === "new") {
        const record = newRecord("New document");
        await storeRecord(record);
        displayDocument(record);
        closeLibrary();
        editor.focus();
        toast("New document created");
      } else if (action === "select" || action === "restore") {
        if (action === "restore") {
          const restored = { ...item, deletedAt: null, updatedAt: Date.now() };
          await storeRecord(restored);
          displayDocument(restored);
        } else displayDocument(item);
        closeLibrary();
        toast(action === "restore" ? "Document restored" : "Document opened");
      } else if (action === "rename") {
        const name = (await promptDocumentName(item.name))?.trim();
        if (!name || name === item.name) return;
        const renamed = { ...item, name: name.slice(0, 100), updatedAt: Date.now() };
        await storeRecord(renamed);
        if (id === activeId) { docName.value = renamed.name; render(); }
        renderLibrary();
      } else if (action === "duplicate") {
        const copy = newRecord(`${item.name} (copy)`, item.text, item.layout, item.imagePaths);
        await storeRecord(copy);
        renderLibrary();
        toast("Copy created");
      } else if (action === "delete" || action === "purge") {
        if (!await confirmDocumentAction(action === "purge" ? `Permanently delete "${item.name}"? This cannot be undone.` : `Move "${item.name}" to Trash?`)) return;
        if (action === "purge") await removeRecord(id);
        else await storeRecord({ ...item, deletedAt: Date.now() });
        if (id === activeId) {
          try { localStorage.removeItem(DRAFT_KEY); } catch {}
          const next = documents.filter(doc => !doc.deletedAt && doc.id !== id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (next) displayDocument(next);
          else {
            const blank = newRecord("New document");
            await storeRecord(blank);
            displayDocument(blank);
          }
        }
        renderLibrary();
        toast(action === "purge" ? "Permanently deleted" : "Moved to Trash (can be restored)");
      }
    } catch (error) {
      console.error("Library operation failed:", error);
      toast("Operation failed. Browser storage may be full.");
    } finally { libraryBusy = false; }
  }
  async function startLibrary() {
    $("#saveStatus").textContent = "Opening document library...";
    editor.readOnly = true;
    try {
      try {
        database = await openDatabase();
        documents = await dbRequest("getAll");
        for (const asset of await dbRequest("getAll", null, "assets")) imageAssets.set(asset.id, asset.data);
      } catch (error) {
        console.warn("Using localStorage fallback:", error);
        database?.close();
        database = null;
        documents = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
        if (!Array.isArray(documents)) documents = [];
        for (const [id, data] of Object.entries(JSON.parse(localStorage.getItem(ASSETS_KEY) || "{}"))) imageAssets.set(id, data);
      }
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (legacy && typeof legacy.text === "string" && !documents.length) {
        const migrated = newRecord(typeof legacy.name === "string" ? legacy.name : "My Document",
          legacy.text, legacy.layout);
        await storeRecord(migrated);
        try {
          localStorage.setItem(ACTIVE_KEY, migrated.id);
          localStorage.removeItem(STORAGE_KEY);
        } catch { /* The original remains available if browser storage is restricted. */ }
      }
      if (!documents.length) await storeRecord(newRecord("My Document", initialText));
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (draft?.id && typeof draft.text === "string") {
        const stored = documents.find(item => item.id === draft.id);
        if (stored && !stored.deletedAt && draft.updatedAt >= stored.updatedAt) {
          await storeRecord({ ...stored, name: draft.name, text: draft.text,
            layout: { ...DEFAULT_LAYOUT, ...draft.layout }, imagePaths: draft.imagePaths || stored.imagePaths || {}, updatedAt: draft.updatedAt });
          toast("Latest draft restored");
        }
      }
      // Convert older inline Base64 images after draft recovery; keep originals if storing an asset fails.
      for (const record of [...documents]) {
        const compact = await compactImages(record.text);
        if (compact !== record.text) await storeRecord({ ...record, text: compact });
      }
      const preferred = localStorage.getItem(ACTIVE_KEY);
      const current = documents.find(item => item.id === preferred && !item.deletedAt)
        || documents.filter(item => !item.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const selected = current || newRecord("New document");
      if (!current) await storeRecord(selected);
      ready = true;
      displayDocument(selected);
      editor.readOnly = false;
      if (window.innerWidth <= 680) setView("source");
      requestAnimationFrame(refreshEditorHeight);
    } catch (error) {
      console.error("Unable to initialize library:", error);
      $("#saveStatus").textContent = "Could not open library — download a backup";
      editor.value = initialText;
      editor.readOnly = false;
      render();
      toast("Could not open the library. Download a .md backup.");
    }
  }
