(() => {
 const key = "galpi-theme";
 let preference;
 try { preference = localStorage.getItem(key); } catch {}
 const system = window.matchMedia("(prefers-color-scheme: dark)");
 const apply = theme => {
  document.documentElement.dataset.theme = theme;
  const select = document.getElementById("theme-select");
  if (select) select.value = theme;
 };
 apply(["light", "dark"].includes(preference) ? preference : system.matches ? "dark" : "light");
 document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("theme-select");
  select.value = document.documentElement.dataset.theme;
  select.addEventListener("change", () => {
   preference = select.value;
   apply(preference);
   try { localStorage.setItem(key, preference); } catch {}
  });
 });
 system.addEventListener("change", event => {
  if (!["light", "dark"].includes(preference)) apply(event.matches ? "dark" : "light");
 });
})();