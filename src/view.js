"use strict";
// Shared classic-script scope: see README for load order and file:// support.
  function setView(view) {
    if (view === "split" && window.innerWidth <= 680) view = "source";
    currentView = view;
    region.classList.toggle("source-only", view === "source");
    region.classList.toggle("preview-only", view === "preview");
    document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    if (view !== "source" && pendingLayout) requestAnimationFrame(paginate);
    requestAnimationFrame(refreshEditorHeight);
  }
  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 2300);
  }
  function setNavigationOpen(open) {
    const navigation = $("#navigation");
    navigation.classList.remove("collapsed");
    if (window.innerWidth <= 800) navigation.classList.toggle("open", open);
    else {
      navigation.classList.remove("open");
      navigation.classList.toggle("collapsed", !open);
    }
  }
  function setNavigationTab(tabName) {
    currentNav = tabName;
    document.querySelectorAll("[data-nav]").forEach(tab => tab.classList.toggle("active", tab.dataset.nav === tabName));
    renderNavigation();
  }
