function animateSectionContent(section) {
  if (!section || typeof section.animate !== "function" ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return
  section.animate([
    { opacity: 0, transform: "translateY(5px)" },
    { opacity: 1, transform: "translateY(0)" },
  ], { duration: 180, easing: "ease-out" })
}
