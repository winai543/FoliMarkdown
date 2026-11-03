"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function diagramKey(figure) {
    return `${figure.dataset.diagramIndex}\u0000${figure.dataset.mermaidSource}`;
  }
  function loadMermaid() {
    if (!mermaidModulePromise) {
      mermaidModulePromise = Promise.race([
        import(mermaidLoadAttempt ? `${MERMAID_URL}?retry=${mermaidLoadAttempt}` : MERMAID_URL),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Mermaid loading timed out")), 6000))
      ]).then(module => {
        module.default.initialize({
          startOnLoad: false, securityLevel: "strict", theme: "neutral",
          themeVariables: {
            xyChart: { plotColorPalette: "#14685f, #2563eb, #b45309, #7c3aed, #be123c" },
            pie1: "#1b3557", pie2: "#14685f", pie3: "#78a99d", pie4: "#c9ddd6",
            pieTitleTextColor: "#1b3557", pieSectionTextColor: "#25332e", pieLegendTextColor: "#405149",
            pieStrokeColor: "#ffffff", pieStrokeWidth: 2, pieOuterStrokeColor: "#d6e2de"
          },
          flowchart: { htmlLabels: false }
        });
        return module.default;
      }).catch(error => {
        mermaidModulePromise = null;
        throw error;
      });
    }
    return mermaidModulePromise;
  }
  function populateDiagram(figure) {
    const cached = diagramCache.get(diagramKey(figure));
    if (!cached) return;
    if (cached.svg) figure.innerHTML = cached.svg;
    else {
      const source = figure.dataset.mermaidSource.split("\n").slice(0, 12).join("\n");
      figure.innerHTML = `<div class="diagram-error">Could not render the diagram: check Mermaid syntax or your connection</div><pre><code>${escapeHtml(source)}</code></pre><button type="button" class="view-pill diagram-retry">Retry</button>`;
    }
  }
  function queueDiagrams(figures) {
    for (const figure of figures) {
      const key = diagramKey(figure);
      if (diagramCache.has(key) || scheduledDiagrams.has(key)) continue;
      scheduledDiagrams.add(key);
      const source = figure.dataset.mermaidSource;
      diagramWork = diagramWork.then(async () => {
        if (!activeDiagramKeys.has(key)) return;
        try {
          const mermaid = await loadMermaid();
          const result = await mermaid.render(`folimarkdown-mermaid-${++diagramSerial}`, source);
          if (activeDiagramKeys.has(key)) diagramCache.set(key, { svg: result.svg });
        } catch {
          if (activeDiagramKeys.has(key)) diagramCache.set(key, { error: true });
        } finally {
          scheduledDiagrams.delete(key);
          if (activeDiagramKeys.has(key)) requestAnimationFrame(paginate);
        }
      });
    }
  }
