/* Víbrur Games site behaviour
   ================================================================
   CONFIG is the only thing you need to edit.
   - socials: paste full profile URLs; empty string = shown dimmed, unclickable
   - team:    add members; empty array = two placeholder frames
   - support: add links (Ko-fi, PayPal, etc.); empty = placeholder button
   ================================================================ */

const CONFIG = {
  socials: {
    instagram: "https://www.instagram.com/vibrur",
    tiktok: "https://www.tiktok.com/@vibrur", // assumed same handle, correct me if TikTok differs
  },
  team: [
    { name: "Drómi Hauksson", role: "executive founder · game director", img: "team/dromi.jpg" },
    { name: "Hrafnar", role: "art director", img: "team/hrafnar_web.jpg" },
    { name: "Greta Kudabaite", role: "executive · qa & culture lead", img: "team/greta_web.jpg" },
  ],
  support: [
    // { label: "ko-fi", url: "https://ko-fi.com/yourpage" },
  ],
};

(function () {
  "use strict";

  const reduceMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- roaming light ----------------------------------------
     Follows the cursor with a slow lag. When there is no input
     for a while (or on touch devices), it wanders on its own. */
  const light = document.getElementById("light");
  if (light) {
    let tx = window.innerWidth * 0.5;
    let ty = window.innerHeight * 0.38;
    let x = tx, y = ty;
    let lastInput = 0;
    let t = Math.PI; // wander phase

    window.addEventListener("pointermove", (e) => {
      tx = e.clientX;
      ty = e.clientY;
      lastInput = performance.now();
    }, { passive: true });

    function tick(now) {
      const idle = now - lastInput > 6000;
      if (idle && !reduceMotion) {
        t += 0.0016;
        tx = window.innerWidth * (0.5 + 0.34 * Math.sin(t * 0.9));
        ty = window.innerHeight * (0.45 + 0.3 * Math.sin(t * 0.57 + 1.3));
      }
      const ease = idle ? 0.006 : 0.04;
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      light.style.transform = "translate(" + x + "px," + y + "px)";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---- dust motes ------------------------------------------- */
  const canvas = document.getElementById("motes");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    let w, h, dpr;
    const motes = [];
    const COUNT = 26;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    for (let i = 0; i < COUNT; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.02 - Math.random() * 0.07,
        a: 0.04 + Math.random() * 0.12,
        p: Math.random() * Math.PI * 2,
      });
    }

    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      for (const m of motes) {
        m.x += m.vx + Math.sin(now * 0.0003 + m.p) * 0.05;
        m.y += m.vy;
        if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
        if (m.x < -4) m.x = w + 4;
        if (m.x > w + 4) m.x = -4;
        ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(now * 0.0008 + m.p));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* ---- Reykjavík clock -------------------------------------- */
  const clock = document.getElementById("clock");
  if (clock) {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Atlantic/Reykjavik",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
    const tickClock = () => { clock.textContent = "64.14°N 21.94°W · " + fmt.format(new Date()); };
    tickClock();
    setInterval(tickClock, 1000);
  }

  /* ---- scroll reveal ---------------------------------------- */
  const revealed = document.querySelectorAll(".reveal");
  if (revealed.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
      }
    }, { threshold: 0.12 });
    revealed.forEach((el) => io.observe(el));
  } else {
    revealed.forEach((el) => el.classList.add("on"));
  }

  /* ---- socials ----------------------------------------------- */
  document.querySelectorAll("[data-social]").forEach((a) => {
    const url = CONFIG.socials[a.dataset.social];
    if (url) {
      a.href = url;
      a.target = "_blank";
      // noreferrer as well as noopener: the destination should not learn which
      // page on this site sent the visitor.
      a.rel = "noopener noreferrer";
    } else {
      a.classList.add("pending");
      a.removeAttribute("href");
    }
  });

  /* ---- team -------------------------------------------------- */
  const grid = document.getElementById("team-grid");
  if (grid) {
    const members = CONFIG.team.length
      ? CONFIG.team
      : [null, null]; // placeholder frames until names/photos are added

    for (const m of members) {
      const card = document.createElement("div");
      card.className = "member";
      if (m) {
        const port = document.createElement("div");
        port.className = "portrait";
        if (m.img) {
          const img = document.createElement("img");
          img.src = m.img;
          img.alt = m.name;
          port.appendChild(img);
        } else {
          port.classList.add("empty");
        }
        const name = document.createElement("p");
        name.className = "name";
        name.textContent = m.name;
        const role = document.createElement("p");
        role.className = "role";
        role.textContent = m.role || "";
        card.append(port, name, role);
      } else {
        card.innerHTML =
          '<div class="portrait empty"></div>' +
          '<p class="name"><span class="bar"></span></p>' +
          '<p class="role"><span class="bar"></span></p>';
      }
      grid.appendChild(card);
    }
  }

  /* ---- support buttons --------------------------------------- */
  const supportWrap = document.getElementById("support-options");
  if (supportWrap) {
    if (CONFIG.support.length) {
      for (const d of CONFIG.support) {
        const a = document.createElement("a");
        a.className = "support-btn";
        a.href = d.url;
        a.target = "_blank";
        // noreferrer as well as noopener: the destination should not learn which
      // page on this site sent the visitor.
      a.rel = "noopener noreferrer";
        a.textContent = d.label;
        supportWrap.appendChild(a);
      }
    } else {
      const ghost = document.createElement("span");
      ghost.className = "support-btn ghost";
      ghost.textContent = "· · ·";
      supportWrap.appendChild(ghost);
    }
  }
})();
