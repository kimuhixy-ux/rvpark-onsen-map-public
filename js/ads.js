// ads.js: loads Google AdSense auto ads (kimuhixy.com custom-domain visits only)
(function () {
  var cfg = window.SITE_CONFIG || {};
  if (!cfg.ADS_ENABLED || !cfg.ADSENSE_CLIENT_ID) return;

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(cfg.ADSENSE_CLIENT_ID);
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
})();
