// screenshot viewer: arrows, swipe, esc, and the phone's back button closes it
(function () {
  "use strict";

  var links = [].slice.call(document.querySelectorAll(".shots a"));
  var dlg = document.getElementById("viewer");
  if (!links.length || !dlg || !dlg.showModal) return;

  var img = document.getElementById("viewer-img");
  var count = document.getElementById("viewer-count");
  var at = 0;

  function show(i) {
    at = (i + links.length) % links.length;
    img.src = links[at].href;
    img.alt = links[at].querySelector("img").alt;
    count.textContent = (at + 1) + " / " + links.length;
    new Image().src = links[(at + 1) % links.length].href; // warm the next one
  }

  function open(i) {
    show(i);
    dlg.showModal();
    document.documentElement.classList.add("viewer-open");
    history.pushState({ viewer: true }, "");
  }

  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(i);
    });
  });

  dlg.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { show(at + Number(b.dataset.go)); });
  });
  dlg.querySelector(".viewer-close").addEventListener("click", function () { dlg.close(); });

  // esc closes natively; this also runs after the close button and the back button
  dlg.addEventListener("close", function () {
    document.documentElement.classList.remove("viewer-open");
    if (history.state && history.state.viewer) history.back();
  });

  window.addEventListener("popstate", function () {
    if (dlg.open) dlg.close();
  });

  document.addEventListener("keydown", function (e) {
    if (!dlg.open) return;
    if (e.key === "ArrowLeft") show(at - 1);
    if (e.key === "ArrowRight") show(at + 1);
  });

  var sx = 0, sy = 0;
  dlg.addEventListener("touchstart", function (e) {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1));
  });
})();
