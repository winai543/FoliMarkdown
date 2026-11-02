"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  let pdfBusy = false;
  async function exportPdf() {
    if (pdfBusy) return;
    pdfBusy = true;
    document.querySelectorAll('[data-action="pdf"]').forEach(button => button.disabled = true);
    try {
      if (typeof html2canvas !== "function" || !window.jspdf?.jsPDF) throw new Error("PDF renderer is unavailable");
      const pageElements = [...pages.querySelectorAll(":scope > .page")];
      if (!pageElements.length) throw new Error("No pages to export");
      const pdf = new window.jspdf.jsPDF({
        orientation: layout.orientation, unit: "mm", format: layout.paperSize === "letter" ? "letter" : "a4",
        compress: true
      });
      const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
      const [pixelWidth, pixelHeight] = paperDimensions();
      const scale = Math.min(2, 2800 / Math.max(pixelWidth, pixelHeight));
      // Freeze the pages: image/font loading can trigger repagination while an export is running.
      const staging = pages.cloneNode(true);
      staging.id = "pdfStaging";
      staging.style.cssText += ";position:fixed;left:-12000px;top:0;z-index:-1;pointer-events:none";
      staging.querySelectorAll(".page").forEach(page => { page.style.zoom = "1"; page.style.boxShadow = "none"; });
      document.body.append(staging);
      try {
        const frozenPages = [...staging.querySelectorAll(":scope > .page")];
        for (let i = 0; i < frozenPages.length; i++) {
          toast(`Creating PDF page ${i + 1}/${frozenPages.length}...`);
          const canvas = await html2canvas(frozenPages[i], {
            backgroundColor: "#ffffff", scale, useCORS: true, allowTaint: false,
            imageTimeout: 8000, logging: false,
            onclone(clonedDocument) {
              clonedDocument.querySelectorAll("#pdfStaging > .page").forEach(page => {
                page.style.zoom = "1";
                page.style.boxShadow = "none";
              });
            }
          });
          if (!canvas.width || !canvas.height) throw new Error(`Page ${i + 1} is empty`);
          if (i) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, width, height, undefined, "FAST");
          canvas.width = canvas.height = 0;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally { staging.remove(); }
      download(`${cleanName()}.pdf`, new Blob([pdf.output("arraybuffer")], { type: "application/pdf" }), "application/pdf");
      toast(`Downloaded PDF (${pageElements.length} pages)`);
    } catch (error) {
      console.error("PDF export failed:", error);
      toast("PDF export failed. Use Print / PDF and choose Save as PDF instead.");
    } finally {
      pdfBusy = false;
      document.querySelectorAll('[data-action="pdf"]').forEach(button => button.disabled = false);
    }
  }
