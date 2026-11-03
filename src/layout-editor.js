"use strict";
let layoutEditorSession = null;

function editableLayoutBlocks() {
  const blocks = [];
  visitMarkdownSource(markdownParser.lexer(editor.value), editor.value, (token, start) => {
    if (["columnRow", "absoluteBlock"].includes(token.type)) {
      blocks.push({ type: token.type, token, start, end: start + token.raw.length });
    }
  });
  return blocks;
}

function columnSettingsFrom(block) {
  return block.token.columns.map(column => ({ ratio: column.ratio, text: column.raw.trim() }));
}

function addLayoutColumn(value = { ratio: 1, text: "" }) {
  const card = document.createElement("section");
  card.className = "layout-column-card";
  const head = document.createElement("div");
  head.className = "layout-column-head";
  const title = document.createElement("strong");
  const ratioLabel = document.createElement("label");
  ratioLabel.textContent = "Width ratio";
  const ratio = document.createElement("input");
  ratio.type = "number"; ratio.min = "0.1"; ratio.max = "1000"; ratio.step = "0.1";
  ratio.value = value.ratio; ratio.className = "layout-column-ratio";
  ratioLabel.append(ratio);
  const controls = document.createElement("div");
  controls.className = "layout-column-controls";
  const move = (symbol, label, delta) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "library-button"; button.textContent = symbol; button.title = label; button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      const sibling = delta < 0 ? card.previousElementSibling : card.nextElementSibling;
      if (!sibling) return;
      if (delta < 0) sibling.before(card); else sibling.after(card);
      refreshLayoutColumnLabels();
    });
    return button;
  };
  controls.append(move("↑", "Move column left", -1), move("↓", "Move column right", 1));
  const remove = document.createElement("button");
  remove.type = "button"; remove.className = "library-button danger"; remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    if ($("#layoutColumns").children.length <= 2) { $("#layoutError").textContent = "A row needs at least two columns."; return; }
    card.remove(); refreshLayoutColumnLabels(); $("#layoutAddColumn").disabled = false;
  });
  controls.append(remove);
  const textarea = document.createElement("textarea");
  textarea.className = "layout-column-text"; textarea.value = value.text;
  textarea.setAttribute("aria-label", "Markdown content for this column");
  textarea.placeholder = "Write Markdown for this column…";
  title.textContent = "Column";
  head.append(title, ratioLabel, controls); card.append(head, textarea); $("#layoutColumns").append(card);
  refreshLayoutColumnLabels();
  return card;
}

function refreshLayoutColumnLabels() {
  [...$("#layoutColumns").children].forEach((card, index) => {
    card.querySelector("strong").textContent = `Column ${index + 1}`;
    card.querySelector(".layout-column-controls button[aria-label='Move column left']").disabled = index === 0;
    card.querySelector(".layout-column-controls button[aria-label='Move column right']").disabled = index === $("#layoutColumns").children.length - 1;
  });
}

function layoutColumnSource() {
  const cards = [...$("#layoutColumns").children];
  if (cards.length < 2 || cards.length > 6) throw new Error("Choose between 2 and 6 columns.");
  const columns = cards.map((card, index) => {
    const ratio = Number(card.querySelector(".layout-column-ratio").value);
    if (!Number.isFinite(ratio) || ratio < 0.1 || ratio > 1000) throw new Error(`Enter a width ratio from 0.1 to 1000 for column ${index + 1}.`);
    return `::: col [${ratio}]\n${card.querySelector(".layout-column-text").value.trim()}\n:::`;
  });
  return `::: row\n${columns.join("\n\n")}\n:::`;
}

function openLayoutEditor(type, focusColumn = null) {
  if (!ready || !$("#libraryOverlay").hidden || document.querySelector("dialog[open]")) return;
  const cursor = editor.selectionStart;
  const blocks = editableLayoutBlocks();
  const block = blocks.filter(item => item.type === (type === "columns" ? "columnRow" : "absoluteBlock") && cursor >= item.start && cursor < item.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] || null;
  const session = layoutEditorSession = { type, block, text: editor.value, documentId: activeId,
    start: editor.selectionStart, end: editor.selectionEnd, focus: document.activeElement };
  $("#layoutError").textContent = "";
  $("#layoutColumnsPanel").hidden = type !== "columns";
  $("#layoutAbsolutePanel").hidden = type !== "absolute";
  $("#layoutDialogTitle").textContent = type === "columns" ? (block ? "Edit columns" : "Create columns") : (block ? "Edit floating content" : "Add floating content");
  $("#layoutDialogDescription").textContent = type === "columns"
    ? "Arrange Markdown in 2–6 columns and set each column’s relative width. Place the cursor inside an existing row to edit it."
    : "Place Markdown anywhere inside the current page area using a corner or pixel offsets. Place the cursor inside an existing floating block to edit it.";
  $("#layoutSave").textContent = block ? "Save changes" : "Insert into document";
  if (type === "columns") {
    $("#layoutColumns").replaceChildren();
    (block ? columnSettingsFrom(block) : [{ ratio: 1, text: "**Column 1**\n\nAdd Markdown here." }, { ratio: 1, text: "**Column 2**\n\nAdd Markdown here." }]).forEach(addLayoutColumn);
    $("#layoutAddColumn").disabled = $("#layoutColumns").children.length >= 6;
  } else {
    const source = block?.token.raw || "";
    const match = /^ {0,3}::: absolute \[([^\]]+)\]/.exec(source);
    const value = match?.[1] || "top-right";
    const anchor = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(value);
    $("#layoutPositionMode").value = anchor ? "anchor" : "coordinates";
    $("#layoutAnchor").value = anchor ? value : "top-right";
    const x = /(?:^|,)\s*x\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/.exec(value);
    const y = /(?:^|,)\s*y\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/.exec(value);
    $("#layoutX").value = x?.[1] || 0; $("#layoutY").value = y?.[1] || 0;
    $("#layoutPositionMode").dispatchEvent(new Event("change"));
    $("#layoutAbsoluteText").value = block?.token.content.trim() || "**Floating note**\n\nWrite Markdown here.";
  }
  $("#layoutDialog").showModal();
  (type === "columns" ? $("#layoutColumns").children[focusColumn ?? 0]?.querySelector("textarea") : $("#layoutAbsoluteText"))?.focus();
}

function absoluteLayoutSource() {
  const position = $("#layoutPositionMode").value === "anchor" ? $("#layoutAnchor").value
    : `x=${Number($("#layoutX").value)}, y=${Number($("#layoutY").value)}`;
  const content = $("#layoutAbsoluteText").value.trim();
  if (!content) throw new Error("Add some Markdown content before inserting the floating block.");
  return `::: absolute [${position}]\n${content}\n:::`;
}

function initializeLayoutEditor() {
  const dialog = $("#layoutDialog");
  $("#layoutAddColumn").addEventListener("click", () => {
    if ($("#layoutColumns").children.length >= 6) return;
    const column = addLayoutColumn({ ratio: 1, text: "" });
    column.querySelector("textarea").focus();
    $("#layoutAddColumn").disabled = $("#layoutColumns").children.length >= 6;
  });
  $("#layoutPositionMode").addEventListener("change", () => {
    const coordinates = $("#layoutPositionMode").value === "coordinates";
    $("#layoutCoordinateFields").hidden = !coordinates; $("#layoutAnchorField").hidden = coordinates;
  });
  $("#layoutCancel").addEventListener("click", () => dialog.close());
  $("#layoutClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { layoutEditorSession?.focus?.focus(); layoutEditorSession = null; });
  $("#layoutForm").addEventListener("submit", event => {
    event.preventDefault();
    const session = layoutEditorSession;
    if (!session || activeId !== session.documentId || editor.value !== session.text) {
      $("#layoutError").textContent = "The document changed. Close this form and open it again."; return;
    }
    let source;
    try { source = session.type === "columns" ? layoutColumnSource() : absoluteLayoutSource(); }
    catch (error) { $("#layoutError").textContent = error.message; return; }
    if (session.block) {
      const trailing = editor.value.slice(session.block.start, session.block.end).match(/\n*$/)[0];
      editor.setRangeText(source + trailing, session.block.start, session.block.end, "end"); update(true);
    } else { editor.setSelectionRange(session.start, session.end); insertBlock(source); }
    dialog.close(); toast(session.block ? "Layout updated" : "Layout inserted");
  });
}
