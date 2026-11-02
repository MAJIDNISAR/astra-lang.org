// astra-lang.org: the status globe on the home page.
//
// Every feature is a point on a slowly turning sphere, placed along a
// Fibonacci spiral in status order: what works today sits at the north pole,
// plans at the south, so reading top to bottom is reading past to future.
// Nearby points are linked, and small sparks travel the links.
//
// Progressive enhancement: the status list in the HTML is the content. This
// file only adds the globe and the status buttons, and does nothing if the
// data or canvas is missing. With reduced motion there is no spin, spark or
// pulse; the globe still turns by drag or arrow keys.
(function () {
  "use strict";

  var stage = document.querySelector("[data-orb]");
  var dataEl = document.getElementById("orb-data");
  if (!stage || !dataEl) return;
  var canvas = stage.querySelector("canvas");
  if (!canvas || !canvas.getContext) return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  var ctx = canvas.getContext("2d");
  var root = document.documentElement;
  var frame = stage.querySelector(".orb-frame");
  var tip = stage.querySelector(".orb-tip");
  var chipsBox = stage.querySelector(".orb-chips");
  var list = document.querySelector(".status-list");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  // ---- nodes on a Fibonacci sphere, in status order ----
  var nodes = [];
  data.statuses.forEach(function (s) {
    s.items.forEach(function (label) {
      nodes.push({ label: label, status: s.id });
    });
  });
  var count = nodes.length;
  var golden = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach(function (nd, i) {
    var y = -1 + (2 * (i + 0.5)) / count; // -1 = top of the screen
    var r = Math.sqrt(1 - y * y);
    var t = golden * i;
    nd.x = Math.cos(t) * r;
    nd.y = y;
    nd.z = Math.sin(t) * r;
  });

  // Each node links to its three nearest neighbours.
  var edges = [];
  var seen = {};
  nodes.forEach(function (a, i) {
    nodes
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
          edges.push([i, o.j]);
        }
      });
  });

  // ---- colours come from the theme tokens ----
  var TOKEN = {
    works: "--ok",
    shipped: "--accent",
    progress: "--warn",
    next: "--ink-soft",
    planned: "--ink-soft"
  };
  var HOLLOW = { next: true, planned: true };
  var colors = {};
  var monoFont = "monospace";

  function rgb(value) {
    var v = value.trim();
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
    var cs = getComputedStyle(root);
    Object.keys(TOKEN).forEach(function (k) {
      colors[k] = rgb(cs.getPropertyValue(TOKEN[k]));
    });
    ["ink", "rule", "accent", "paper"].forEach(function (k) {
      colors[k] = rgb(cs.getPropertyValue("--" + k));
    });
    monoFont = cs.getPropertyValue("--mono").trim() || "monospace";
  }
  readColors();

  // ---- status buttons ----
  var selected = null;
  var chips = {};
  var names = {};
  data.statuses.forEach(function (s) {
    names[s.id] = s.name;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "orb-chip" + (HOLLOW[s.id] ? " hollow" : "") + (s.id === "planned" ? " dashed" : "");
    b.style.setProperty("--chip-c", "var(" + TOKEN[s.id] + ")");
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="name"></span><span class="n"></span>';
    b.querySelector(".name").textContent = s.name;
    b.querySelector(".n").textContent = s.items.length;
    b.addEventListener("click", function () { select(s.id); });
    chipsBox.appendChild(b);
    chips[s.id] = b;
  });

  function announce(text) {
    var live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(function () { live.textContent = text; }, 30);
  }

  function select(id) {
    selected = selected === id ? null : id;
    Object.keys(chips).forEach(function (k) {
      chips[k].setAttribute("aria-pressed", String(k === selected));
    });
    if (list) {
      list.classList.toggle("filtered", !!selected);
      Array.prototype.forEach.call(list.querySelectorAll("li[data-status]"), function (li) {
        li.classList.toggle("on", li.dataset.status === selected);
      });
    }
    announce(selected ? "Highlighting " + names[selected] : "Showing every status");
    request();
  }

  // ---- view state ----
  var dpr = 1, W = 0, H = 0;
  var yaw = 0.7, pitch = -0.22, vel = 0;
  var dragging = false, moved = 0, lastX = 0, lastY = 0, pointerType = "mouse";
  var hovered = null;
  var visible = true;
  var sparks = [];
  var nextSpark = 0;
  var lastT = 0;
  var running = false;

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

  function project(breath) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var R = Math.min(W, H) * 0.36 * breath;
    var cx0 = W / 2, cy0 = H / 2;
    nodes.forEach(function (nd) {
      var x = nd.x * cy - nd.z * sy;
      var z1 = nd.x * sy + nd.z * cy;
      var y = nd.y * cp - z1 * sp;
      var z = nd.y * sp + z1 * cp;
      var f = 2.8 / (2.8 - z);
      nd.sx = cx0 + x * R * f;
      nd.sy = cy0 + y * R * f;
      nd.depth = (z + 1) / 2; // 0 = back, 1 = front
    });
    return R;
  }

  function dimFactor(nd) {
    return selected && nd.status !== selected ? 0.16 : 1;
  }

  function drawCore(t, R) {
    var cx0 = W / 2, cy0 = H / 2;
    var pulse = motion() ? 0.5 + 0.5 * Math.sin(t / 900) : 0.5;
    var g = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, R * 1.15);
    g.addColorStop(0, css(colors.accent, 0.2 + 0.08 * pulse));
    g.addColorStop(0.45, css(colors.accent, 0.07));
    g.addColorStop(1, css(colors.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx0, cy0, R * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = css(colors.rule, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx0, cy0, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawEdges() {
    ctx.lineWidth = 1;
    edges.forEach(function (e) {
      var a = nodes[e[0]], b = nodes[e[1]];
      var depth = (a.depth + b.depth) / 2;
      var alpha = (0.05 + 0.3 * depth * depth) * Math.min(dimFactor(a), dimFactor(b));
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
      if (!selected || nodes[e[0]].status === selected || nodes[e[1]].status === selected) {
        sparks.push({ e: e, t0: t, dur: 900 + Math.random() * 600, flip: Math.random() < 0.5 });
      }
      nextSpark = t + 140 + Math.random() * 260;
    }
    sparks = sparks.filter(function (s) { return t - s.t0 < s.dur; });
    sparks.forEach(function (s) {
      var k = (t - s.t0) / s.dur;
      var a = nodes[s.e[s.flip ? 1 : 0]], b = nodes[s.e[s.flip ? 0 : 1]];
      var x = a.sx + (b.sx - a.sx) * k, y = a.sy + (b.sy - a.sy) * k;
      var depth = a.depth + (b.depth - a.depth) * k;
      var fade = Math.sin(k * Math.PI) * (0.25 + 0.75 * depth);
      ctx.fillStyle = css(colors.accent, 0.25 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(colors.accent, 0.95 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawNodes(order) {
    order.forEach(function (nd) {
      var c = colors[nd.status];
      var alpha = (0.28 + 0.72 * nd.depth) * dimFactor(nd);
      if (nd.status === "planned") alpha *= 0.7;
      var r = 1.8 + 3 * nd.depth;
      ctx.beginPath();
      ctx.arc(nd.sx, nd.sy, r, 0, Math.PI * 2);
      if (HOLLOW[nd.status]) {
        ctx.fillStyle = css(colors.paper, alpha);
        ctx.fill();
        ctx.strokeStyle = css(c, alpha);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        ctx.fillStyle = css(c, alpha);
        ctx.fill();
      }
      if (nd === hovered) {
        ctx.strokeStyle = css(colors.ink, 0.9);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nd.sx, nd.sy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  // With a status chosen, its front-facing points are labelled.
  function drawLabels(order) {
    if (!selected) return;
    var cx0 = W / 2;
    ctx.font = "11px " + monoFont;
    ctx.textBaseline = "middle";
    order.forEach(function (nd) {
      if (nd.status !== selected || nd.depth < 0.55 || nd === hovered) return;
      var right = nd.sx >= cx0;
      ctx.textAlign = right ? "left" : "right";
      ctx.fillStyle = css(colors.ink, 0.35 + (0.65 * (nd.depth - 0.55)) / 0.45);
      ctx.fillText(nd.label, nd.sx + (right ? 8 : -8), nd.sy);
    });
  }

  function draw(t) {
    var R = project(motion() ? 1 + Math.sin(t / 1400) * 0.012 : 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawCore(t, R);
    drawEdges();
    drawSparks(t);
    var order = nodes.slice().sort(function (p, q) { return p.depth - q.depth; });
    drawNodes(order);
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
      yaw += vel * dt + 0.00011 * dt;
      vel *= Math.pow(0.93, dt / 16);
    } else if (!dragging) {
      vel = 0;
    }
    draw(t);
    if (shouldAnimate()) request();
    else lastT = 0;
  }

  // ---- interaction ----
  function pick(x, y) {
    var best = null, bestD = 14 * 14;
    nodes.forEach(function (nd) {
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
    if (!nd) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = "<span></span><small></small>";
    tip.firstChild.textContent = nd.label;
    tip.lastChild.textContent = names[nd.status];
    tip.style.left = nd.sx + "px";
    tip.style.top = nd.sy + "px";
    tip.classList.toggle("left", nd.sx > W * 0.62);
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

  // A tap or click on a point highlights its status; on touch it also
  // shows the point's name until the next tap.
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
  size();
  request();
})();
