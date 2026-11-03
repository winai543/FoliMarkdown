"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function docxXml(value) {
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD")
      .replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
  }
  function docxZip(files) {
    // ZIP store mode keeps DOCX generation offline and needs no ZIP dependency.
    const encoder = new TextEncoder();
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let crc = n;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
      table[n] = crc >>> 0;
    }
    const local = [], directory = [];
    let offset = 0, count = 0, directorySize = 0;
    for (const [path, contents] of files) {
      const name = encoder.encode(path);
      const data = typeof contents === "string" ? encoder.encode(contents) : contents;
      if (data.length > 0xFFFFFFFF || offset > 0xFFFFFFFF) throw new Error("DOCX file is too large");
      let crc = 0xFFFFFFFF;
      for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xFFFFFFFF) >>> 0;
      const header = new Uint8Array(30);
      const h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, 33, true); // 1980-01-01
      h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true);
      local.push(header, name, data);
      const record = new Uint8Array(46);
      const r = new DataView(record.buffer);
      r.setUint32(0, 0x02014b50, true);
      r.setUint16(4, 20, true);
      r.setUint16(6, 20, true);
      r.setUint16(12, 0, true);
      r.setUint16(14, 33, true);
      r.setUint32(16, crc, true);
      r.setUint32(20, data.length, true);
      r.setUint32(24, data.length, true);
      r.setUint16(28, name.length, true);
      r.setUint32(42, offset, true);
      directory.push(record, name);
      offset += header.length + name.length + data.length;
      directorySize += record.length + name.length;
      count++;
    }
    if (count > 65535) throw new Error("DOCX has too many parts");
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, count, true);
    e.setUint16(10, count, true);
    e.setUint32(12, directorySize, true);
    e.setUint32(16, offset, true);
    return new Blob([...local, ...directory, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  async function exportDocx() {
    const files = new Map();
    const relationships = [];
    const numbering = [];
    let nextRelation = 1, nextImage = 1, nextNumber = 1, nextDrawing = 1, warnings = 0, diagramIndex = 0;
    const rel = (type, target, external = false) => {
      const id = `rId${nextRelation++}`;
      relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${docxXml(target)}"${external ? ' TargetMode="External"' : ""}/>`);
      return id;
    };
    rel("styles", "styles.xml");
    rel("numbering", "numbering.xml");
    rel("settings", "settings.xml");
    const headerId = rel("header", "header1.xml");
    const footerId = rel("footer", "footer1.xml");
    const firstHeaderId = layout.firstPageBlank ? rel("header", "header2.xml") : null;
    const firstFooterId = layout.firstPageBlank ? rel("footer", "footer2.xml") : null;
    const font = GOOGLE_FONTS.has(layout.font) ? layout.font : "Noto Sans Thai";
    const fontXml = docxXml(font);
    const textColor = /^#[0-9a-f]{6}$/i.test(layout.documentColor || "") ? layout.documentColor.slice(1).toUpperCase() : "263144";
    const accentColor = /^#[0-9a-f]{6}$/i.test(layout.accentColor || "") ? layout.accentColor.slice(1).toUpperCase() : "1B3557";
    const tintColor = (hex, whiteRatio) => {
      const channels = hex.match(/.{2}/g).map(channel => parseInt(channel, 16));
      return channels.map(channel => Math.round(channel * (1 - whiteRatio) + 255 * whiteRatio).toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    const accentSoft = accentColor === "1B3557" ? "EAF1FA" : tintColor(accentColor, 0.91);
    const accentBorder = accentColor === "1B3557" ? "DAE1E9" : tintColor(accentColor, 0.78);
    const accentWash = accentColor === "1B3557" ? "F7F9FC" : tintColor(accentColor, 0.97);
    const pageColor = /^#[0-9a-f]{6}$/i.test(layout.backgroundColor || "") ? layout.backgroundColor : "#ffffff";
    const customTextColor = textColor !== "263144";
    const bodyColor = readableDocumentColor(`#${textColor}`, pageColor).slice(1).toUpperCase();
    const headingColor = customTextColor ? bodyColor : readableDocumentColor("#1b3557", pageColor).slice(1).toUpperCase();
    const linkColor = customTextColor ? bodyColor : readableDocumentColor("#155bb5", pageColor).slice(1).toUpperCase();
    const tableTextColor = readableDocumentColor(`#${textColor}`, "#ffffff").slice(1).toUpperCase();
    const tableHeadingColor = readableDocumentColor(`#${customTextColor ? textColor : "234369"}`, `#${accentSoft}`).slice(1).toUpperCase();
    const textRun = (value, options = {}) => {
      const settings = [
        options.bold ? "<w:b/>" : "", options.italic ? "<w:i/>" : "",
        options.strike ? "<w:strike/>" : "", options.code ? '<w:rFonts w:ascii="Liberation Mono" w:hAnsi="Liberation Mono"/>' : "",
        options.color || options.link ? `<w:color w:val="${options.color || linkColor}"/>` : "",
        options.link ? '<w:u w:val="single"/>' : ""
      ].join("");
      const text = String(value).replace(/\r\n?/g, "\n").split("\n")
        .map((part, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${docxXml(part)}</w:t>`).join("");
      return `<w:r>${settings ? `<w:rPr>${settings}</w:rPr>` : ""}${text}</w:r>`;
    };
    const field = instruction => `<w:fldSimple w:instr="${instruction}"><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
    const pageVariables = value => String(value).split(/(\{title\}|\{page\}|\{pages\})/gi)
      .map(part => part.toLowerCase() === "{title}" ? textRun(docName.value.trim() || "Untitled")
        : part.toLowerCase() === "{page}" ? field("PAGE")
        : part.toLowerCase() === "{pages}" ? field("NUMPAGES") : textRun(part)).join("");
    const base = layout.paperSize === "letter" ? [12240, 15840] : [11906, 16838];
    const [pageWidth, pageHeight] = layout.orientation === "landscape" ? [base[1], base[0]] : base;
    const side = ({ normal: 1140, narrow: 720, wide: 1500 })[layout.margin] || 1140;
    const usableWidth = pageWidth - 2 * side;
    let activeAlignment = null;
    const paragraph = (runs = "", settings = {}) => {
      const props = [
        settings.style ? `<w:pStyle w:val="${settings.style}"/>` : "",
        settings.numId ? `<w:numPr><w:ilvl w:val="${Math.min(settings.depth || 0, 8)}"/><w:numId w:val="${settings.numId}"/></w:numPr>` : "",
        settings.indent ? `<w:ind w:left="${settings.indent}"/>` : "",
        (settings.align || activeAlignment || layout.documentKind === "certificate") ? `<w:jc w:val="${settings.align || activeAlignment || "center"}"/>` : "",
        settings.quote ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="7" w:color="${accentColor}"/></w:pBdr>` : "",
        settings.rule ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="${accentBorder}"/></w:pBdr>` : ""
      ].join("");
      return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
    };
    const plainText = html => {
      const box = document.createElement("textarea");
      box.innerHTML = html;
      return box.value;
    };
    let contentWidth = usableWidth;
    let imageHeightLimit = pageHeight - 2700;
    let absoluteSerial = 0;
    const imageRun = async (href, alt) => {
      try {
        href = plainText(safeUrl(href, true));
        if (/^asset:[0-9a-f-]{36}$/i.test(href)) {
          href = imageAssets.get(href.slice(6));
          if (!href) throw new Error("Missing image asset");
        }
        let blob;
        if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(href)) {
          const match = /^data:(image\/[^;]+);base64,([\s\S]+)$/i.exec(href);
          if (!match) throw new Error("Invalid data image");
          const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
          blob = new Blob([bytes], { type: match[1] });
        } else if (/^https?:\/\//i.test(href)) {
          const response = await fetch(href, { signal: AbortSignal.timeout(7000) });
          if (!response.ok) throw new Error("Image HTTP " + response.status);
          blob = await response.blob();
        } else throw new Error("Unsupported image source");
        if (blob.size > 20 * 1024 * 1024) throw new Error("Image exceeds 20 MB");
        let bitmap = await createImageBitmap(blob);
        const width = bitmap.width, height = bitmap.height;
        if (!width || !height) throw new Error("Image has no dimensions");
        let extension = blob.type === "image/jpeg" ? "jpeg" : blob.type === "image/png" ? "png" : "";
        if (!extension) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(1600, width);
          canvas.height = Math.max(1, Math.round(height * canvas.width / width));
          canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
          if (!blob) throw new Error("Cannot convert image");
          extension = "png";
        }
        bitmap.close();
        const path = `word/media/image${nextImage++}.${extension}`;
        files.set(path, new Uint8Array(await blob.arrayBuffer()));
        const rid = rel("image", path.slice(5));
        const scale = Math.min(1, (contentWidth * 635) / (width * 9525), (imageHeightLimit * 635) / (height * 9525));
        const cx = Math.round(width * 9525 * scale), cy = Math.round(height * 9525 * scale);
        const id = nextDrawing++;
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Image ${id}" descr="${docxXml(alt || "Image")}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Image ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      } catch (error) {
        console.warn("Cannot embed image in DOCX:", error);
        warnings++;
        return textRun(`[Image: ${alt || "Unavailable"}]`);
      }
    };
    const svgImage = async (svg, alt) => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        image.src = url;
        await Promise.race([
          image.decode(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Diagram render timed out")), 5000))
        ]);
        const canvas = document.createElement("canvas");
        const scale = Math.min(2, 1400 / (image.naturalWidth || 800));
        canvas.width = Math.max(1, Math.round((image.naturalWidth || 800) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || 500) * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = canvas.toDataURL("image/png");
        return await imageRun(png, alt);
      } finally { URL.revokeObjectURL(url); }
    };
    const inlineRuns = async (tokens, options = {}) => {
      let result = "";
      for (const token of tokens || []) {
        if (token.type === "text" || token.type === "escape") {
          result += token.tokens ? await inlineRuns(token.tokens, options)
            : textRun(plainText(token.text).replace(/\n/g, " "), options);
        } else if (token.type === "strong" || token.type === "em" || token.type === "del") {
          result += await inlineRuns(token.tokens, { ...options, [token.type === "strong" ? "bold" : token.type === "em" ? "italic" : "strike"]: true });
        } else if (token.type === "codespan") result += textRun(token.text, { ...options, code: true });
        else if (token.type === "br") result += "<w:r><w:br/></w:r>";
        else if (token.type === "link") {
          if (/^(https?:\/\/|mailto:)/i.test(token.href)) {
            const id = rel("hyperlink", token.href, true);
            result += `<w:hyperlink r:id="${id}">${await inlineRuns(token.tokens, { ...options, link: true })}</w:hyperlink>`;
          } else result += await inlineRuns(token.tokens, options);
        } else if (token.type === "image") result += await imageRun(token.href, token.text);
        else if (token.type === "html") result += textRun(token.text, options);
        else if (token.tokens) result += await inlineRuns(token.tokens, options);
        else if (token.text) result += textRun(token.text, options);
      }
      return result;
    };
    const blocks = async (tokens, depth = 0, quoted = false, availableWidth = contentWidth) => {
      const previousWidth = contentWidth;
      contentWidth = availableWidth;
      try {
        let output = "";
        for (const token of tokens || []) {
          if (token.type === "space") continue;
          if (token.type === "alignBlock") {
            const previousAlignment = activeAlignment;
            activeAlignment = token.align;
            try { output += await blocks(token.tokens, depth, quoted, availableWidth); }
            finally { activeAlignment = previousAlignment; }
            continue;
          }
          if (token.type === "absoluteBlock") {
            // Word text boxes group rich content in a floating, auto-sized frame.
            const previousLimit = imageHeightLimit;
            imageHeightLimit = 1800;
            let content;
            const imageOnly = token.tokens.filter(item => item.type !== 'space').length === 1
              && token.tokens.find(item => item.type !== 'space')?.tokens?.filter(item => item.type !== 'text' || item.text.trim()).every(item => item.type === 'image');
            const width = Math.min(contentWidth, imageOnly ? 1440 : 3600);
            try { content = await blocks(token.tokens, depth, quoted, width); }
            finally { imageHeightLimit = previousLimit; }
            const position = token.position;
            const horizontal = position.right !== undefined ? 'mso-position-horizontal:right;' : `left:${(position.left || 0) * .75}pt;`;
            const vertical = position.bottom !== undefined ? 'mso-position-vertical:bottom;' : `top:${(position.top || 0) * .75}pt;`;
            output += `<w:p><w:r><w:pict><v:rect id="absolute${++absoluteSerial}" style="position:absolute;width:${width / 20}pt;height:1pt;${horizontal}${vertical}mso-position-horizontal-relative:text;mso-position-vertical-relative:text" stroked="f" filled="f"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:t"><w:txbxContent>${content}${paragraph()}</w:txbxContent></v:textbox><w10:wrap type="none"/></v:rect></w:pict></w:r></w:p>`;
          }
          else if (token.type === "columnRow") {
            const totalRatio = token.columns.reduce((sum, column) => sum + column.ratio, 0);
            let allocated = 0;
            const widths = token.columns.map((column, index) => {
              const width = index === token.columns.length - 1 ? contentWidth - allocated : Math.floor(contentWidth * column.ratio / totalRatio);
              allocated += width;
              return width;
            });
            const cells = [];
            for (const [index, column] of token.columns.entries()) {
              const width = widths[index];
              const content = await blocks(column.tokens, depth, quoted, Math.max(1, width - 240));
              cells.push(`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${content}${paragraph()}</w:tc>`);
            }
            output += `<w:tbl><w:tblPr><w:tblW w:w="${contentWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(side => `<w:${side} w:val="nil"/>`).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr>${cells.join('')}</w:tr></w:tbl>${paragraph()}`;
          }
          else if (token.type === "heading") output += paragraph(await inlineRuns(token.tokens), { style: `Heading${token.depth}`, indent: quoted ? 360 : 0, quote: quoted });
          else if (token.type === "paragraph" || token.type === "text") output += paragraph(await inlineRuns(token.tokens || [{ type: "text", text: token.text }]), { indent: depth ? 720 + depth * 360 : quoted ? 360 : 0, quote: quoted });
          else if (token.type === "blockquote") output += await blocks(token.tokens, depth, true);
          else if (token.type === "pagebreak") output += paragraph('<w:r><w:br w:type="page"/></w:r>');
          else if (token.type === "hr") output += paragraph("", { rule: true });
          else if (token.type === "html") output += paragraph(textRun(token.text));
          else if (token.type === "code") {
            const language = (token.lang || "").split(/\s+/)[0].toLowerCase();
            if (["mermaid", "chart", "diagram"].includes(language)) {
              const key = `${diagramIndex++}\u0000${token.text}`;
              const diagram = diagramCache.get(key);
              if (diagram?.svg) {
                try { output += paragraph(await svgImage(diagram.svg, "Diagram")); continue; }
                catch (error) { console.warn("Cannot rasterize diagram:", error); }
              }
              warnings++;
            }
            for (const line of (token.text || "").split("\n")) output += paragraph(textRun(line, { code: true }), { style: "Code", indent: depth ? 720 + depth * 360 : 0 });
          } else if (token.type === "list") {
            const numId = nextNumber++;
            numbering.push({ id: numId, ordered: token.ordered, level: Math.min(depth, 8), start: Number(token.start) || 1 });
            for (const item of token.items) {
              let first = true;
              const children = item.tokens.filter(child => child.type !== "checkbox");
              if (!children.length) children.push({ type: "text", text: item.text });
              for (const child of children) {
                if (child.type === "list") { output += await blocks([child], depth + 1, quoted); continue; }
                const prefix = item.task && first ? textRun(item.checked ? "☑ " : "☐ ") : "";
                const content = await inlineRuns(child.tokens || [{ type: "text", text: child.text || "" }]);
                output += paragraph(prefix + content, {
                  numId: first && !item.task ? numId : 0,
                  depth, indent: item.task || !first ? 720 + depth * 360 : 0, quote: quoted
                });
                first = false;
              }
              if (first) output += paragraph(item.task ? textRun(item.checked ? "☑ " : "☐ ") : "", { numId: item.task ? 0 : numId, depth, indent: item.task ? 720 + depth * 360 : 0 });
            }
          } else if (token.type === "table") {
            const count = token.header.length;
            const profiles = tableColumnProfiles(token);
            const totalWeight = profiles.reduce((sum, column) => sum + column.weight, 0);
            const widths = profiles.map(column => Math.floor(contentWidth * column.weight / totalWeight));
            widths[count - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0);
            const row = async (cells, header, rowIndex = 0) => `<w:tr>${(await Promise.all(cells.map(async (cell, i) => {
              const align = token.align[i] === "center" ? "center" : profiles[i].numeric ? "right" : token.align[i] === "right" ? "right" : "left";
              const fill = header ? accentSoft : rowIndex % 2 ? accentWash : "FFFFFF";
              return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/><w:shd w:fill="${fill}"/></w:tcPr>${paragraph(await inlineRuns(cell.tokens, { bold: header, color: header ? tableHeadingColor : tableTextColor }), { align })}</w:tc>`;
            }))).join("")}</w:tr>`;
            const rows = [await row(token.header, true)];
            for (let index = 0; index < token.rows.length; index++) rows.push(await row(token.rows[index], false, index));
            output += `<w:tbl><w:tblPr><w:tblW w:w="${contentWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(side => `<w:${side} w:val="single" w:sz="4" w:color="${accentBorder}"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
          }
        }
        return output;
      } finally { contentWidth = previousWidth; }
    };
    const tokens = markdownParser.lexer(editor.value.replace(/\r\n?/g, "\n"));
    const body = await blocks(tokens) || paragraph();
    let pageBackground = "";
    const backgroundColor = pageColor.slice(1).toUpperCase();
    let backgroundFill = "";
    const backgroundImage = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(layout.backgroundImage || "");
    if (backgroundImage) {
      try {
        let blob = new Blob([Uint8Array.from(atob(backgroundImage[2]), char => char.charCodeAt(0))], { type: backgroundImage[1] });
        let extension = backgroundImage[1] === "image/jpeg" ? "jpeg" : "png";
        if (backgroundImage[1] === "image/webp") {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
          blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
          if (!blob) throw new Error("Cannot convert WebP background");
        }
        const path = `word/media/background.${extension}`;
        files.set(path, new Uint8Array(await blob.arrayBuffer()));
        const rid = rel("image", path.slice(5));
        const opacityValue = Number(layout.backgroundOpacity ?? 25);
        const opacity = Number.isFinite(opacityValue) ? Math.max(0, Math.min(100, opacityValue)) : 25;
        const aspect = layout.backgroundSize === "contain" ? "atMost" : layout.backgroundSize === "stretch" ? "ignore" : "atLeast";
        backgroundFill = `<v:background id="_x0000_s1025"><v:fill r:id="${rid}" type="frame" aspect="${aspect}" opacity="${opacity}%"/></v:background>`;
      } catch (error) { console.warn("Cannot embed DOCX page background:", error); warnings++; }
    }
    if (backgroundColor !== "FFFFFF" || backgroundFill) pageBackground = `<w:background w:color="${backgroundColor}">${backgroundFill}</w:background>`;
    const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const documentNs = `xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
    const sect = `<w:sectPr><w:headerReference w:type="default" r:id="${headerId}"/><w:footerReference w:type="default" r:id="${footerId}"/>${layout.firstPageBlank ? `<w:headerReference w:type="first" r:id="${firstHeaderId}"/><w:footerReference w:type="first" r:id="${firstFooterId}"/>` : ""}<w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"${layout.orientation === "landscape" ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="1540" w:right="${side}" w:bottom="1350" w:left="${side}" w:header="600" w:footer="600"/><w:cols w:space="720"/>${layout.firstPageBlank ? "<w:titlePg/>" : ""}</w:sectPr>`;
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    files.set("word/document.xml", `${xml}<w:document ${documentNs}>${pageBackground}<w:body>${body}${sect}</w:body></w:document>`);
    const rns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
    files.set("word/_rels/document.xml.rels", `${xml}<Relationships ${rns}>${relationships.join("")}</Relationships>`);
    files.set("word/header1.xml", `${xml}<w:hdr xmlns:w="${w}">${paragraph(pageVariables(layout.header))}</w:hdr>`);
    const footer = pageVariables(layout.footer) + (layout.pageNumbers ? `<w:r><w:tab/></w:r>${field("PAGE")}${textRun(" / ")}${field("NUMPAGES")}` : "");
    files.set("word/footer1.xml", `${xml}<w:ftr xmlns:w="${w}"><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${usableWidth}"/></w:tabs></w:pPr>${footer}</w:p></w:ftr>`);
    if (layout.firstPageBlank) {
      files.set("word/header2.xml", `${xml}<w:hdr xmlns:w="${w}"><w:p/></w:hdr>`);
      files.set("word/footer2.xml", `${xml}<w:ftr xmlns:w="${w}"><w:p/></w:ftr>`);
    }
    const headingStyles = [46, 34, 28, 24, 22, 22].map((size, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="${headingColor}"/><w:sz w:val="${size}"/></w:rPr></w:style>`).join("");
    files.set("word/styles.xml", `${xml}<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${fontXml}" w:hAnsi="${fontXml}" w:eastAsia="${fontXml}"/><w:color w:val="${bodyColor}"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="140" w:line="330" w:lineRule="auto"/></w:pPr></w:style>${headingStyles}<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="260" w:lineRule="auto"/><w:shd w:fill="F1F3F7"/></w:pPr><w:rPr><w:rFonts w:ascii="Liberation Mono" w:hAnsi="Liberation Mono"/><w:sz w:val="19"/></w:rPr></w:style></w:styles>`);
    const levels = ordered => Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${ordered ? "decimal" : "bullet"}"/><w:lvlText w:val="${ordered ? `%${level + 1}.` : ["•", "○", "▪"][level % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("");
    files.set("word/numbering.xml", `${xml}<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${levels(false)}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${levels(true)}</w:abstractNum>${numbering.map(item => `<w:num w:numId="${item.id}"><w:abstractNumId w:val="${item.ordered ? 1 : 0}"/>${item.ordered && item.start !== 1 ? `<w:lvlOverride w:ilvl="${item.level}"><w:startOverride w:val="${item.start}"/></w:lvlOverride>` : ""}</w:num>`).join("")}</w:numbering>`);
    files.set("word/settings.xml", `${xml}<w:settings xmlns:w="${w}"><w:updateFields w:val="true"/>${pageBackground ? '<w:displayBackgroundShape w:val="true"/>' : ""}</w:settings>`);
    files.set("_rels/.rels", `${xml}<Relationships ${rns}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const date = new Date().toISOString();
    files.set("docProps/core.xml", `${xml}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${docxXml(docName.value)}</dc:title><dc:creator>FoliMarkdown</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created></cp:coreProperties>`);
    files.set("docProps/app.xml", `${xml}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FoliMarkdown</Application></Properties>`);
    const types = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
    if (layout.firstPageBlank) types.push('<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>', '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
    files.set("[Content_Types].xml", `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types.join("")}</Types>`);
    return { blob: docxZip(files), warnings };
  }
