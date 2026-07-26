// donate.js: renders the Ko-fi support link into the public-site footer nav
(function () {
  var cfg = window.SITE_CONFIG || {};
  if (!cfg.KOFI_USERNAME) return;
  var footer = document.querySelector(".public-footer");
  if (!footer) return;

  var a = document.createElement("a");
  a.href = "https://ko-fi.com/" + encodeURIComponent(cfg.KOFI_USERNAME);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "☕ Ko-fiで応援する";
  footer.appendChild(a);
})();
