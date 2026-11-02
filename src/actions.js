"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function perform(action) {
    switch (action) {
      case "bold": replaceSelection("**", "**"); break;
      case "italic": replaceSelection("*", "*"); break;
      case "strike": replaceSelection("~~", "~~"); break;
      case "code": replaceSelection("`", "`", "code"); break;
      case "link": replaceSelection("[", "](https://example.com)", "link text"); break;
      case "image": $("#imageInput").click(); break;
      case "bullet": prefixLines("- "); break;
      case "number": prefixLines((line, i) => `${i + 1}. ${line}`); break;
      case "task": prefixLines("- [ ] "); break;
      case "quote": prefixLines("> "); break;
      case "h1": case "h2": case "h3": heading(Number(action[1])); break;
      case "table": insertBlock("| Heading | Details |\n| --- | --- |\n| Item | Description |"); break;
      case "codeblock": insertBlock("```\nYour code\n```"); break;
      case "chartBar": insertMermaid('xychart-beta\n    title "Monthly sales"\n    x-axis ["Jan", "Feb", "Mar", "Apr"]\n    y-axis "Sales" 0 --> 50\n    bar [18, 27, 34, 42]'); break;
      case "chartLine": insertMermaid('xychart-beta\n    title "Monthly sales"\n    x-axis ["Jan", "Feb", "Mar", "Apr"]\n    y-axis "Sales" 0 --> 50\n    line [18, 27, 34, 42]'); break;
      case "chartPie": insertMermaid('pie showData\n    title Sales share\n    "Product A" : 45\n    "Product B" : 30\n    "Product C" : 25'); break;
      case "diagramFlow": insertMermaid('flowchart LR\n    A["Start"] --> B{"Check"}\n    B -- Yes --> C["Proceed"]\n    B -- No --> D["Revise"]\n    D --> B'); break;
      case "diagramSequence": insertMermaid('sequenceDiagram\n    participant U as User\n    participant S as System\n    U->>S: Request\n    S-->>U: Response'); break;
      case "diagramER": insertMermaid('erDiagram\n    USER ||--o{ ORDER : places\n    USER {\n        int id PK\n        string name\n    }\n    ORDER {\n        int id PK\n        int user_id FK\n    }'); break;
      case "diagramTimeline": insertMermaid('timeline\n    title Project plan\n    2026 : Plan\n    2027 : Launch'); break;
      case "pagebreak": insertBlock("<!-- pagebreak -->"); break;
      case "rule": insertBlock("---"); break;
      case "find":
        setNavigationOpen(true);
        setNavigationTab("results");
        requestAnimationFrame(() => $("#search").focus());
        break;
      case "undo": if (historyIndex > 0) { historyIndex--; editor.value = history[historyIndex]; lastHistoryAt = 0; render(); refreshEditorHeight(); scheduleSave(); editor.focus(); } break;
      case "redo": if (historyIndex < history.length - 1) { historyIndex++; editor.value = history[historyIndex]; lastHistoryAt = 0; render(); refreshEditorHeight(); scheduleSave(); editor.focus(); } break;
      case "library": openLibrary(); break;
      case "new": libraryAction("new"); break;
      case "open": $("#fileInput").click(); break;
      case "download":
        try {
          download(`${cleanName()}.md`, markdownFile(), "text/markdown;charset=utf-8");
          toast("Downloaded Markdown with images");
        } catch (error) {
          console.error("Markdown export failed:", error);
          toast("Export failed: some stored images are missing");
        }
        break;
      case "docx":
        toast("Preparing DOCX...");
        prepareVisuals(() => {
          exportDocx().then(({ blob, warnings }) => {
            download(`${cleanName()}.docx`, blob, blob.type);
            toast(warnings ? `Downloaded DOCX (${warnings} images/diagrams could not be converted; text was used instead)` : "Downloaded DOCX");
          }).catch(error => {
            console.error("DOCX export failed:", error);
            toast("DOCX export failed. Please try again.");
          });
        });
        break;
      case "print":
        prepareVisuals(() => window.print());
        break;
      case "pdf":
        if (!pdfBusy) {
          toast("Preparing PDF...");
          prepareVisuals(() => exportPdf());
        }
        break;
      case "export": {
        prepareVisuals(() => {
          try {
            download(`${cleanName()}.html`, exportHtml(), "text/html;charset=utf-8");
            toast("Downloaded HTML");
          } catch (error) {
            console.error("HTML export failed:", error);
            toast("Could not export HTML. Check whether the stylesheet loaded.");
          }
        });
        break;
      }
    }
  }
  function prepareVisuals(callback) {
    if (currentView === "source") setView("preview");
    if (activeDiagramKeys.size) toast("Preparing diagrams...");
    requestAnimationFrame(() => {
      paginate();
      waitForVisuals().then(() => requestAnimationFrame(() => {
        paginate();
        callback();
      }));
    });
  }
