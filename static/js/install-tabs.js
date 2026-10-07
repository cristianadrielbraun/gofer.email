(() => {
  const card = document.querySelector("[data-install]");
  if (!card) return;
  const tabs = [...card.querySelectorAll("[data-install-tab]")];
  const panels = [...card.querySelectorAll("[data-install-panel]")];

  const select = (os, focus = false) => {
    tabs.forEach(tab => {
      const active = tab.dataset.installTab === os;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.installPanel !== os; });
  };

  // Start on the visitor's own platform; Linux covers everything else.
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const detected = platform.includes("win") ? "windows" : platform.includes("mac") ? "macos" : "linux";

  card.classList.add("is-tabbed");
  select(detected);

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab.dataset.installTab));
    tab.addEventListener("keydown", event => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length].dataset.installTab, true);
    });
  });
})();
