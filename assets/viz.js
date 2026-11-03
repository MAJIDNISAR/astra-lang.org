// astra-lang.org: 3D charts read from assets/status.json.
//
//   <figure data-viz="releases">  every release as a column, as tall as its tests
//   <figure data-viz="memory">    peak memory before and after, per program
//
// Solid boxes on a ground plane, drawn with a perspective projection on a 2D
// canvas (painter's algorithm, three shaded faces). Drag or Shift+arrows to
// turn; Left/Right step through the columns. Each figure starts `hidden` and
// is shown only once it can draw; the table after it is the content either way.
(function () {
  "use strict";

  var figures = document.querySelectorAll("figure[data-viz]");
  if (!figures.length || !window.fetch) return;

  fetch("assets/status.json")
    .then(function (r) { return r.json(); })
    .then(function (status) {
      Array.prototype.forEach.call(figures, function (fig) {
        var kind = fig.getAttribute("data-viz");
        var cols = kind === "releases" ? releaseColumns(status) : kind === "memory" ? memoryColumns(status) : null;
        if (cols && cols.length) chart(fig, cols, kind);
      });
    })
    .catch(function () { /* the tables stay; nothing to draw */ });

  // ---- data → columns ----
  function releaseColumns(status) {
    var max = 0;
    status.releases.forEach(function (r) { if (r.tests > max) max = r.tests; });
    var lastReal = null;
    status.releases.forEach(function (r) { if (!r.unreleased) lastReal = r.version; });
    return status.releases.map(function (r, i) {
      var measured = typeof r.tests === "number";
      return {
        x: i * 1.5,
        z: 0,
        w: 1,
        h: measured ? 0.4 + (r.tests / max) * 6 : 0.9,
        tone: r.unreleased ? "orange" : r.version === lastReal ? "ink" : "soft",
        ghost: !measured,
        label: r.unreleased ? "main" : r.version,
        value: measured ? String(r.tests) : "",
        title: (r.unreleased ? "main (not released)" : r.version) + " · " + r.date,
        detail: (measured ? r.tests + " tests. " : "No test count recorded. ") + r.summary
      };
    });
  }

  function memoryColumns(status) {
    var max = 0;
    status.memory.cases.forEach(function (c) { if (c.before > max) max = c.before; });
    var unit = status.memory.unit;
    var out = [];
    status.memory.cases.forEach(function (c, i) {
      var title = c.name;
      out.push({
        x: i * 3.4, z: 0, w: 1.2, h: 0.08 + (c.before / max) * 6, grow: 0,
        tone: "soft", label: "before", value: c.before + " MB",
        title: title, detail: "Before: " + c.before + " " + unit + ". After: " + c.after + " " + unit + "."
      });
      out.push({
        x: i * 3.4 + 1.4, z: 0, w: 1.2, h: 0.08 + (c.after / max) * 6, grow: 1,
        tone: "orange", label: "after", value: c.after + " MB",
        title: title, detail: "Before: " + c.before + " " + unit + ". After: " + c.after + " " + unit + "."
      });
    });
    return out;
  }

  // ---- one chart ----
  function chart(fig, cols, kind) {
    var frame = fig.querySelector(".viz-frame");
    var canvas = frame && frame.querySelector("canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var panel = document.createElement("div");
    panel.className = "viz-panel";
    panel.hidden = true;
    frame.appendChild(panel);
    var live = document.createElement("p");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    fig.appendChild(live);

    // centre the scene on the origin
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    cols.forEach(function (c) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + c.w);
      minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z + c.w);
    });
    var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    var span = Math.max(maxX - minX, maxZ - minZ, 6);

    var yaw = -0.42, pitch = 0.42, vel = 0;
    var W = 0, H = 0, dpr = 1, scale = 1;
    var selected = -1, hovered = -1;
    var dragging = false, lastX = 0, lastY = 0, moved = 0;
    var grown = reduce.matches ? 1 : 0, growing = false, growStart = 0;
    var visible = true, running = false, lastT = 0;
    var colors = {}, font = "sans-serif";

    function rgb(v) {
      v = (v || "").trim();
      var m = /^#([0-9a-f]{6})$/i.exec(v);
      if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
      m = /rgba?\(([^)]+)\)/.exec(v);
      return m ? m[1].split(",").slice(0, 3).map(parseFloat) : [128, 128, 128];
    }
    function css(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
    function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k].map(Math.round); }
    function readColors() {
      var cs = getComputedStyle(fig);
      ["ink", "ink-soft", "paper", "paper-2", "orange", "rule"].forEach(function (k) {
        colors[k] = rgb(cs.getPropertyValue("--" + k));
      });
      colors.soft = colors["ink-soft"];
      font = cs.getPropertyValue("--font-text").trim() || "sans-serif";
    }
    readColors();

    function size() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      var tallest = 0;
      cols.forEach(function (c) { if (c.h > tallest) tallest = c.h; });
      scale = Math.min(Math.min(W, H * 1.6) / (span * 1.25), (H * 0.52) / tallest);
    }

    // world → screen
    function project(x, y, z) {
      x -= cx; z -= cz;
      var c = Math.cos(yaw), s = Math.sin(yaw);
      var rx = x * c - z * s, rz = x * s + z * c;
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var ry = y * cp - rz * sp, rz2 = y * sp + rz * cp;
      var f = 1 / (1 + rz2 / (span * 2.2));
      return { x: W / 2 + rx * scale * f, y: H * (W < 600 ? 0.6 : 0.68) - ry * scale * f, d: rz2 };
    }

    function heightOf(c) {
      if (kind !== "memory") return c.h * easeOut(grown);
      var t = c.grow ? Math.max(0, grown * 2 - 1) : Math.min(1, grown * 2);
      return Math.max(0.02, c.h * easeOut(t));
    }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function boxFaces(c, i) {
      var h = heightOf(c), x0 = c.x, x1 = c.x + c.w, z0 = c.z, z1 = c.z + c.w;
      var P = [
        project(x0, 0, z0), project(x1, 0, z0), project(x1, 0, z1), project(x0, 0, z1),
        project(x0, h, z0), project(x1, h, z0), project(x1, h, z1), project(x0, h, z1)
      ];
      var faces = [
        { idx: [4, 5, 6, 7], k: 1.18, top: true },
        { idx: [0, 1, 5, 4], k: 1 }, { idx: [1, 2, 6, 5], k: 0.78 },
        { idx: [2, 3, 7, 6], k: 1 }, { idx: [3, 0, 4, 7], k: 0.78 }
      ];
      var depth = 0;
      P.forEach(function (p) { depth += p.d; });
      return { i: i, P: P, faces: faces, depth: depth / 8, col: c };
    }

    function facing(P, idx) {
      var a = P[idx[0]], b = P[idx[1]], c = P[idx[2]];
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // ground
      var pad = 0.8, g = [
        project(minX - pad, 0, minZ - pad), project(maxX + pad, 0, minZ - pad),
        project(maxX + pad, 0, maxZ + pad), project(minX - pad, 0, maxZ + pad)
      ];
      ctx.fillStyle = css(colors.rule, 0.55);
      ctx.beginPath();
      g.forEach(function (p, j) { if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath();
      ctx.fill();

      var boxes = cols.map(boxFaces).sort(function (a, b) { return b.depth - a.depth; });
      boxes.forEach(function (b) {
        var c = b.col, base = colors[c.tone] || colors.soft;
        var dim = selected >= 0 && selected !== b.i && hovered !== b.i ? 0.45 : 1;
        b.faces.forEach(function (f) {
          if (!facing(b.P, f.idx)) return;
          ctx.beginPath();
          f.idx.forEach(function (n, j) { var p = b.P[n]; if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.closePath();
          if (c.ghost) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = css(base, 0.8 * dim);
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            var k = f.k;
            var col = c.tone === "orange" || c.tone === "ink" ? shade(base, Math.min(k, 1.0) * (f.top ? 1 : 1)) : shade(base, k);
            if (f.top && c.tone !== "orange") col = [Math.min(255, base[0] + 40), Math.min(255, base[1] + 40), Math.min(255, base[2] + 40)];
            if (f.top && c.tone === "orange") col = [255, 160, 96];
            ctx.fillStyle = css(col, dim);
            ctx.fill();
          }
        });
        if (b.i === hovered || b.i === selected) {
          ctx.strokeStyle = css(colors.orange, 1);
          ctx.lineWidth = 2;
          ctx.beginPath();
          [4, 5, 6, 7, 4].forEach(function (n, j) { var p = b.P[n]; if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.stroke();
        }
      });

      // labels: value above each column, name on the ground in front
      ctx.textAlign = "center";
      cols.forEach(function (c) {
        var h = heightOf(c);
        var top = project(c.x + c.w / 2, h, c.z + c.w / 2);
        var foot = project(c.x + c.w / 2, 0, c.z + c.w + 0.35);
        if (c.value && grown > 0.6) {
          ctx.font = "700 " + (W < 600 ? 11 : 13) + "px " + font;
          ctx.textBaseline = "bottom";
          ctx.fillStyle = css(colors.ink, 0.95);
          ctx.fillText(c.value, top.x, top.y - 6);
        }
        if (c.label && !(W < 600 && c.ghost)) {
          ctx.font = "500 " + (W < 600 ? 11 : 12) + "px " + font;
          ctx.fillStyle = css(colors["ink-soft"], 1);
          if (W < 600) {
            // Narrow screens: labels run at an angle so neighbours never collide.
            ctx.save();
            ctx.translate(foot.x, foot.y);
            ctx.rotate(-0.9);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(c.label, 0, 0);
            ctx.restore();
            ctx.textAlign = "center";
          } else {
            ctx.textBaseline = "top";
            ctx.fillText(c.label, foot.x, foot.y);
          }
        }
      });
    }

    function showPanel(i) {
      if (i < 0) { panel.hidden = true; return; }
      var c = cols[i];
      panel.innerHTML = "<b></b><span></span>";
      panel.firstChild.textContent = c.title;
      panel.lastChild.textContent = c.detail;
      panel.hidden = false;
    }

    function pick(x, y) {
      var best = -1, bestD = Infinity;
      cols.map(boxFaces).forEach(function (b) {
        var xs = b.P.map(function (p) { return p.x; }), ys = b.P.map(function (p) { return p.y; });
        if (x >= Math.min.apply(null, xs) - 4 && x <= Math.max.apply(null, xs) + 4 &&
            y >= Math.min.apply(null, ys) - 4 && y <= Math.max.apply(null, ys) + 4 && b.depth < bestD) {
          bestD = b.depth;
          best = b.i;
        }
      });
      return best;
    }

    // ---- loop ----
    function request() {
      if (!running) { running = true; window.requestAnimationFrame(tick); }
    }
    function tick(t) {
      running = false;
      var dt = lastT ? Math.min(50, t - lastT) : 16;
      lastT = t;
      var moving = false;
      if (growing) {
        grown = Math.min(1, (t - growStart) / 1400);
        if (grown >= 1) growing = false; else moving = true;
      }
      if (!dragging && !reduce.matches && hovered < 0) {
        yaw += vel * dt + 0.00005 * dt;
        vel *= Math.pow(0.92, dt / 16);
        moving = true;
      }
      draw();
      if ((moving || dragging) && visible && !document.hidden) request();
      else lastT = 0;
    }

    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; vel = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      request();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (dragging) {
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.007;
        pitch = Math.max(0.12, Math.min(1.1, pitch + dy * 0.005));
        vel = (dx * 0.007) / 16;
        request();
        return;
      }
      var r = canvas.getBoundingClientRect();
      var i = pick(e.clientX - r.left, e.clientY - r.top);
      if (i !== hovered) { hovered = i; showPanel(i >= 0 ? i : selected); request(); }
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      if (moved < 6 && e.type === "pointerup") {
        var r = canvas.getBoundingClientRect();
        var i = pick(e.clientX - r.left, e.clientY - r.top);
        selected = i === selected ? -1 : i;
        showPanel(selected);
      }
      request();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", function () {
      if (dragging) return;
      hovered = -1; showPanel(selected); request();
    });
    canvas.addEventListener("keydown", function (e) {
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        yaw += e.key === "ArrowLeft" ? -0.15 : 0.15;
      } else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        pitch = Math.max(0.12, Math.min(1.1, pitch + (e.key === "ArrowUp" ? 0.1 : -0.1)));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        var n = cols.length;
        selected = selected < 0 ? (e.key === "ArrowLeft" ? n - 1 : 0) : (selected + (e.key === "ArrowLeft" ? -1 : 1) + n) % n;
        showPanel(selected);
        live.textContent = cols[selected].title + ". " + cols[selected].detail;
      } else if (e.key === "Escape") {
        selected = -1; showPanel(-1);
      } else {
        return;
      }
      e.preventDefault();
      request();
    });

    new MutationObserver(function () { readColors(); request(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var dark = window.matchMedia("(prefers-color-scheme: dark)");
    if (dark.addEventListener) dark.addEventListener("change", function () { readColors(); request(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && grown === 0 && !growing) { growing = true; growStart = performance.now(); }
        if (visible) request();
      }, { threshold: 0.25 }).observe(canvas);
    } else {
      grown = 1;
    }
    if ("ResizeObserver" in window) new ResizeObserver(function () { size(); request(); }).observe(frame);
    else window.addEventListener("resize", function () { size(); request(); });

    fig.hidden = false;
    size();
    request();
  }
})();
