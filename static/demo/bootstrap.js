/* Run before the unchanged UI scripts. UI preferences stay local to this demo. */
(() => {
  document.documentElement.classList.add("js");
  // Header controls use the marketing site's preference, separate from GoferSettings.
  const siteColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const syncSiteTheme = () => {
    const preference = localStorage.getItem("theme");
    document.documentElement.dataset.siteMode = preference === "dark" || (preference === null && siteColorScheme.matches) ? "dark" : "light";
  };
  syncSiteTheme();
  window.addEventListener("storage", event => {
    if (event.key === "theme" || event.key === null) syncSiteTheme();
  });
  window.addEventListener("focus", syncSiteTheme);
  siteColorScheme.addEventListener("change", syncSiteTheme);
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname === "/api/settings/ui") {
      return Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } }));
    }
    if (url.origin === location.origin && url.pathname.startsWith("/demo/") && (!options.method || options.method === "GET")) {
      return realFetch(input, options);
    }
    return Promise.reject(new Error("This demo uses local fictional data."));
  };
  if (window.parent !== window) document.documentElement.classList.add("demo-embedded");
  document.addEventListener("click", event => {
    if (event.target.closest("[data-demo-unavailable]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
