"use strict";
let chartEditorSession = null;
let chartPreviewTimer;
let chartPreviewVersion = 0;

function editableChartBlocks() {
  let offset = 0, diagramIndex = 0;
  const blocks = [];
  for (const token of markdownParser.lexer(editor.value)) {
    let diagrams = 0;
    markdownParser.walkTokens([token], item => {
      if (item.type === "code" && ["mermaid", "chart", "diagram"].includes((item.lang || "").split(/\s+/)[0].toLowerCase())) diagrams++;
    });
    if (diagrams && token.type === "code" && /^ {0,3}(?:`{3,}|~{3,})/.test(token.raw)) {
      blocks.push({ index: diagramIndex, start: offset, end: offset + token.raw.length, source: token.text, settings: parseChartSource(token.text) });
    }
    diagramIndex += diagrams;
    offset += token.raw.length;
  }
  return blocks;
}
function chartFormSettings() {
  return { type: $("#chartType").value, title: $("#chartTitle").value, xLabel: $("#chartXAxis").value,
    yLabel: $("#chartYAxis").value, minimum: $("#chartMinimum").value, maximum: $("#chartMaximum").value,
    rows: [...$("#chartRows").children].map(row => [...row.querySelectorAll("input")].map(input => input.value)) };
}
function addChartRow(label = "", value = "") {
  const timeline = $("#chartType").value === "diagramTimeline";
  const row = document.createElement("div");
  row.className = "chart-data-row";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = label;
  labelInput.setAttribute("aria-label", timeline ? "Period" : "Label");
  labelInput.placeholder = timeline ? "e.g. 2028" : "e.g. May";
  const valueInput = document.createElement("input");
  valueInput.type = timeline ? "text" : "number";
  if (!timeline) valueInput.step = "any";
  valueInput.value = value;
  valueInput.setAttribute("aria-label", timeline ? "Event" : "Value");
  valueInput.placeholder = timeline ? "e.g. Launch" : "0";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chart-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove row");
  remove.addEventListener("click", () => { row.remove(); scheduleChartPreview(); });
  row.append(labelInput, valueInput, remove);
  $("#chartRows").append(row);
  return labelInput;
}
function fillChartForm(settings) {
  $("#chartType").value = settings.type;
  $("#chartTitle").value = settings.title;
  $("#chartXAxis").value = settings.xLabel;
  $("#chartYAxis").value = settings.yLabel;
  $("#chartMinimum").value = settings.minimum;
  $("#chartMaximum").value = settings.maximum;
  $("#chartAxes").hidden = !["chartBar", "chartLine"].includes(settings.type);
  const timeline = settings.type === "diagramTimeline";
  $("#chartLabelHeading").textContent = timeline ? "Period" : "Label";
  $("#chartValueHeading").textContent = timeline ? "Event" : "Value";
  $("#chartRows").replaceChildren();
  settings.rows.forEach(([label, value]) => addChartRow(label, value));
  scheduleChartPreview();
}
function scheduleChartPreview() {
  clearTimeout(chartPreviewTimer);
  const version = ++chartPreviewVersion;
  let source;
  try {
    source = chartSource(chartFormSettings());
    $("#chartError").textContent = "";
    $("#chartSave").disabled = false;
  } catch (error) {
    $("#chartError").textContent = error.message;
    $("#chartSave").disabled = true;
    $("#chartPreview").textContent = "Complete the form to see a preview.";
    $("#chartCode").textContent = "";
    return;
  }
  $("#chartCode").textContent = source;
  $("#chartPreview").textContent = "Updating preview…";
  chartPreviewTimer = setTimeout(() => {
    // Share the render queue with document diagrams to avoid Mermaid render races.
    diagramWork = diagramWork.catch(() => {}).then(async () => {
      if (version !== chartPreviewVersion || !$("#chartDialog").open) return;
      try {
        const mermaid = await loadMermaid();
        const result = await mermaid.render(`folimarkdown-builder-${++diagramSerial}`, source);
        if (version === chartPreviewVersion && $("#chartDialog").open) $("#chartPreview").innerHTML = result.svg;
      } catch {
        if (version === chartPreviewVersion && $("#chartDialog").open) $("#chartPreview").textContent = "Preview unavailable. Check your connection. You can still save these settings.";
      }
    });
  }, 250);
}
function openChartEditor(type, index = null) {
  if (!ready || !$("#libraryOverlay").hidden) return;
  const block = index === null ? editableChartBlocks().find(item => editor.selectionStart >= item.start && editor.selectionStart < item.end) : editableChartBlocks().find(item => item.index === index);
  if (block && !block.settings) { toast("This diagram uses advanced Mermaid syntax. Edit its source in Markdown."); return; }
  const settings = block?.settings || chartDefaults(type || "chartBar");
  chartEditorSession = { block, text: editor.value, documentId: activeId, start: editor.selectionStart, end: editor.selectionEnd,
    focus: document.activeElement, type: settings.type, drafts: new Map() };
  $("#chartDialogTitle").textContent = block ? "Edit chart or timeline" : "Create chart or timeline";
  $("#chartSave").textContent = block ? "Save changes" : "Insert into document";
  $("#chartDialog").showModal();
  fillChartForm(settings);
  $("#chartTitle").focus();
}
function initializeChartEditor() {
  const dialog = $("#chartDialog");
  $("#chartForm").addEventListener("input", scheduleChartPreview);
  $("#chartType").addEventListener("change", () => {
    const previous = { ...chartFormSettings(), type: chartEditorSession.type };
    chartEditorSession.drafts.set(previous.type, previous);
    const next = $("#chartType").value;
    const draft = chartEditorSession.drafts.get(next) || (["chartBar", "chartLine"].includes(previous.type) && ["chartBar", "chartLine"].includes(next) ? { ...previous, type: next } : chartDefaults(next));
    chartEditorSession.type = next;
    fillChartForm(draft);
  });
  $("#chartAddRow").addEventListener("click", () => { addChartRow().focus(); scheduleChartPreview(); });
  $("#chartCancel").addEventListener("click", () => dialog.close());
  $("#chartClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return; // A previous close event can arrive after reopening.
    clearTimeout(chartPreviewTimer);
    chartPreviewVersion++;
    chartEditorSession?.focus?.focus();
    chartEditorSession = null;
  });
  $("#chartForm").addEventListener("submit", event => {
    event.preventDefault();
    const session = chartEditorSession;
    if (activeId !== session.documentId || editor.value !== session.text) { $("#chartError").textContent = "The document changed. Close this form and open it again."; return; }
    let source;
    try { source = chartSource(chartFormSettings()); } catch (error) { $("#chartError").textContent = error.message; return; }
    if (session.block) {
      const original = editor.value.slice(session.block.start, session.block.end);
      const trailing = original.match(/\n*$/)[0];
      editor.setRangeText(`\`\`\`mermaid\n${source}\n\`\`\`${trailing}`, session.block.start, session.block.end, "end");
      update(true);
    } else {
      editor.setSelectionRange(session.start, session.end);
      insertMermaid(source);
    }
    dialog.close();
    toast(session.block ? "Chart updated" : "Chart inserted");
  });
}
