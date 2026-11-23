(() => {
 const key = "galpi-theme";
 let preference;
 try { preference = localStorage.getItem(key); } catch {}
 const system = window.matchMedia("(prefers-color-scheme: dark)");
 const apply = theme => {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById("light-mode");
  if (toggle) toggle.checked = theme === "light";
 };
 apply(["light", "dark"].includes(preference) ? preference : system.matches ? "dark" : "light");
 document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("light-mode");
  if (!toggle) return;
  toggle.checked = document.documentElement.dataset.theme === "light";
  toggle.addEventListener("change", () => {
   preference = toggle.checked ? "light" : "dark";
   apply(preference);
   try { localStorage.setItem(key, preference); } catch {}
  });
 });
 system.addEventListener("change", event => {
  if (!["light", "dark"].includes(preference)) apply(event.matches ? "dark" : "light");
 });
})();
