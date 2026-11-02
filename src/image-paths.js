"use strict";
// Images selected from a folder are stored as assets while the Markdown keeps its paths.
let documentImagePaths = {};
let folderPickerMode = "open";

function localImagePath(href) {
  const value = String(href).trim();
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || /^[\\/]{2}/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(value.split(/[?#]/)[0]); } catch { return null; }
  if (!decoded || /^[\\/]{2}/.test(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  return decoded.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}
function folderImagePath(base, relative) {
  if (!relative || relative.startsWith("/")) return null;
  const parts = [];
  for (const part of `${base}/${relative}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}
function mappedImageData(href) {
  const key = localImagePath(href);
  const id = key && Object.hasOwn(documentImagePaths, key) ? documentImagePaths[key] : null;
  return id ? imageAssets.get(id) : null;
}
function localImageReferences(text) {
  const paths = new Set();
  markdownParser.walkTokens(markdownParser.lexer(text), token => {
    if (token.type === "image" && localImagePath(token.href)) paths.add(localImagePath(token.href));
  });
  return [...paths];
}
function portablePathImages(text) {
  // Work on parsed image tokens so fenced code and inline code remain examples.
  let result = "", sourcePosition = 0;
  for (const block of markdownParser.lexer(text)) {
    let raw = block.raw, position = 0;
    const blockStart = text.indexOf(raw, sourcePosition);
    if (blockStart < 0) continue;
    const changes = [];
    if (!["code", "html"].includes(block.type)) markdownParser.walkTokens([block], token => {
      if (!["image", "codespan", "code", "html"].includes(token.type)) return;
      const index = raw.indexOf(token.raw, position);
      if (index < 0) {
        // Blockquote/list prefixes can interrupt a nested code token's raw text.
        // Advance past its literal lines before looking for subsequent images.
        if (token.type === "code" || token.type === "codespan") {
          for (const line of token.text.split("\n").filter(Boolean)) {
            const literal = raw.indexOf(line, position);
            if (literal >= 0) position = literal + line.length;
          }
        }
        return;
      }
      position = index + token.raw.length;
      if (token.type !== "image") return;
      const data = mappedImageData(token.href);
      if (!data) return;
      const alt = token.text.replace(/[\\[\]]/g, character => "\\" + character);
      const title = token.title ? ` "${token.title.replace(/[\\"]/g, character => "\\" + character)}"` : "";
      changes.push({ index, end: position, value: `![${alt}](${data}${title})` });
    });
    for (const change of changes.reverse()) raw = raw.slice(0, change.index) + change.value + raw.slice(change.end);
    result += text.slice(sourcePosition, blockStart) + raw;
    sourcePosition = blockStart + block.raw.length;
  }
  return result + text.slice(sourcePosition);
}
function selectedFolderFiles(files) {
  return new Map([...files].map(file => [file.webkitRelativePath.split("/").slice(1).join("/") || file.name, file]));
}
async function collectFolderImagePaths(text, files, base = "") {
  const mappings = {};
  const missing = [];
  let total = 0;
  const mimeTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif" };
  for (const relative of localImageReferences(text)) {
    const path = folderImagePath(base, relative);
    const file = path && files.get(path);
    const mime = file && (IMAGE_TYPES.has(file.type) ? file.type : mimeTypes[file.name.split('.').at(-1).toLowerCase()]);
    if (!file || !mime) { missing.push(relative); continue; }
    total += file.size;
    if (file.size > 8 * 1024 * 1024 || total > 16 * 1024 * 1024) throw new Error("Referenced images must be under 8 MB each and 16 MB total.");
    mappings[relative] = await storeImageAsset(await readImage(new Blob([file], { type: mime })));
  }
  return { mappings, missing };
}
function chooseFolderMarkdown(paths) {
  if (paths.length === 1) return Promise.resolve(paths[0]);
  const dialog = document.createElement("dialog");
  dialog.className = "desktop-prompt";
  dialog.setAttribute("aria-label", "Choose a Markdown file");
  dialog.innerHTML = '<form method="dialog"><h2>Open Markdown from folder</h2><label for="folderMarkdownChoice">Document</label><select id="folderMarkdownChoice"></select><div><button value="cancel">Cancel</button><button value="save">Open</button></div></form>';
  const select = dialog.querySelector("select");
  for (const path of paths) select.add(new Option(path, path));
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.addEventListener("close", () => { const selected = dialog.returnValue === "save" ? select.value : null; dialog.remove(); resolve(selected); }, { once: true });
    dialog.showModal();
    select.focus();
  });
}
async function handleImageFolder(files, mode) {
  if (!ready) return;
  const documentId = activeId, original = editor.value;
  try {
    const selected = selectedFolderFiles(files);
    if (mode === "open") {
      const markdown = [...selected.keys()].filter(path => /\.(md|markdown|txt)$/i.test(path)).sort();
      if (!markdown.length) { toast("No Markdown files found. Use Link image folder for an open document."); return; }
      const choice = await chooseFolderMarkdown(markdown);
      if (!choice) return;
      if (activeId !== documentId || editor.value !== original) { toast("Document changed. Please select the folder again."); return; }
      await importFile(selected.get(choice), { files: selected, base: choice.includes("/") ? choice.slice(0, choice.lastIndexOf("/")) : "" });
    } else {
      const { mappings, missing } = await collectFolderImagePaths(original, selected);
      if (activeId !== documentId || editor.value !== original) { toast("Document changed. Please link the folder again."); return; }
      documentImagePaths = { ...documentImagePaths, ...mappings };
      render();
      scheduleSave();
      toast(`Linked ${Object.keys(mappings).length} image(s)${missing.length ? `; ${missing.length} path(s) not found or unsupported` : ""}`);
    }
  } catch (error) {
    console.error("Could not load image folder:", error);
    toast(error.message || "Could not load the image folder");
  }
}
