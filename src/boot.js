"use strict";
// Register the application only after every feature script is loaded.
initializeChartEditor();
initializeDiagramEditor();
initializeTableEditor();
initializeLayoutEditor();
initializeDocumentTemplates();
const libraryStarted = startLibrary();
initializeDesktop(libraryStarted).catch(error => {
  console.error("Desktop setup failed:", error);
  toast("Could not enable save-on-close. Download a backup before closing.");
});
