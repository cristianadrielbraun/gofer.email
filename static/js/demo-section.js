(() => {
  const frame = document.querySelector("#gofer-demo-frame");
  const style = document.querySelector("#gofer-demo-style");
  const mode = document.querySelector("#gofer-demo-mode");
  let selected = "mail";
  let mainSection = "mail";
  const screens = [...document.querySelectorAll('[data-demo-screen]')];
  let ready = false;
  let previewVisible = false;
  let pending = {};
  const send = (detail) => {
    if (ready) frame.contentWindow.postMessage({ type: "gofer-demo-control", ...detail }, location.origin);
    else Object.assign(pending, detail);
  };
  const sendVisibility = () => {
    if (ready) frame.contentWindow.postMessage({ type: "gofer-demo-visibility", visible: previewVisible }, location.origin);
  };
  // Lazy iframes can load well before the visitor sees their first list entrance.
  new IntersectionObserver(entries => {
    previewVisible = entries[0].intersectionRatio >= 0.25;
    sendVisibility();
  }, { threshold: [0, 0.25] }).observe(frame);
  style.addEventListener("change", () => send({ style: style.value }));
  mode.addEventListener("change", () => send({ mode: mode.value }));
  screens.forEach(button => button.addEventListener("click", () => {
    send({ section: button.dataset.demoScreen === "main" ? mainSection : button.dataset.demoScreen });
  }));
  window.addEventListener("message", event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.type !== "gofer-demo-state") return;
    if (!ready) {
      ready = true;
      sendVisibility();
      if (Object.keys(pending).length) { send(pending); pending = {}; return; }
    }
    selected = event.data.section;
    if (!selected.startsWith("settings-") && selected !== "compose") mainSection = selected;
    screens.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.demoScreen === (selected.startsWith("settings-") || selected === "compose" ? selected : "main")));
    });
    style.value = event.data.style;
    mode.value = event.data.mode;
    document.querySelector("#gofer-demo-expand").href = `/demo/?section=${selected}&v=${new URL(frame.src).searchParams.get("v") || ""}`;
  });
})();
