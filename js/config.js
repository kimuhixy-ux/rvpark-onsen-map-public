// config.js: monetization-related settings for the public (non-temple) build only.
// The private Cloudflare Access deployment does not load this file.
window.SITE_CONFIG = {
  // Ko-fi username. Leave empty to hide the donate link.
  KOFI_USERNAME: "kimuhixy",
  // AdSense should only render on the custom domain (kimuhixy.com), not on the
  // *.pages.dev standalone URL (avoids duplicate-content issues).
  ADS_ENABLED: location.hostname === "kimuhixy.com",
  ADSENSE_CLIENT_ID: "ca-pub-3562055879455682",
};
