(function () {
  "use strict";
  if (!window.L) return;

  const css = document.createElement("style");
  css.textContent = ".ctrl-zoom-hint{position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(58,52,44,.5);color:#fff;font:600 13px 'Libre Franklin',sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}.ctrl-zoom-hint.on{opacity:1}";
  document.head.appendChild(css);

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const en = (document.documentElement.lang || "").toLowerCase().startsWith("en");
  const key = mac ? "⌘" : "Ctrl";
  const text = en ? "Use " + key + " + scroll to zoom the map" : "Tekan " + key + " + scroll untuk zoom peta";

  L.Map.addInitHook(function () {
    if (!this.options.scrollWheelZoom) return;
    const el = this.getContainer();
    const hint = L.DomUtil.create("div", "ctrl-zoom-hint", el);
    hint.textContent = text;
    let timer;
    el.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.metaKey) {
        hint.classList.remove("on");
        return;
      }
      e.stopPropagation();
      hint.classList.add("on");
      clearTimeout(timer);
      timer = setTimeout(function () { hint.classList.remove("on"); }, 1200);
    }, { capture: true, passive: true });
  });
})();
