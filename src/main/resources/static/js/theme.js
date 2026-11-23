(() => {
 const key = "galpi-theme";
 let preference;
 try { preference = localStorage.getItem(key); } catch {}
 const apply = theme => {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById("dark-mode");
  if (toggle) toggle.checked = theme === "dark";
 };
 apply(["light", "dark"].includes(preference) ? preference : "light");
 document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("dark-mode");
  if (!toggle) return;
  toggle.checked = document.documentElement.dataset.theme === "dark";
  toggle.addEventListener("change", () => {
   preference = toggle.checked ? "dark" : "light";
   apply(preference);
   try { localStorage.setItem(key, preference); } catch {}
  });
 });
})();
