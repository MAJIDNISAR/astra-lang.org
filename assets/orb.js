// astra-lang.org: the status globe, drawn like a celestial globe.
//
// Every Astra feature is a star on a slowly turning sphere, placed along a
// Fibonacci spiral in status order: what works today sits at the north pole,
// plans at the south, so reading top to bottom is reading past to future.
// Status is shown the way a star atlas shows magnitude: the brightest, largest
// stars work today; faint dotted ones are planned. Nearby stars are joined
// like constellations, and sparks travel the links.
//
// Mifa, the package manager, is a moon on an inclined orbit with its own
// features as stars (figure attribute data-moon="mifa").
//
// The data is the JSON in `script.orb-data[data-for=…]` (generated from
// assets/status.json by tools/sync-status.mjs). Progressive enhancement: the
// status lists in the HTML are the content; this file only adds the globe and
// the status keys. With reduced motion nothing drifts; drag and arrow keys
// still turn it.
(function () {
  "use strict";

  var stages = document.querySelectorAll("[data-orb]");
  Array.prototype.forEach.call(stages, setup);

  function readData(name) {
    var el = document.querySelector('script.orb-data[data-for="' + name + '"]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function setup(stage) {
    var canvas = stage.querySelector("canvas");
    if (!canvas || !canvas.getContext) return;
    var planetName = stage.getAttribute("data-orb") || "astra";
    var moonName = stage.getAttribute("data-moon");
    var data = readData(planetName);
    if (!data) return;
    var moonData = moonName ? readData(moonName) : null;
    var rise = stage.hasAttribute("data-rise");

    var ctx = canvas.getContext("2d");
    var root = document.documentElement;
    var frame = stage.querySelector(".orb-frame");
    var tip = stage.querySelector(".orb-tip");
    var section = stage.closest("section");
    var keyBox = stage.querySelector(".orb-keys") || (section && section.querySelector(".orb-keys"));
    var lists = document.querySelectorAll(".status-list");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)");

    // Magnitude per status: radius in px at the front of the sphere.
    var MAG = { works: 4.4, shipped: 3.8, progress: 3.3, next: 2.8, planned: 2.3 };
    var HOLLOW = { next: true, planned: true };

    // ---- stars on a Fibonacci sphere, in status order ----
    function sphere(statuses, body) {
      var list = [];
      statuses.forEach(function (s) {
        s.items.forEach(function (label) {
          list.push({ label: label, status: s.id, body: body });
        });
      });
      var n = list.length;
      var golden = Math.PI * (3 - Math.sqrt(5));
      list.forEach(function (nd, i) {
        var y = -1 + (2 * (i + 0.5)) / n; // -1 = top of the screen
        var r = Math.sqrt(1 - y * y);
        var t = golden * i;
        nd.x = Math.cos(t) * r;
        nd.y = y;
        nd.z = Math.sin(t) * r;
      });
      return list;
    }

    function link(list) {
      var edges = [];
      var seen = {};
      list.forEach(function (a, i) {
        list
          .map(function (b, j) {
            var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
            return { j: j, d: dx * dx + dy * dy + dz * dz };
          })
          .filter(function (o) { return o.j !== i; })
          .sort(function (p, q) { return p.d - q.d; })
          .slice(0, 3)
          .forEach(function (o) {
            var key = i < o.j ? i + "-" + o.j : o.j + "-" + i;
            if (!seen[key]) {
              seen[key] = true;
              edges.push([list[i], list[o.j]]);
            }
          });
      });
      return edges;
    }

    var planet = sphere(data.statuses, "planet");
    var moon = moonData ? sphere(moonData.statuses, "moon") : [];
    var edges = link(planet).concat(link(moon));
    var all = planet.concat(moon);

    // ---- colours come from the tokens of the section the globe sits in ----
    var TOKEN = {
      works: "--ink",
      shipped: "--orange",
      progress: "--progress-c",
      next: "--ink-soft",
      planned: "--ink-soft"
    };
    var colors = {};
    var font = "sans-serif";

    function rgb(value) {
      var v = (value || "").trim();
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
      if (m) {
        var h = m[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      m = /rgba?\(([^)]+)\)/.exec(v);
      if (m) return m[1].split(",").slice(0, 3).map(function (n) { return parseFloat(n); });
      return [128, 128, 128];
    }
    function css(c, a) {
      return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
    }
    function readColors() {
      var cs = getComputedStyle(stage);
      Object.keys(TOKEN).forEach(function (k) {
        colors[k] = rgb(cs.getPropertyValue(TOKEN[k]));
      });
      ["ink", "ink-soft", "paper", "paper-2", "orange"].forEach(function (k) {
        colors[k] = rgb(cs.getPropertyValue("--" + k));
      });
      font = cs.getPropertyValue("--font-text").trim() || "sans-serif";
    }
    readColors();

    // ---- status keys (a magnitude key, like an atlas plate's legend) ----
    var selected = null;
    var keys = {};
    var names = {};
    var counts = {};
    all.forEach(function (nd) { counts[nd.status] = (counts[nd.status] || 0) + 1; });
    data.statuses.forEach(function (s) {
      names[s.id] = s.name;
      if (!keyBox) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "orb-key";
      b.dataset.status = s.id;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="star" aria-hidden="true"></span><span class="name"></span><span class="n"></span>';
      b.querySelector(".name").textContent = s.name;
      b.querySelector(".n").textContent = counts[s.id] || 0;
      b.addEventListener("click", function () { select(s.id); });
      keyBox.appendChild(b);
      keys[s.id] = b;
    });

    function announce(text) {
      var live = document.getElementById("live");
      if (!live) return;
      live.textContent = "";
      window.setTimeout(function () { live.textContent = text; }, 30);
    }

    function select(id) {
      selected = selected === id ? null : id;
      Object.keys(keys).forEach(function (k) {
        keys[k].setAttribute("aria-pressed", String(k === selected));
      });
      Array.prototype.forEach.call(lists, function (list) {
        list.classList.toggle("filtered", !!selected);
        Array.prototype.forEach.call(list.querySelectorAll("li[data-status]"), function (li) {
          li.classList.toggle("on", li.dataset.status === selected);
        });
      });
      announce(selected ? "Highlighting " + names[selected] : "Showing every status");
      request();
    }

    // ---- view state ----
    var dpr = 1, W = 0, H = 0;
    var yaw = 0.7, pitch = -0.28, vel = 0;
    var dragging = false, moved = 0, lastX = 0, lastY = 0, pointerType = "mouse";
    var hovered = null;
    var visible = true;
    var sparks = [];
    var nextSpark = 0;
    var lastT = 0;
    var running = false;
    var orbit = 0.9; // the moon's place on its orbit
    var center = { x: 0, y: 0, R: 0 };

    function size() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    function motion() {
      return !reduce.matches;
    }

    function rotate(nd, cx, cy, R) {
      var cyw = Math.cos(yaw), syw = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x = nd.x * cyw - nd.z * syw;
      var z1 = nd.x * syw + nd.z * cyw;
      var y = nd.y * cp - z1 * sp;
      var z = nd.y * sp + z1 * cp;
      var f = 2.8 / (2.8 - z);
      nd.sx = cx + x * R * f;
      nd.sy = cy + y * R * f;
      nd.depth = (z + 1) / 2; // 0 = back, 1 = front
    }

    function layout(breath) {
      var R, cx = W / 2, cy;
      if (rise) {
        // The globe rises from the bottom edge: its lower part is cut off.
        // The globe rises from the bottom edge: its top is whole, its
        // lower part is cut off by the frame.
        R = Math.min(W * 0.34, H * 0.8) * breath;
        cy = R * 1.06 + 8;
      } else {
        R = Math.min(W, H) * (moon.length ? 0.3 : 0.36) * breath;
        cy = H / 2;
      }
      center = { x: cx, y: cy, R: R };
      planet.forEach(function (nd) { rotate(nd, cx, cy, R); });
      if (moon.length) {
        // An inclined circular orbit around the planet, seen in perspective.
        var oR = R * 1.32;
        // The orbit passes over the planet's upper half, clear of the
        // corners where the hero's text sits.
        var ox = Math.cos(orbit) * oR;
        var oz = Math.sin(orbit) * oR;
        var oy = -Math.sin(orbit) * R * 0.22 - R * 0.62;
        var f = 2.8 / (2.8 - oz / R * 0.55);
        var mR = R * 0.27 * f;
        var mx = cx + ox * f, my = Math.max(cy + oy * f, mR * 1.1 + 6);
        moon.mz = oz;
        moon.cx = mx;
        moon.cy = my;
        moon.R = mR;
        moon.forEach(function (nd) { rotate(nd, mx, my, mR); });
      }
      return R;
    }

    function dimFactor(nd) {
      return selected && nd.status !== selected ? 0.14 : 1;
    }

    // The planet body: a flat disc one step lighter than the field.
    function drawBody(cx, cy, R, alpha) {
      ctx.fillStyle = css(colors["paper-2"], alpha);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawEdges(list) {
      ctx.lineWidth = 1;
      list.forEach(function (e) {
        var a = e[0], b = e[1];
        var depth = (a.depth + b.depth) / 2;
        var alpha = (0.06 + 0.34 * depth * depth) * Math.min(dimFactor(a), dimFactor(b));
        ctx.strokeStyle = css(colors.ink, alpha);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      });
    }

    // Sparks: short pulses travelling along links, the "thinking".
    function drawSparks(t) {
      if (!motion()) return;
      if (t > nextSpark) {
        var e = edges[(Math.random() * edges.length) | 0];
        if (e && (!selected || e[0].status === selected || e[1].status === selected)) {
          sparks.push({ e: e, t0: t, dur: 900 + Math.random() * 600, flip: Math.random() < 0.5 });
        }
        nextSpark = t + 120 + Math.random() * 220;
      }
      sparks = sparks.filter(function (s) { return t - s.t0 < s.dur; });
      sparks.forEach(function (s) {
        var k = (t - s.t0) / s.dur;
        var a = s.e[s.flip ? 1 : 0], b = s.e[s.flip ? 0 : 1];
        var x = a.sx + (b.sx - a.sx) * k, y = a.sy + (b.sy - a.sy) * k;
        var depth = a.depth + (b.depth - a.depth) * k;
        var fade = Math.sin(k * Math.PI) * (0.25 + 0.75 * depth);
        ctx.fillStyle = css(colors.orange, 0.95 * fade);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawStar(nd, scale) {
      var c = colors[nd.status];
      var alpha = (0.3 + 0.7 * nd.depth) * dimFactor(nd);
      var r = (MAG[nd.status] || 3) * (0.55 + 0.45 * nd.depth) * scale;
      ctx.beginPath();
      ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2);
      if (HOLLOW[nd.status]) {
        if (nd.status === "planned") ctx.setLineDash([1.5, 2]);
        ctx.strokeStyle = css(c, alpha);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = css(c, alpha);
        ctx.fill();
      }
      if (nd === hovered) {
        ctx.strokeStyle = css(colors.orange, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nd.sx, nd.sy, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // With a status chosen, its front-facing stars are labelled.
    function drawLabels(order) {
      if (!selected) return;
      ctx.font = "500 13px " + font;
      ctx.textBaseline = "middle";
      order.forEach(function (nd) {
        if (nd.status !== selected || nd.depth < 0.55 || nd === hovered) return;
        var cx = nd.body === "moon" ? moon.cx : center.x;
        var right = nd.sx >= cx;
        ctx.textAlign = right ? "left" : "right";
        ctx.fillStyle = css(colors.ink, 0.4 + (0.6 * (nd.depth - 0.55)) / 0.45);
        ctx.fillText(nd.label, nd.sx + (right ? 9 : -9), nd.sy);
      });
    }

    function drawMoon(order) {
      if (!moon.length) return;
      // The moon is one tone lighter than the planet, so the two never merge.
      ctx.fillStyle = css(colors.ink, 0.12);
      ctx.beginPath();
      ctx.arc(moon.cx, moon.cy, moon.R * 1.04, 0, Math.PI * 2);
      ctx.fill();
      drawBody(moon.cx, moon.cy, moon.R, 0.85);
      drawEdges(edges.filter(function (e) { return e[0].body === "moon"; }));
      order.forEach(function (nd) { if (nd.body === "moon") drawStar(nd, 0.62); });
      ctx.font = "700 13px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = css(colors.ink, 0.75);
      ctx.fillText("Mifa", moon.cx, moon.cy + moon.R + 8);
    }

    function draw(t) {
      var breath = motion() ? 1 + Math.sin(t / 1600) * 0.01 : 1;
      layout(breath);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var order = all.slice().sort(function (p, q) { return p.depth - q.depth; });
      var moonBehind = moon.length && moon.mz < 0;
      if (moonBehind) drawMoon(order);
      drawBody(center.x, center.y, center.R, 1);
      drawEdges(edges.filter(function (e) { return e[0].body === "planet"; }));
      drawSparks(t);
      order.forEach(function (nd) { if (nd.body === "planet") drawStar(nd, 1); });
      if (moon.length && !moonBehind) drawMoon(order);
      drawLabels(order);
    }

    // ---- animation loop: runs only while visible and allowed to move ----
    function shouldAnimate() {
      return visible && !document.hidden && (motion() || dragging);
    }

    function request() {
      if (!running) {
        running = true;
        window.requestAnimationFrame(tick);
      }
    }

    function tick(t) {
      running = false;
      var dt = lastT ? Math.min(50, t - lastT) : 16;
      lastT = t;
      if (!dragging && motion()) {
        yaw += vel * dt + (hovered ? 0.00003 : 0.00011) * dt;
        vel *= Math.pow(0.93, dt / 16);
        orbit += 0.00016 * dt;
      } else if (!dragging) {
        vel = 0;
      }
      draw(t);
      if (shouldAnimate()) request();
      else lastT = 0;
    }

    // ---- interaction ----
    function pick(x, y) {
      var best = null, bestD = 16 * 16;
      all.forEach(function (nd) {
        if (nd.depth < 0.4) return;
        var dx = nd.sx - x, dy = nd.sy - y, d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = nd;
        }
      });
      return best;
    }

    function local(ev) {
      var rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    function showTip(nd) {
      if (!tip) return;
      if (!nd) {
        tip.hidden = true;
        return;
      }
      tip.innerHTML = "<span></span><small></small>";
      tip.firstChild.textContent = nd.label;
      tip.lastChild.textContent = (nd.body === "moon" ? "Mifa · " : "Astra · ") + names[nd.status];
      tip.style.left = nd.sx + "px";
      tip.style.top = nd.sy + "px";
      tip.classList.toggle("left", nd.sx > W * 0.6);
      tip.hidden = false;
    }

    canvas.addEventListener("pointerdown", function (ev) {
      dragging = true;
      moved = 0;
      pointerType = ev.pointerType;
      lastX = ev.clientX;
      lastY = ev.clientY;
      vel = 0;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      request();
    });

    canvas.addEventListener("pointermove", function (ev) {
      if (dragging) {
        var dx = ev.clientX - lastX, dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.008;
        pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.006));
        vel = (dx * 0.008) / 16;
        showTip(null);
        request();
        return;
      }
      var p = local(ev);
      var nd = pick(p.x, p.y);
      if (nd !== hovered) {
        hovered = nd;
        canvas.style.cursor = nd ? "pointer" : "";
        request();
      }
      showTip(nd);
    });

    // A tap or click on a star highlights its status; on touch it also
    // shows the star's name until the next tap.
    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      if (moved < 6 && ev.type === "pointerup") {
        var p = local(ev);
        var nd = pick(p.x, p.y);
        if (nd) {
          select(nd.status);
          if (pointerType === "touch") {
            hovered = nd;
            showTip(nd);
          }
        } else if (pointerType === "touch") {
          hovered = null;
          showTip(null);
        }
      }
      request();
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", function () {
      if (dragging || pointerType === "touch") return;
      hovered = null;
      showTip(null);
      request();
    });

    canvas.addEventListener("keydown", function (ev) {
      var step = 0.18;
      if (ev.key === "ArrowLeft") yaw -= step;
      else if (ev.key === "ArrowRight") yaw += step;
      else if (ev.key === "ArrowUp") pitch = Math.max(-1.1, pitch - step);
      else if (ev.key === "ArrowDown") pitch = Math.min(1.1, pitch + step);
      else return;
      ev.preventDefault();
      request();
    });

    // ---- lifecycle ----
    function refreshColors() {
      readColors();
      request();
    }
    new MutationObserver(refreshColors).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    if (systemDark.addEventListener) systemDark.addEventListener("change", refreshColors);
    if (reduce.addEventListener) reduce.addEventListener("change", request);
    document.addEventListener("visibilitychange", request);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) request();
      }).observe(canvas);
    }
    function resized() {
      size();
      request();
    }
    if ("ResizeObserver" in window) new ResizeObserver(resized).observe(frame);
    else window.addEventListener("resize", resized);

    stage.hidden = false;
    stage.setAttribute("data-ui", "");
    size();
    request();
  }
})();
