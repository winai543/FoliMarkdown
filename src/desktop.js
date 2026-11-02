"use strict";
// Shared classic-script scope. The browser build does not require Tauri.
const isDesktop = typeof window.__TAURI__?.core?.invoke === "function";

async function confirmDocumentAction(message) {
  return isDesktop
    ? window.__TAURI__.core.invoke("confirm_action", { message })
    : window.confirm(message);
}

async function promptDocumentName(name) {
  if (!isDesktop) return window.prompt("New document name", name);
  // Native WebViews do not consistently implement window.prompt().
  const dialog = document.createElement("dialog");
  dialog.className = "desktop-prompt";
  dialog.setAttribute("aria-labelledby", "desktopPromptTitle");
  dialog.innerHTML = '<form method="dialog"><h2 id="desktopPromptTitle">Rename document</h2><label for="desktopPromptName">New document name</label><input id="desktopPromptName" maxlength="100" required><div><button value="cancel" formnovalidate>Cancel</button><button value="save">Save</button></div></form>';
  const input = dialog.querySelector("input");
  input.value = name;
  document.body.append(dialog);
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue === "save" ? input.value : null;
      dialog.remove();
      previousFocus?.focus();
      resolve(value);
    }, { once: true });
    dialog.showModal();
    input.focus();
    input.select();
  });
}

if (isDesktop) {
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    event.preventDefault();
    if (!/^(https?:\/\/|mailto:)/i.test(link.href)) return;
    window.__TAURI__.core.invoke("open_external", { url: link.href }).catch(error => {
      console.error("Could not open link:", error);
      toast("Could not open this link in your browser");
    });
  });
}

async function initializeDesktop() {
  if (!isDesktop) return;
  const appWindow = window.__TAURI__.window.getCurrentWindow();
  let closing = false;
  await appWindow.onCloseRequested(async event => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    try {
      if (ready) {
        draftSnapshot();
        if (!await flushDocument()) return;
      }
      await appWindow.destroy();
    } catch (error) {
      console.error("Could not close the document:", error);
      toast("Could not finish saving. Download a backup before closing.");
    } finally { closing = false; }
  });
}
