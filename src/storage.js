"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function newRecord(name, text = "", settings = DEFAULT_LAYOUT, imagePaths = {}) {
    return { id: crypto.randomUUID(), name, text, imagePaths: { ...imagePaths }, layout: { ...DEFAULT_LAYOUT, ...settings }, updatedAt: Date.now(), deletedAt: null };
  }
  function snapshot() {
    return { ...documents.find(item => item.id === activeId),
      id: activeId, name: docName.value.trim() || "Untitled", text: editor.value,
      imagePaths: { ...documentImagePaths }, layout: { ...layout }, updatedAt: Date.now(), deletedAt: null };
  }
  function draftSnapshot() {
    if (!activeId || !ready) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot())); }
    catch { /* IndexedDB still saves the document; show an error if that fails too. */ }
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open("markdown-word-library", 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("documents")) request.result.createObjectStore("documents", { keyPath: "id" });
        if (!request.result.objectStoreNames.contains("assets")) request.result.createObjectStore("assets", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database upgrade blocked"));
    });
  }
  function dbRequest(method, value, storeName = "documents") {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, method === "getAll" ? "readonly" : "readwrite");
      const store = tx.objectStore(storeName);
      const request = method === "getAll" ? store.getAll() : method === "put" ? store.put(value) : store.delete(value);
      request.onsuccess = () => { if (method === "getAll") resolve(request.result); };
      tx.oncomplete = () => { if (method !== "getAll") resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }
  async function storeRecord(record) {
    if (database) await dbRequest("put", record);
    else {
      const next = documents.filter(item => item.id !== record.id).concat(record);
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    }
    const index = documents.findIndex(item => item.id === record.id);
    if (index < 0) documents.push(record);
    else documents[index] = record;
  }
  async function removeRecord(id) {
    const removed = documents.find(item => item.id === id);
    if (database) await dbRequest("delete", id);
    else localStorage.setItem(LIBRARY_KEY, JSON.stringify(documents.filter(item => item.id !== id)));
    documents = documents.filter(item => item.id !== id);
    // Copies may share the same asset; retain images referenced by any remaining document or draft.
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    const retained = new Set();
    const recordAssetIds = record => new Set([
      ...[...(record?.text || "").matchAll(ASSET_IMAGE)].map(match => match[2]),
      ...Object.values(record?.imagePaths || {})
    ]);
    for (const record of [...documents, draft?.id !== id ? draft : null]) {
      for (const assetId of recordAssetIds(record)) retained.add(assetId);
    }
    for (const assetId of recordAssetIds(removed)) {
      if (retained.has(assetId)) continue;
      try {
        if (database) await dbRequest("delete", assetId, "assets");
        else {
          const saved = JSON.parse(localStorage.getItem(ASSETS_KEY) || "{}");
          delete saved[assetId];
          localStorage.setItem(ASSETS_KEY, JSON.stringify(saved));
        }
        imageAssets.delete(assetId);
      } catch (error) { console.warn("Cannot clean up unused image:", error); }
    }
  }
  function persist() {
    clearTimeout(saveTimer);
    if (!ready || !activeId) return saveQueue;
    const record = snapshot();
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        await storeRecord(record);
        if (activeId === record.id && snapshot().name === record.name && editor.value === record.text
            && JSON.stringify(layout) === JSON.stringify(record.layout)
            && JSON.stringify(documentImagePaths) === JSON.stringify(record.imagePaths)) {
          const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
          if (draft?.id === record.id && draft.updatedAt <= record.updatedAt) localStorage.removeItem(DRAFT_KEY);
          $("#saveStatus").textContent = "All changes saved";
        }
        return true;
      } catch (error) {
        console.error("Save failed:", error);
        $("#saveStatus").textContent = "Save failed — download .md to back up your work";
        toast("Save failed. Download a .md backup.");
        return false;
      }
    });
    return saveQueue;
  }
  function scheduleSave() {
    if (!ready) return;
    $("#saveStatus").textContent = "Saving...";
    draftSnapshot();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 450);
  }
