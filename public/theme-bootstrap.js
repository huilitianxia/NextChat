// Apply the last verified identity's appearance before the first paint.
(function () {
  var value = {};
  try {
    var id = localStorage.getItem("nextchat:appearance:identity");
    if (id && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) value = JSON.parse(localStorage.getItem("nextchat:user:" + id + ":workspace-preferences") || "{}");
  } catch (_) {}
  var mode = ["light", "dark"].includes(value.mode) ? value.mode : "auto";
  var dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.palette = ["green", "blue", "purple", "paper"].includes(value.palette) ? value.palette : "green";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
