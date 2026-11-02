"use strict";
// Structured forms deliberately accept only syntax they can round-trip without loss.
const CHART_TYPES = { chartBar: "Bar chart", chartLine: "Line chart", chartPie: "Pie chart", diagramTimeline: "Timeline" };
function chartDefaults(type) {
  return { type, title: type === "diagramTimeline" ? "Project plan" : type === "chartPie" ? "Sales share" : "Monthly sales",
    xLabel: "", yLabel: "Sales", minimum: "", maximum: "",
    rows: type === "diagramTimeline" ? [["2026", "Plan"], ["2027", "Launch"]]
      : type === "chartPie" ? [["Product A", "45"], ["Product B", "30"], ["Product C", "25"]]
      : [["Jan", "18"], ["Feb", "27"], ["Mar", "34"], ["Apr", "42"]] };
}
function chartEncode(text) {
  const codes = { '#': '#35;', '"': '#quot;', '<': '#60;', '>': '#62;', '`': '#96;', ':': '#58;', ';': '#59;' };
  return String(text).replace(/[#"<>`:;]/g, character => codes[character]);
}
function chartDecode(text) {
  const codes = { '35': '#', quot: '"', '60': '<', '62': '>', '96': '`', '58': ':', '59': ';' };
  return text.replace(/#(35|quot|60|62|96|58|59);/g, (_, code) => codes[code]);
}
function chartSource(settings) {
  if (!CHART_TYPES[settings.type]) throw new Error("Choose a chart type.");
  const timeline = settings.type === "diagramTimeline";
  const pie = settings.type === "chartPie";
  const title = settings.title.trim();
  if (!title) throw new Error("Enter a title.");
  const texts = [title, settings.xLabel, settings.yLabel, ...settings.rows.flat()];
  if (texts.some(text => /[\r\n]/.test(text))) throw new Error("Use one line per field.");
  if (!settings.rows.length) throw new Error("Add at least one row.");
  if (settings.rows.some(([label, value]) => !label.trim() || !String(value).trim())) throw new Error("Complete the label and value in every row.");
  const values = settings.rows.map(([, value]) => Number(value));
  if (!timeline && values.some(value => !Number.isFinite(value))) throw new Error("Enter a valid number in every value field.");
  if (pie && (values.some(value => value < 0) || !values.some(value => value > 0))) throw new Error("Pie values must be non-negative, with at least one value above zero.");
  const quote = text => `"${chartEncode(text.trim())}"`;
  if (timeline) return `timeline\n    title ${chartEncode(title)}\n${settings.rows.map(([period, event]) => `    ${chartEncode(period.trim())} : ${chartEncode(event.trim())}`).join("\n")}`;
  if (pie) return `pie showData\n    title ${chartEncode(title)}\n${settings.rows.map(([label], index) => `    ${quote(label)} : ${values[index]}`).join("\n")}`;
  let range = "";
  const { minimum, maximum } = settings;
  if (minimum !== "" || maximum !== "") {
    if (minimum === "" || maximum === "" || !Number.isFinite(Number(minimum)) || !Number.isFinite(Number(maximum)) || Number(minimum) >= Number(maximum)) throw new Error("Set both axis limits, with minimum below maximum, or leave both blank for automatic limits.");
    if (values.some(value => value < Number(minimum) || value > Number(maximum))) throw new Error("Axis limits must include every value.");
    range = ` ${Number(minimum)} --> ${Number(maximum)}`;
  }
  const yAxis = [settings.yLabel.trim() ? quote(settings.yLabel) : "", range.trim()].filter(Boolean).join(" ");
  return `xychart-beta\n    title ${quote(title)}\n    x-axis ${settings.xLabel.trim() ? quote(settings.xLabel) + " " : ""}[${settings.rows.map(([label]) => quote(label)).join(", ")}]${yAxis ? `\n    y-axis ${yAxis}` : ""}\n    ${settings.type === "chartBar" ? "bar" : "line"} [${values.join(", ")}]`;
}
function parseChartSource(source) {
  const lines = source.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const numeric = '-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  let settings;
  if (lines[0] === "xychart-beta" && [4, 5].includes(lines.length)) {
    const title = /^title "([^"\n]*)"$/.exec(lines[1]);
    const axis = /^x-axis (?:"([^"\n]*)" )?\[(.*)\]$/.exec(lines[2]);
    const y = lines.length === 4 ? ["", "", "", ""] : new RegExp(`^y-axis (?:"([^"\\n]+)"\\s*)?(?:(${numeric})\\s*-->\\s*(${numeric}))?$`).exec(lines[3]);
    const data = /^(bar|line) \[(.*)\]$/.exec(lines.at(-1));
    if (!title || !axis || !y || !data) return null;
    if (!/^"[^"\n]*"(?:\s*,\s*"[^"\n]*")*$/.test(axis[2].trim())) return null;
    const labels = [...axis[2].matchAll(/"([^"\n]*)"/g)];
    if (axis[2].replace(/"[^"\n]*"/g, "").replace(/[,\s]/g, "")) return null;
    const values = data[2].split(",").map(value => value.trim());
    if (labels.length !== values.length) return null;
    settings = { ...chartDefaults(data[1] === "bar" ? "chartBar" : "chartLine"), title: chartDecode(title[1]), xLabel: chartDecode(axis[1] || ""), yLabel: chartDecode(y[1] || ""), minimum: y[2] || "", maximum: y[3] || "", rows: labels.map((label, index) => [chartDecode(label[1]), values[index]]) };
  } else if ((lines[0] === "pie showData" || lines[0] === "timeline") && lines[1]?.startsWith("title ")) {
    const timeline = lines[0] === "timeline";
    const rows = lines.slice(2).map(line => timeline ? /^([^:]+)\s+:\s+(.+)$/.exec(line) : new RegExp(`^"([^"\\n]*)"\\s*:\\s*(${numeric})$`).exec(line));
    if (rows.some(row => !row)) return null;
    settings = { ...chartDefaults(timeline ? "diagramTimeline" : "chartPie"), title: chartDecode(lines[1].slice(6)), rows: rows.map(row => [chartDecode(row[1].trim()), timeline ? chartDecode(row[2]) : row[2]]) };
  } else return null;
  try { chartSource(settings); return settings; } catch { return null; }
}
