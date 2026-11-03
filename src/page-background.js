"use strict";
// Document-wide background settings are stored in layout metadata.
let pendingBackgroundImage = "";
let pendingBackgroundName = "";
let backgroundReadSerial = 0;

function updatePageBackgroundSample() {
  const color = $("#pageBackgroundColor").value;
  const fit = $("#pageBackgroundSize").value;
  const opacity = Number($("#pageBackgroundOpacity").value);
  const sample = $("#pageBackgroundSample");
  const image = $("#pageBackgroundSampleImage");
  sample.style.backgroundColor = color;
  image.style.backgroundImage = pendingBackgroundImage ? `url("${pendingBackgroundImage}")` : "none";
  image.style.backgroundSize = fit === "stretch" ? "100% 100%" : fit;
  image.style.opacity = String(opacity / 100);
  $("#pageBackgroundOpacityValue").value = `${opacity}%`;
  $("#pageBackgroundRemoveImage").disabled = !pendingBackgroundImage;
  $("#pageBackgroundImageName").textContent = pendingBackgroundImage ? pendingBackgroundName || "Embedded image" : "No image selected";
  $("#pageBackgroundDropTitle").textContent = pendingBackgroundImage ? "Replace image" : "Choose an image";
  $("#pageBackgroundDropDetail").textContent = pendingBackgroundImage ? "Click or drop another image" : "or drag and drop it here";
  $("#pageBackgroundImageOptions").classList.toggle("is-disabled", !pendingBackgroundImage);
  $("#pageBackgroundSize").disabled = !pendingBackgroundImage;
  $("#pageBackgroundOpacity").disabled = !pendingBackgroundImage;
  for (const button of document.querySelectorAll("[data-background-color]")) {
    button.setAttribute("aria-pressed", button.dataset.backgroundColor.toLowerCase() === color.toLowerCase() ? "true" : "false");
  }
}

function initializePageBackground() {
  const dialog = $("#pageBackgroundDialog");
  const fileInput = $("#pageBackgroundFile");
  const drop = $("#pageBackgroundDrop");
  $("#pageBackgroundOpen").addEventListener("click", () => {
    if (!ready || document.querySelector("dialog[open]")) return;
    $("#pageBackgroundColor").value = /^#[0-9a-f]{6}$/i.test(layout.backgroundColor || "") ? layout.backgroundColor : "#ffffff";
    $("#pageBackgroundSize").value = ["cover", "contain", "stretch"].includes(layout.backgroundSize) ? layout.backgroundSize : "cover";
    $("#pageBackgroundOpacity").value = String(Math.max(0, Math.min(100, Number(layout.backgroundOpacity ?? 25))));
    $("#pageBackgroundFile").value = "";
    $("#pageBackgroundError").textContent = "";
    pendingBackgroundImage = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/]+={0,2}$/i.test(layout.backgroundImage || "") ? layout.backgroundImage : "";
    pendingBackgroundName = pendingBackgroundImage ? "Embedded image" : "";
    $("#pageBackgroundHex").value = $("#pageBackgroundColor").value.toUpperCase();
    updatePageBackgroundSample();
    dialog.showModal();
  });
  const close = () => { backgroundReadSerial++; dialog.close(); };
  $("#pageBackgroundClose").addEventListener("click", close);
  $("#pageBackgroundCancel").addEventListener("click", close);
  dialog.addEventListener("close", () => { backgroundReadSerial++; });
  for (const id of ["pageBackgroundSize", "pageBackgroundOpacity"]) {
    $("#" + id).addEventListener("input", updatePageBackgroundSample);
  }
  $("#pageBackgroundColor").addEventListener("input", () => {
    $("#pageBackgroundHex").value = $("#pageBackgroundColor").value.toUpperCase();
    $("#pageBackgroundError").textContent = "";
    updatePageBackgroundSample();
  });
  $("#pageBackgroundHex").addEventListener("input", event => {
    const value = event.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      $("#pageBackgroundColor").value = value;
      $("#pageBackgroundError").textContent = "";
      updatePageBackgroundSample();
    }
  });
  $("#pageBackgroundHex").addEventListener("blur", event => {
    event.target.value = $("#pageBackgroundColor").value.toUpperCase();
  });
  for (const button of document.querySelectorAll("[data-background-color]")) {
    button.addEventListener("click", () => {
      $("#pageBackgroundColor").value = button.dataset.backgroundColor;
      $("#pageBackgroundHex").value = button.dataset.backgroundColor.toUpperCase();
      updatePageBackgroundSample();
    });
  }
  const chooseFile = async file => {
    if (!file) return;
    fileInput.value = "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      $("#pageBackgroundError").textContent = "Choose a PNG, JPEG, or WebP image under 4 MB.";
      return;
    }
    const request = ++backgroundReadSerial;
    try {
      const image = await readImage(file);
      if (request !== backgroundReadSerial || !dialog.open) return;
      pendingBackgroundImage = image;
      pendingBackgroundName = file.name;
      $("#pageBackgroundError").textContent = "";
      updatePageBackgroundSample();
    } catch (error) {
      $("#pageBackgroundError").textContent = `Could not read image: ${error.message}`;
    }
  };
  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", event => chooseFile(event.target.files?.[0]));
  for (const type of ["dragenter", "dragover"]) drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.add("is-dragging");
  });
  for (const type of ["dragleave", "drop"]) drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.remove("is-dragging");
  });
  drop.addEventListener("drop", event => chooseFile(event.dataTransfer?.files?.[0]));
  $("#pageBackgroundRemoveImage").addEventListener("click", () => {
    backgroundReadSerial++;
    pendingBackgroundImage = "";
    pendingBackgroundName = "";
    $("#pageBackgroundFile").value = "";
    updatePageBackgroundSample();
  });
  $("#pageBackgroundReset").addEventListener("click", () => {
    backgroundReadSerial++;
    pendingBackgroundImage = "";
    pendingBackgroundName = "";
    $("#pageBackgroundColor").value = "#ffffff";
    $("#pageBackgroundHex").value = "#FFFFFF";
    $("#pageBackgroundSize").value = "cover";
    $("#pageBackgroundOpacity").value = "25";
    $("#pageBackgroundFile").value = "";
    $("#pageBackgroundError").textContent = "";
    updatePageBackgroundSample();
  });
  $("#pageBackgroundForm").addEventListener("submit", event => {
    event.preventDefault();
    layout = { ...layout,
      backgroundColor: $("#pageBackgroundColor").value,
      backgroundImage: pendingBackgroundImage,
      backgroundSize: $("#pageBackgroundSize").value,
      backgroundOpacity: Number($("#pageBackgroundOpacity").value)
    };
    paginate();
    scheduleSave();
    close();
  });
}
