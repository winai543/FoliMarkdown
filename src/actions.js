"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  async function perform(action) {
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
      case "chartBar": openChartEditor("chartBar"); break;
      case "chartLine": openChartEditor("chartLine"); break;
      case "chartPie": openChartEditor("chartPie"); break;
      case "diagramFlow": insertMermaid('flowchart LR\n    A["Start"] --> B{"Check"}\n    B -- Yes --> C["Proceed"]\n    B -- No --> D["Revise"]\n    D --> B'); break;
      case "diagramSequence": insertMermaid('sequenceDiagram\n    participant U as User\n    participant S as System\n    U->>S: Request\n    S-->>U: Response'); break;
      case "diagramER": insertMermaid('erDiagram\n    USER ||--o{ ORDER : places\n    USER {\n        int id PK\n        string name\n    }\n    ORDER {\n        int id PK\n        int user_id FK\n    }'); break;
      case "diagramTimeline": openChartEditor("diagramTimeline"); break;
      case "editChart": {
        const block = editableChartBlocks().find(item => editor.selectionStart >= item.start && editor.selectionStart < item.end);
        if (block?.settings) openChartEditor(null, block.index);
        else toast("Place the cursor inside a supported chart or timeline block, or use Edit on its preview.");
        break;
      }
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
      case "openFolder": case "linkImageFolder":
        folderPickerMode = action === "openFolder" ? "open" : "link";
        $("#folderInput").click();
        break;
      case "open": $("#fileInput").click(); break;
      case "download":
        try {
          if (await download(`${cleanName()}.md`, markdownFile(), "text/markdown;charset=utf-8"))
            toast("Saved Markdown with images");
        } catch (error) {
          console.error("Markdown export failed:", error);
          toast("Could not save Markdown. Check stored images and the destination.");
        }
        break;
      case "docx":
        toast("Preparing DOCX...");
        prepareVisuals(() => {
          exportDocx().then(async ({ blob, warnings }) => {
            if (!await download(`${cleanName()}.docx`, blob, blob.type)) return;
            toast(warnings ? `Downloaded DOCX (${warnings} images/diagrams could not be converted; text was used instead)` : "Downloaded DOCX");
          }).catch(error => {
            console.error("DOCX export failed:", error);
            toast("DOCX export failed. Please try again.");
          });
        });
        break;
      case "print":
        if (isDesktop) {
          // A direct PDF export works across WKWebView, WebKitGTK and WebView2.
          // Open the saved PDF in the system viewer to print it.
          if (!pdfBusy) prepareVisuals(() => exportPdf());
        } else prepareVisuals(() => window.print());
        break;
      case "pdf":
        if (!pdfBusy) {
          toast("Preparing PDF...");
          prepareVisuals(() => exportPdf());
        }
        break;
      case "export": {
        prepareVisuals(async () => {
          try {
            if (await download(`${cleanName()}.html`, exportHtml(), "text/html;charset=utf-8"))
              toast("Saved HTML");
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
