"use strict";
// Inspect Handlebars expressions in the current Markdown and build an editable JSON schema.
let dataTemplateSource = "";
let dataPreviewOutput = null;
registerFoliMarkdownFormatters(Handlebars);
const LOLI_FUNCTION_STORAGE_KEY = "folimarkdown.loliFunctions.v1";
let activeLoliFunction = null;
function loadLoliFunctions() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOLI_FUNCTION_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch { return {}; }
}
globalThis.foliLoliFunctions = loadLoliFunctions();
const FORMATTING_HELPERS = new Set([
  "format", "formatNumber", "formatCurrency", "formatDate", "formatTime", "formatPercent",
  "uppercase", "lowercase", "capitalize", "join", "default", "add", "sum", "subtract",
  "multiply", "divide", "average", "min", "max", "round", "ceil", "floor", "abs",
  "power", "mod", "percent", "loli"
]);

function schemaPath(root, path, leafValue = "") {
  let current = root;
  for (let index = 0; index < path.length; index++) {
    const part = path[index];
    const last = index === path.length - 1;
    if (part === "[]") {
      if (!Array.isArray(current)) return;
      if (!current.length) current.push({});
      current = current[0];
    } else if (last) {
      if (current[part] === undefined) current[part] = leafValue;
    } else {
      const wantsArray = path[index + 1] === "[]";
      if (!current[part] || typeof current[part] !== "object") current[part] = wantsArray ? [] : {};
      current = current[part];
    }
  }
}

function mergeDataSchema(schema, existing) {
  if (Array.isArray(schema)) {
    if (!Array.isArray(existing)) return schema;
    if (!schema.length) return existing;
    return existing.map(item => mergeDataSchema(schema[0], item));
  }
  if (schema && typeof schema === "object") {
    const merged = {};
    for (const [key, value] of Object.entries(schema)) {
      merged[key] = mergeDataSchema(value, existing && typeof existing === "object" ? existing[key] : undefined);
    }
    return merged;
  }
  return existing === undefined ? schema : existing;
}

function handlebarsSchema(markdown) {
  const schema = {};
  const blocks = [];
  const contexts = [[]];
  const source = markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
  const expressions = /{{{([\s\S]*?)}}}|{{([\s\S]*?)}}/g;
  let count = 0, match;

  function expressionPath(value) {
    let name = value.trim().split(/\s+/)[0];
    if (!name || name === "." || name.startsWith("@") || name.startsWith("!") || name.startsWith("lookup")) return null;
    let base = contexts.at(-1);
    while (name.startsWith("../")) {
      name = name.slice(3);
      if (contexts.length > 1) base = contexts[Math.max(0, contexts.indexOf(base) - 1)];
    }
    if (name.startsWith("@root.")) { base = []; name = name.slice(6); }
    if (name === "this" || name === "./") return base;
    name = name.replace(/^this\./, "").replace(/^\.\//, "");
    const segments = name.split(".").filter(part => /^[A-Za-z_$][\w$-]*$/.test(part));
    return segments.length ? [...base, ...segments] : null;
  }

  while ((match = expressions.exec(source))) {
    let value = (match[1] ?? match[2] ?? "").trim().replace(/^~/, "").replace(/~$/, "");
    if (!value || value.startsWith("!") || value === "else" || value.startsWith("else ")) continue;
    if (value.startsWith("/")) {
      const pushed = blocks.pop();
      if (pushed) contexts.pop();
      continue;
    }
    if (value.startsWith("#")) {
      const [, helper, argument = ""] = value.match(/^#([\w-]+)\s*(.*)$/) || [];
      if (!helper) continue;
      const path = expressionPath(argument);
      const pushesContext = helper === "each" || helper === "with";
      if (path) {
        schemaPath(schema, path, helper === "each" ? [] : helper === "with" ? {} : false);
        if (helper === "each") {
          const rowPath = [...path, "[]"];
          schemaPath(schema, rowPath);
          if (argument.trim() === "this" && Array.isArray(path)) schemaPath(schema, [...path, "[]"], "");
          if (pushesContext) contexts.push(rowPath);
        } else if (helper === "with") contexts.push(path);
      } else if (pushesContext) contexts.push([...contexts.at(-1)]);
      blocks.push(pushesContext);
      count++;
      continue;
    }
    const tokens = value.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g) || [];
    const helper = tokens[0];
    if (FORMATTING_HELPERS.has(helper)) {
      if (helper === "loli" && tokens[1]) {
        let script = tokens[1];
        try { script = script[0] === '"' ? JSON.parse(script) : script.slice(1, -1).replace(/\\(['\\])/g, "$1"); } catch { /* Keep malformed input for field discovery. */ }
        const code = script.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, " ");
        const identifiers = /(?:\.\.\/)*[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)*/g;
        let reference;
        while ((reference = identifiers.exec(code))) {
          const pathText = reference[0];
          const next = code.slice(identifiers.lastIndex).match(/^\s*/)[0].length + identifiers.lastIndex;
          if (["true", "false", "null", "undefined", "this"].includes(pathText) || code[next] === "(" || /^\d/.test(pathText)) continue;
          const path = expressionPath(pathText);
          if (path?.length) { schemaPath(schema, path); count++; }
        }
        continue;
      }
      for (const argument of tokens.slice(1)) {
        const hashValue = argument.match(/^[\w-]+=([^=]+)$/)?.[1];
        const candidate = (hashValue || argument).replace(/^[()]|[()]$/g, "");
        if (/^(?:"|'|\d|true$|false$)/i.test(candidate)) continue;
        if (FORMATTING_HELPERS.has(candidate)) continue;
        const path = expressionPath(candidate);
        if (path?.length) { schemaPath(schema, path); count++; }
      }
      continue;
    }
    const path = expressionPath(value);
    if (!path?.length) continue;
    schemaPath(schema, path);
    count++;
  }
  return { schema, count };
}

function setDataPanelStatus(message, kind = "") {
  const status = $("#dataStatus");
  status.textContent = message;
  status.dataset.state = kind;
}

function renderDataSchema(markdown, preserveValues) {
  const result = handlebarsSchema(markdown);
  const input = $("#dataJson");
  let next = result.schema;
  let canUpdateInput = true;
  if (preserveValues) {
    try { next = mergeDataSchema(next, JSON.parse(input.value)); }
    catch { canUpdateInput = false; setDataPanelStatus("JSON has a syntax error; fix it before changing the Markdown.", "error"); }
  }
  if (canUpdateInput) input.value = JSON.stringify(next, null, 2);
  $("#dataFieldCount").textContent = result.count ? `${result.count} binding${result.count === 1 ? "" : "s"} found` : "No fields detected";
  $("#dataRibbonSummary").textContent = result.count ? `${result.count} binding${result.count === 1 ? "" : "s"} found` : "No fields detected";
  $("#dataApply").disabled = result.count === 0;
  if (canUpdateInput) setDataPanelStatus(result.count ? "Ready to apply" : "Add {{field}} expressions to the Markdown to bind data.", result.count ? "ready" : "");
}

function resetDataBindingSource(markdown) {
  dataTemplateSource = markdown;
  dataPreviewOutput = null;
  $("#dataResetPreview").disabled = true;
  $("#dataStatus").dataset.state = "";
  renderDataSchema(markdown, false);
}

function updateDataBindingSource(markdown) {
  if (markdown !== dataTemplateSource) {
    dataPreviewOutput = null;
    $("#dataResetPreview").disabled = true;
  }
  dataTemplateSource = markdown;
  renderDataSchema(markdown, true);
}

function previewMarkdownSource(markdown) {
  return dataPreviewOutput === null ? markdown : dataPreviewOutput;
}

function applyTemplateData() {
  if (!ready || !dataTemplateSource) return;
  try {
    const data = JSON.parse($("#dataJson").value);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON must contain an object at the top level.");
    const source = dataTemplateSource || editor.value;
    dataPreviewOutput = Handlebars.compile(source, { noEscape: false })(data);
    $("#dataResetPreview").disabled = false;
    render();
    setDataPanelStatus("Preview updated. Markdown source is unchanged.", "success");
    $("#dataDialog").close();
  } catch (error) {
    setDataPanelStatus(error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : error.message, "error");
  }
}

function initializeDataTab() {
  $("#dataOpen").addEventListener("click", () => {
    if (!ready) return;
    $("#dataDialog").showModal();
    $("#dataJson").focus();
  });
  $("#dataClose").addEventListener("click", () => $("#dataDialog").close());
  $("#dataCancel").addEventListener("click", () => $("#dataDialog").close());
  $("#dataApply").addEventListener("click", applyTemplateData);
  $("#dataResetPreview").addEventListener("click", () => {
    if (dataPreviewOutput === null) return;
    dataPreviewOutput = null;
    $("#dataResetPreview").disabled = true;
    render();
    setDataPanelStatus("Preview reset to the original template.", "success");
  });
  $("#dataJson").addEventListener("input", () => setDataPanelStatus("JSON edited. Apply it to update the document.", "ready"));
  initializeLoliFunctions();
}

function renderLoliFunctionList() {
  const list = $("#loliFunctionList");
  list.replaceChildren();
  const definitions = globalThis.foliLoliFunctions || {};
  const names = Object.keys(definitions).sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "loli-function-empty";
    empty.textContent = "No functions saved yet. Create one to reuse calculations in your templates.";
    list.append(empty);
    return;
  }
  for (const name of names) {
    const definition = definitions[name];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "loli-function-item";
    button.setAttribute("aria-current", String(name === activeLoliFunction));
    const signature = document.createElement("code");
    signature.textContent = `${name}(${(definition.params || []).join(", ")})`;
    const expression = document.createElement("small");
    expression.textContent = definition.expression || "";
    button.append(signature, expression);
    button.addEventListener("click", () => editLoliFunction(name));
    list.append(button);
  }
}

function editLoliFunction(name) {
  const definition = globalThis.foliLoliFunctions?.[name];
  if (!definition) return;
  activeLoliFunction = name;
  $("#loliFunctionName").value = name;
  $("#loliFunctionParams").value = (definition.params || []).join(", ");
  $("#loliFunctionExpression").value = definition.expression || "";
  $("#loliFunctionDelete").disabled = false;
  $("#loliFunctionError").textContent = "";
  renderLoliFunctionList();
}

function newLoliFunction() {
  activeLoliFunction = null;
  $("#loliFunctionForm").reset();
  $("#loliFunctionDelete").disabled = true;
  $("#loliFunctionError").textContent = "";
  renderLoliFunctionList();
  $("#loliFunctionName").focus();
}

function saveLoliFunction(event) {
  event.preventDefault();
  const name = $("#loliFunctionName").value.trim();
  const paramsText = $("#loliFunctionParams").value.trim();
  const expression = $("#loliFunctionExpression").value.trim();
  const params = paramsText ? paramsText.split(",").map(item => item.trim()) : [];
  const reserved = new Set([...FORMATTING_HELPERS, "if", "each", "with", "lookup", "log", "true", "false", "null", "this"]);
  try {
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || reserved.has(name)) throw new Error("Choose a valid function name that is not a built-in helper.");
    if (params.length > 10 || params.some(param => !/^[A-Za-z_$][\w$]*$/.test(param) || reserved.has(param)) || new Set(params).size !== params.length) throw new Error("Parameters must be unique names, with up to 10 parameters.");
    if (!expression) throw new Error("Enter a Loli Script expression for this function.");
    const next = { ...(globalThis.foliLoliFunctions || {}) };
    if (activeLoliFunction && activeLoliFunction !== name) delete next[activeLoliFunction];
    next[name] = { params, expression };
    if (Object.keys(next).length > 50) throw new Error("You can save up to 50 functions.");
    const sample = Object.fromEntries(params.map(param => [param, 100]));
    registerFoliMarkdownFormatters.evaluateLoliScript(expression, {}, sample, next);
    localStorage.setItem(LOLI_FUNCTION_STORAGE_KEY, JSON.stringify(next));
    globalThis.foliLoliFunctions = next;
    activeLoliFunction = name;
    $("#loliFunctionDelete").disabled = false;
    $("#loliFunctionError").textContent = "Function saved. Call it inside {{loli \"...\"}}.";
    renderLoliFunctionList();
    if (dataPreviewOutput !== null) {
      try {
        const data = JSON.parse($("#dataJson").value);
        dataPreviewOutput = Handlebars.compile(dataTemplateSource, { noEscape: false })(data);
        render();
      } catch (error) { $("#loliFunctionError").textContent = `Saved, but preview could not update: ${error.message}`; }
    }
  } catch (error) {
    $("#loliFunctionError").textContent = error.message;
  }
}

function deleteLoliFunction() {
  if (!activeLoliFunction || !globalThis.foliLoliFunctions?.[activeLoliFunction]) return;
  const next = { ...globalThis.foliLoliFunctions };
  delete next[activeLoliFunction];
  try { localStorage.setItem(LOLI_FUNCTION_STORAGE_KEY, JSON.stringify(next)); }
  catch (error) { $("#loliFunctionError").textContent = `Could not save function library: ${error.message}`; return; }
  globalThis.foliLoliFunctions = next;
  newLoliFunction();
  if (dataPreviewOutput !== null) {
    try {
      const data = JSON.parse($("#dataJson").value);
      dataPreviewOutput = Handlebars.compile(dataTemplateSource, { noEscape: false })(data);
      render();
    } catch { /* The next Apply reports invalid functions in the current template. */ }
  }
}

function initializeLoliFunctions() {
  $("#loliFunctionsOpen").addEventListener("click", () => {
    newLoliFunction();
    $("#loliFunctionsDialog").showModal();
  });
  $("#loliFunctionsClose").addEventListener("click", () => $("#loliFunctionsDialog").close());
  $("#loliFunctionNew").addEventListener("click", newLoliFunction);
  $("#loliFunctionForm").addEventListener("submit", saveLoliFunction);
  $("#loliFunctionDelete").addEventListener("click", deleteLoliFunction);
}
