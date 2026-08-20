/**
 * modal.js — generic modal + confirm-dialog helper.
 */
import { Icons } from "./icons.js";

let activeBackdrop = null;
let lastFocused = null;

/**
 * Opens a modal with custom HTML content.
 * @param {Object} opts { title, bodyHtml, footerHtml, size: 'md'|'lg', onClose }
 * @returns {HTMLElement} the modal element (to query inputs from, etc.)
 */
export function openModal({ title, bodyHtml, footerHtml = "", size = "md", onClose }) {
  closeModal(); // only one at a time
  lastFocused = document.activeElement;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${size === "lg" ? "modal-lg" : ""}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="icon-btn modal-close-x" aria-label="Close">${Icons.svg("x")}</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";
  activeBackdrop = backdrop;

  const close = () => {
    backdrop.remove();
    document.body.style.overflow = "";
    activeBackdrop = null;
    if (onClose) onClose();
    if (lastFocused) lastFocused.focus();
  };

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".modal-close-x").addEventListener("click", close);
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape" && activeBackdrop === backdrop) {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  });

  backdrop.close = close;
  const firstInput = backdrop.querySelector("input, select, textarea, button.btn-primary");
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
  return backdrop;
}

export function closeModal() {
  if (activeBackdrop) {
    activeBackdrop.remove();
    document.body.style.overflow = "";
    activeBackdrop = null;
  }
}

/**
 * Shows a confirmation dialog. Resolves true/false.
 * @param {Object} opts { title, message, confirmText, danger }
 */
export function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm", cancelText = "Cancel", danger = true }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal confirm-dialog" role="alertdialog" aria-modal="true">
        <div class="modal-body">
          <div class="confirm-icon">${Icons.svg(danger ? "alertTriangle" : "info")}</div>
          <div>
            <h3>${title}</h3>
            <p>${message}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-act="cancel">${cancelText}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    const finish = (val) => {
      backdrop.remove();
      document.body.style.overflow = "";
      resolve(val);
    };
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) finish(false); });
    backdrop.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(false));
    backdrop.querySelector('[data-act="confirm"]').addEventListener("click", () => finish(true));
    setTimeout(() => backdrop.querySelector('[data-act="confirm"]').focus(), 60);
  });
}
