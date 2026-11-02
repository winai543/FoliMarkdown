"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  async function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    if (isDesktop) {
      return window.__TAURI__.core.invoke("save_export", {
        filename, data: Array.from(new Uint8Array(await blob.arrayBuffer()))
      });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }
  function cleanName() { return (docName.value.trim() || "Document").replace(/[\\/:*?"<>|]/g, "-"); }
  function markdownFile() {
    const metadata = encodeURIComponent(JSON.stringify(layout));
    return `<!-- page-settings:layout:${metadata} -->\n\n${portableMarkdown(editor.value)}`;
  }
  function loadMarkdown(text) {
    layout = { ...DEFAULT_LAYOUT };
    const match = text.match(/^<!-- (?:page-settings|mdword):layout:([^\s]+) -->\r?\n(?:\r?\n)?/);
    if (match) {
      try { layout = { ...layout, ...JSON.parse(decodeURIComponent(match[1])) }; }
      catch { /* Keep the document even if its layout metadata is damaged. */ }
      text = text.slice(match[0].length);
    }
    syncLayoutControls();
    return text;
  }
  function syncLayoutControls() {
    $("#paperSize").value = layout.paperSize;
    $("#orientation").value = layout.orientation;
    $("#margin").value = layout.margin;
    $("#headerText").value = layout.header;
    $("#footerText").value = layout.footer;
    $("#pageNumbers").checked = layout.pageNumbers;
    $("#firstPageBlank").checked = layout.firstPageBlank;
    applyDocumentFont();
  }
  function exportHtml() {
    const printedPages = pages.cloneNode(true);
    // Make unlinked app-relative URLs absolute so downloads resolve from any folder.
    printedPages.querySelectorAll("img").forEach(image => image.setAttribute("src", image.src));
    printedPages.querySelectorAll(".diagram-edit, .table-editor-caption").forEach(button => button.remove());
    let css;
    try {
      // Available when served over HTTP; not readable from file:// in some browsers.
      css = [...$("#appStyle").sheet.cssRules].map(rule => rule.cssText).join("\n");
    } catch {
      // Classic scripts can load on file:// even when CSSOM and fetch are blocked.
      // Keep all selectors, pseudo-elements and print rules, not just computed styles.
      css = EXPORT_CSS;
    }
    printedPages.querySelectorAll(".page").forEach(page => {
      page.style.removeProperty("zoom");
      page.style.setProperty("zoom", "1");
    });
    css += $("#pagePrintStyle").textContent;
    const fontLink = fontStylesheetUrl(layout.font);
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(docName.value)}</title>${fontLink ? `<link rel="stylesheet" href="${escapeHtml(fontLink)}">` : ""}<style>${css}\n.pages{--page-width:${paperDimensions()[0]}px;--page-height:${paperDimensions()[1]}px;--page-margin:${({ normal: 76, narrow: 48,  wide: 100 })[layout.margin]}px}@media screen{body{height:auto;min-width:0;overflow:auto;background:#e9edf3}.pages{padding:24px 0}}</style></head><body>${printedPages.outerHTML}</body></html>`;
  }
  async function importFile(file, folder = null) {
    if (!ready) return false;
    const previousLayout = { ...layout };
    try {
      if (!await flushDocument()) return false;
      const text = await file.text();
      const importedText = loadMarkdown(text);
      const images = folder ? await collectFolderImagePaths(importedText, folder.files, folder.base) : { mappings: {}, missing: [] };
      const record = newRecord(file.name.replace(/\.(md|markdown|txt)$/i, ""), await compactImages(importedText), layout, images.mappings);
      await storeRecord(record);
      displayDocument(record);
      setView("split");
      toast(images.missing.length ? `Imported ${file.name}; ${images.missing.length} image path(s) not found or unsupported`
        : `Imported ${file.name} as a new document${!folder && localImageReferences(importedText).length ? ". Use File → Link image folder if local images are missing." : ""}`);
      return true;
    } catch (error) {
      layout = previousLayout;
      syncLayoutControls();
      console.error("Import failed:", error);
      toast("Could not import the file");
      return false;
    }
  }
