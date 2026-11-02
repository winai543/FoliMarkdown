"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  const INLINE_IMAGE = /(!\[[^\]\n]*\]\()(data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2})(?=\s*(?:"[^"]*"|'[^']*')?\))/gi;
  const ASSET_IMAGE = /(!\[[^\]\n]*\]\()asset:([0-9a-f-]{36})(?=\s*(?:"[^"]*"|'[^']*')?\))/gi;
  async function storeImageAsset(data) {
    if (!/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(data)) throw new Error("Invalid image");
    for (const [existingId, existingData] of imageAssets) if (existingData === data) return existingId;
    const id = crypto.randomUUID();
    if (database) await dbRequest("put", { id, data }, "assets");
    else {
      const saved = JSON.parse(localStorage.getItem(ASSETS_KEY) || "{}");
      saved[id] = data;
      localStorage.setItem(ASSETS_KEY, JSON.stringify(saved));
    }
    imageAssets.set(id, data);
    return id;
  }
  async function compactImages(text) {
    const matches = [...text.matchAll(INLINE_IMAGE)];
    if (!matches.length) return text;
    let output = "", cursor = 0;
    for (const match of matches) {
      output += text.slice(cursor, match.index) + match[1];
      try { output += `asset:${await storeImageAsset(match[2])}`; }
      catch (error) {
        console.warn("Image storage failed; keeping original image:", error);
        output += match[2];
        toast("Not enough storage for this image. Original kept; download a .md backup.");
      }
      cursor = match.index + match[0].length;
    }
    return output + text.slice(cursor);
  }
  function portableMarkdown(text) {
    return portablePathImages(text).replace(ASSET_IMAGE, (match, prefix, id) => {
      const data = imageAssets.get(id);
      if (!data) throw new Error(`Missing image asset: ${id}`);
      return prefix + data;
    });
  }
  function compactCurrentEditor() {
    const original = editor.value, documentId = activeId;
    if (!INLINE_IMAGE.test(original)) { INLINE_IMAGE.lastIndex = 0; return; }
    INLINE_IMAGE.lastIndex = 0;
    compactImages(original).then(compact => {
      if (compact === original || editor.value !== original || activeId !== documentId) return;
      const cursor = editor.selectionStart;
      const firstImage = original.search(INLINE_IMAGE);
      INLINE_IMAGE.lastIndex = 0;
      const newCursor = cursor <= firstImage ? cursor : Math.max(firstImage, compact.length - (original.length - cursor));
      editor.value = compact;
      editor.setSelectionRange(newCursor, newCursor);
      update(true);
    }).catch(error => console.error("Cannot compact images:", error));
  }
  const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  async function insertImages(files) {
    if (!ready || !$("#libraryOverlay").hidden) return;
    const images = [...files].filter(file => IMAGE_TYPES.has(file.type));
    if (!images.length) { toast("Supported images: PNG, JPEG, GIF, WebP, and AVIF"); return; }
    if (images.length !== files.length) toast("Non-image files were skipped");
    if (images.some(file => file.size > 8 * 1024 * 1024)
        || images.reduce((total, file) => total + file.size, 0) > 16 * 1024 * 1024) {
      toast("Images must be under 8 MB each and 16 MB total"); return;
    }
    const documentId = activeId;
    const start = editor.selectionStart, end = editor.selectionEnd;
    try {
      const markdown = await Promise.all(images.map(async file => {
        const url = await readImage(file);
        const id = await storeImageAsset(url);
        const alt = (file.name.replace(/\.[^.]+$/, "") || "Image").replace(/[[\]\\\r\n]/g, " ").trim() || "Image";
        return `![${alt}](asset:${id})`;
      }));
      if (documentId !== activeId) { toast("Document changed. Please insert the image again."); return; }
      if (currentView === "preview") setView("split");
      editor.setSelectionRange(start, end);
      insertBlock(markdown.join("\n\n"));
      toast(`Inserted ${images.length} image(s). Download .md to include them.`);
    } catch (error) {
      console.error("Image import failed:", error);
      toast("Could not store the image. Check browser storage.");
    }
  }
