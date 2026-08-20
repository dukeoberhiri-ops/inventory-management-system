/**
 * toast.js — lightweight toast notification system.
 * Usage: import { toast } from './toast.js'; toast.success('Saved', 'Product updated');
 */
import { Icons } from "./icons.js";

function ensureStack() {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  return stack;
}

const ICONS = { success: "check", error: "alertCircle", warning: "alertTriangle", info: "info" };

function show(type, title, message = "", duration = 4200) {
  const stack = ensureStack();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${Icons.svg(ICONS[type] || "info")}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss">${Icons.svg("x")}</button>
  `;
  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 160);
  };
  el.querySelector(".toast-close").addEventListener("click", remove);
  stack.appendChild(el);
  if (duration) setTimeout(remove, duration);
  return el;
}

export const toast = {
  success: (title, message) => show("success", title, message),
  error: (title, message) => show("error", title, message),
  warning: (title, message) => show("warning", title, message),
  info: (title, message) => show("info", title, message),
};
