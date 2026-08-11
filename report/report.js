/* Víbrur Games playtest report page behaviour
   ================================================================
   The form POSTs straight to a form backend (FormSubmit) which
   emails the answers + any attached log file to dromi@vibrur.is.
   This script only adds quality-of-life: answers autosave to this
   browser as the tester types (so they don't lose work), follow-up
   questions that only appear when a tapped answer makes them
   relevant, a floating progress pill, a live answered-counter, a
   file-size guard, and a clear button.
   ================================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "bt-playtest-report-v1";
  var MAX_BYTES = 10 * 1024 * 1024; // FormSubmit free tier: 10 MB total
  var ATTACH_IDLE_TEXT = "screenshots of bugs are welcome here too. " +
    "up to 10 MB total. bigger than that? email it to dromi@vibrur.is " +
    "instead; the rest still sends.";

  var form = document.getElementById("report-form");
  var countEl = document.getElementById("answer-count");
  var btnClear = document.getElementById("btn-clear");
  var btnDownload = document.getElementById("btn-download");
  var fileInput = document.getElementById("q-attach");
  var attachHint = document.getElementById("attach-hint");
  var sendStatus = document.getElementById("send-status");
  var pill = document.getElementById("progress-pill");
  var pillFill = document.getElementById("pp-fill");
  var pillText = document.getElementById("pp-text");

  if (!form) return;

  /* ---- collect / restore (text + radio + checkbox) ---------- */

  function savableFields() {
    return form.querySelectorAll(
      "input[type=text], textarea, input[type=radio], input[type=checkbox]");
  }

  function snapshot() {
    var data = {};
    savableFields().forEach(function (f) {
      if (f.name.charAt(0) === "_") return; // skip FormSubmit control fields
      if (f.type === "radio") {
        if (f.checked) data[f.name] = f.value;
      } else if (f.type === "checkbox") {
        if (f.checked) (data[f.name] = data[f.name] || []).push(f.value);
      } else if (f.value.trim() !== "") {
        data[f.name] = f.value;
      }
    });
    return data;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); }
    catch (e) { /* private mode or quota exceeded: autosave off, form still works */ }
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    Object.keys(data).forEach(function (name) {
      var fields = form.querySelectorAll('[name="' + name + '"]');
      if (!fields.length) return;
      var val = data[name];
      if (fields[0].type === "radio") {
        fields.forEach(function (r) { r.checked = (r.value === val); });
      } else if (fields[0].type === "checkbox") {
        var vals = Array.isArray(val) ? val : [val];
        fields.forEach(function (c) { c.checked = vals.indexOf(c.value) !== -1; });
      } else {
        fields[0].value = val;
      }
    });
  }

  /* ---- follow-ups that appear when relevant ------------------
     A block with data-show-when="field=value a|value b" stays
     hidden until that field's picked answer is one of the listed
     values. Hiding keeps whatever was typed (in case the tester
     flips back), but hidden answers stay out of the counter and
     the exported report. */

  function applyConds() {
    form.querySelectorAll("[data-show-when]").forEach(function (el) {
      var rule = el.getAttribute("data-show-when");
      var eq = rule.indexOf("=");
      if (eq < 0) return;
      var name = rule.slice(0, eq);
      var wanted = rule.slice(eq + 1).split("|");
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      el.hidden = !(checked && wanted.indexOf(checked.value) !== -1);
    });
  }

  /* "none of these" clears the other ticks, and vice versa */
  function applyTickExclusivity(changed) {
    if (!changed || changed.name !== "what_broke" || !changed.checked) return;
    var boxes = form.querySelectorAll('input[name="what_broke"]');
    if (changed.value === "none of these") {
      boxes.forEach(function (b) { if (b !== changed) b.checked = false; });
    } else {
      boxes.forEach(function (b) {
        if (b.value === "none of these") b.checked = false;
      });
    }
  }

  /* ---- answerable units -------------------------------------
     Most .q blocks hold one answer. The setup block holds several,
     each wrapped in a .subq, so the export walks subqs where they
     exist and the .q itself where they don't. The counter, by
     contrast, always counts whole .q blocks: a five-row setup block
     reads as one question to the person filling it in, and inflating
     the total just makes the form look longer than it is. Blocks
     hidden by a data-show-when rule are skipped everywhere. */

  function isVisible(unit) {
    return !unit.closest("[hidden]");
  }

  function unitsIn(sec) {
    var out = [];
    sec.querySelectorAll(".q").forEach(function (q) {
      if (!isVisible(q)) return;
      var subs = q.querySelectorAll(".subq");
      if (subs.length) subs.forEach(function (s) { out.push(s); });
      else out.push(q);
    });
    return out;
  }

  function isAnswered(unit) {
    if (unit.querySelector("input[type=radio]:checked")) return true;
    if (unit.querySelector("input[type=checkbox]:checked")) return true;
    var field = unit.querySelector("input[type=text], textarea");
    return !!(field && field.value.trim() !== "");
  }

  /* ---- answered counter + progress pill ---------------------- */

  var savedTimer = null;
  var savedSuffix = "";

  function updateCount() {
    var total = 0, answered = 0;
    document.querySelectorAll("main section[data-sec]").forEach(function (sec) {
      sec.querySelectorAll(".q").forEach(function (q) {
        if (!isVisible(q)) return;
        total++;
        if (isAnswered(q)) answered++;
      });
    });
    if (countEl) {
      countEl.textContent = "answered " + answered + " of " + total +
        ". every one helps, only your name and build number are required";
    }
    if (pillFill) {
      pillFill.style.width = (total ? Math.round(100 * answered / total) : 0) + "%";
    }
    if (pillText) {
      pillText.textContent = answered + " of " + total + savedSuffix;
    }
  }

  function markSaved() {
    savedSuffix = " · …";
    updateCount();
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      savedSuffix = " · saved";
      updateCount();
    }, 900);
  }

  /* ---- file-size guard -------------------------------------- */

  function totalFileBytes() {
    if (!fileInput || !fileInput.files) return 0;
    var sum = 0;
    for (var i = 0; i < fileInput.files.length; i++) sum += fileInput.files[i].size;
    return sum;
  }

  function fmtMB(bytes) { return (bytes / 1024 / 1024).toFixed(1) + " MB"; }

  function checkFiles() {
    if (!attachHint) return true;
    var bytes = totalFileBytes();
    if (bytes > MAX_BYTES) {
      attachHint.textContent = "that's " + fmtMB(bytes) +
        ", over the 10 MB limit. attach just the newest BetterTogether.log, " +
        "or email the big file to dromi@vibrur.is. (your answers will still send.)";
      attachHint.classList.add("attach-over");
      return false;
    }
    attachHint.classList.remove("attach-over");
    attachHint.textContent = bytes > 0
      ? "attached " + fmtMB(bytes) + ", good to go."
      : ATTACH_IDLE_TEXT;
    return true;
  }

  /* ---- download answers as .txt ------------------------------
     Escape hatch: the form POSTs to a third-party relay we get no
     delivery confirmation from. This lets a tester keep a copy of
     their own answers and send it any way they like. Reads the live
     DOM (not localStorage) so it matches what's on screen. */

  function labelFor(unit) {
    // data-label wins where it exists. It is the one place the exact
    // exported wording is set by hand.
    var explicit = unit.getAttribute("data-label");
    if (explicit) return explicit;
    var el = unit.querySelector(".q-label, .subq-label");
    if (!el) return "(question)";
    var clone = el.cloneNode(true);
    // drop the "(required …)" note; matched by class, not by wording
    clone.querySelectorAll(".req").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    // keep the 1 to 5 anchors, but set them off, because a bare "Fun / 4"
    // in the exported file is unreadable without knowing which end is good.
    clone.querySelectorAll(".hint-inline").forEach(function (n) {
      n.textContent = " (" + n.textContent.replace(/\s+/g, " ").trim() + ")";
    });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function answerFor(unit) {
    var checked = unit.querySelector("input[type=radio]:checked");
    if (checked) return checked.value;
    var ticks = unit.querySelectorAll("input[type=checkbox]:checked");
    if (ticks.length) {
      var vals = [];
      ticks.forEach(function (t) { vals.push(t.value); });
      return vals.join("; ");
    }
    var field = unit.querySelector("input[type=text], textarea");
    if (field && field.value.trim() !== "") return field.value.trim();
    return "";
  }

  function buildReportText() {
    var nameField = document.getElementById("q-name");
    var name = nameField ? nameField.value.trim() : "";
    var ctxField = document.getElementById("browser-context");
    var lines = ["BETTER TOGETHER · PLAYTEST REPORT"];
    if (name) lines.push("From: " + name);
    lines.push("Saved: " + new Date().toString());
    if (ctxField && ctxField.value) lines.push("Filled in from: " + ctxField.value);

    document.querySelectorAll("main section[data-sec]").forEach(function (sec) {
      var block = [];
      unitsIn(sec).forEach(function (unit) {
        var answer = answerFor(unit);
        if (!answer) return; // skipped questions stay out of the file
        block.push(labelFor(unit));
        block.push("    " + answer.replace(/\r?\n/g, "\r\n    "));
        block.push("");
      });
      if (!block.length) return;
      lines.push("", "== " + sec.getAttribute("data-sec").toUpperCase() + " ==", "");
      lines = lines.concat(block);
    });

    if (totalFileBytes() > 0) {
      lines.push("", "(Log files can't ride along in a .txt, so send them separately.)");
    }
    return lines.join("\r\n");
  }

  function downloadReport() {
    var nameField = document.getElementById("q-name");
    var slug = (nameField ? nameField.value.trim() : "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var d = new Date();
    var stamp = d.getFullYear() + "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);

    // ﻿ so Windows Notepad reads the accented characters correctly
    var blob = new Blob(["﻿" + buildReportText()],
      { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "bt-playtest-report" + (slug ? "-" + slug : "") + "-" + stamp + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- browser context ---------------------------------------
     One line about the browser/screen the FORM was filled in on
     (disclosed next to the send button). Deliberately weak
     evidence, since a report typed on a phone says nothing about the
     gaming PC, but it separates "filled in at the desk" from
     "filled in on the couch", and OS strings catch Mac reports. */

  function fillBrowserContext() {
    var el = document.getElementById("browser-context");
    if (!el) return;
    try {
      var parts = [
        navigator.platform || "",
        screen.width > 0 ? screen.width + "×" + screen.height +
          " @" + (window.devicePixelRatio || 1) + "x" : "",
        navigator.language || "",
        (window.Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || "",
        navigator.userAgent || ""
      ];
      el.value = parts.filter(Boolean).join(" · ");
    } catch (e) { /* leave empty; a nicety, not a requirement */ }
  }

  /* ---- wiring ----------------------------------------------- */

  form.addEventListener("input", function () {
    save(); applyConds(); updateCount(); markSaved();
  });
  form.addEventListener("change", function (e) {
    applyTickExclusivity(e.target);
    save(); applyConds(); updateCount(); markSaved();
  });

  if (fileInput) fileInput.addEventListener("change", checkFiles);

  if (pill) {
    pill.addEventListener("click", function () {
      var send = document.querySelector(".send-section");
      if (send) send.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  form.addEventListener("submit", function (e) {
    // Native validation (the required name/build fields) runs first.
    if (!checkFiles()) {
      e.preventDefault();
      if (sendStatus) {
        sendStatus.textContent = "please shrink or remove the attachment first (or email it separately), then hit send again.";
        sendStatus.classList.add("attach-over");
      }
      if (fileInput) fileInput.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // Ride a formatted copy of the whole report along in a hidden field.
    // FormSubmit labels each row by the input's name attribute, so the
    // emailed table is otherwise a wall of "shop_items: …". This gives
    // one readable block at the top. Never let it block the send.
    try {
      var full = document.getElementById("full-report");
      if (full) full.value = buildReportText();
      var subj = document.getElementById("subject-field");
      var nameField = document.getElementById("q-name");
      var buildField = document.getElementById("q-build");
      if (subj) {
        var bits = ["BT playtest"];
        if (nameField && nameField.value.trim()) bits.push(nameField.value.trim());
        if (buildField && buildField.value.trim()) bits.push("build " + buildField.value.trim());
        subj.value = bits.join(" · ");
      }
    } catch (err) { /* formatting is a nicety; the fields still send */ }

    // let it submit natively to FormSubmit; keep answers in storage as a
    // safety net in case the network hiccups (cleared via the clear button).
    if (sendStatus) sendStatus.textContent = "sending…";
  });

  if (btnDownload) {
    btnDownload.addEventListener("click", function () {
      downloadReport();
      if (sendStatus) {
        sendStatus.textContent = "saved a .txt copy of your answers to your downloads folder.";
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      if (!window.confirm("Clear all your answers? This cannot be undone.")) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      form.reset();
      applyConds();
      updateCount();
      checkFiles();
    });
  }

  /* ---- init ------------------------------------------------- */

  fillBrowserContext();
  restore();
  applyConds();
  updateCount();
})();
