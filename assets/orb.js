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
// features as stars (figure attribute data-moon="mifa"). Like the Earth and
// the Moon, the two turn at their own rates, and each can be dragged on its
// own: a drag grabs whichever body is under the pointer. The moon's orbit is
// a real 3D one (it never passes through the planet), fastest where it is
// closest, and spinning the planet tugs the moon along.
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
    var title = function (name) { return name ? name.charAt(0).toUpperCase() + name.slice(1) : ""; };
    var planetLabel = title(planetName);
    var moonLabel = title(moonName);
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
      var points = [];
      for (var i = 0; i < n; i++) {
        var y = -1 + (2 * (i + 0.5)) / n; // -1 = top of the screen
        var r = Math.sqrt(1 - y * y);
        var t = golden * i;
        points.push({ x: Math.cos(t) * r, y: y, z: Math.sin(t) * r, free: true });
      }
      // Each status takes a compact patch, so a key turns one area to the
      // viewer: the newest features at the heart of what works today, the
      // next steps at the heart of the plan, on the far side.
      var NOW = { x: 0.25, y: -0.45, z: 0.86 };
      var LATER = { x: -NOW.x, y: -NOW.y, z: -NOW.z };
      var around = { shipped: NOW, works: NOW, next: LATER, planned: LATER };
      ["shipped", "next", "planned", "works"].forEach(function (id) {
        var c = around[id];
        var members = list.filter(function (nd) { return nd.status === id; });
        var near = points
          .filter(function (pt) { return pt.free; })
          .sort(function (p, q) {
            var dp = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) + (p.z - c.z) * (p.z - c.z);
            var dq = (q.x - c.x) * (q.x - c.x) + (q.y - c.y) * (q.y - c.y) + (q.z - c.z) * (q.z - c.z);
            return dp - dq;
          });
        members.forEach(function (nd, k) {
          var pt = near[k];
          pt.free = false;
          nd.x = pt.x;
          nd.y = pt.y;
          nd.z = pt.z;
        });
      });
      // Any other status (none today) takes the points left over.
      var rest = points.filter(function (pt) { return pt.free; });
      list.forEach(function (nd) {
        if (nd.x === undefined && rest.length) {
          var pt = rest.shift();
          nd.x = pt.x;
          nd.y = pt.y;
          nd.z = pt.z;
        }
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
    // The keys nest: everything new since v0.10 also works today, and the
    // next steps are part of the plan. So "Works today" lights both the
    // older and the new features, and "Planned" lights the next steps too.
    // Each feature is listed once in the data; only the keys nest.
    var NESTED = { works: ["works", "shipped"], planned: ["next", "planned"] };
    function covers(id, status) {
      return !!id && (status === id || (NESTED[id] || []).indexOf(status) >= 0);
    }
    var selected = null;
    var keys = {};
    var names = {};
    var counts = {};
    data.statuses.forEach(function (s) {
      counts[s.id] = all.filter(function (nd) { return covers(s.id, nd.status); }).length;
    });
    data.statuses.forEach(function (s) {
      // Each body names its own release ("New in v0.13.11" for Astra, the
      // moon's latest for Mifa); a shared key shows both.
      var other = moonData && moonData.statuses.filter(function (m) { return m.id === s.id; })[0];
      names[s.id] = other && other.name !== s.name && other.items.length
        ? s.name + " (" + moonLabel + ": " + other.name.replace(/^New in /, "") + ")"
        : s.name;
      if (!keyBox) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "orb-key";
      b.dataset.status = s.id;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="star" aria-hidden="true"></span><span class="name"></span><span class="n"></span>';
      b.querySelector(".name").textContent = names[s.id];
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
          li.classList.toggle("on", covers(selected, li.dataset.status));
        });
      });
      announce(selected ? "Highlighting " + names[selected] : "Showing every status");
      turnToward(spin.planet, planet, selected);
      if (moon.length) turnToward(spin.moon, moon, selected);
      request();
    }

    // Turning to a status: each status's stars form one band of its sphere
    // (they are placed in status order), so a body turns until the middle
    // of that band faces the viewer. The turn is a damped spring torque in
    // tick(): the globe spins up, slows and settles, then holds still while
    // the status is selected (its idle drift fades out) and resumes its own
    // spin and tilt when the selection is cleared.
    // Where on its disc a body shows a turned-to band: the middle of the
    // part that is in view. A rising globe is cut off below, so its band is
    // tilted up into the visible cap; elsewhere the disc's centre.
    function viewLift(isPlanet) {
      if (!rise || !isPlanet || !H) return 0;
      var g = planetGeometry(1);
      var seen = (g.y - g.R + Math.min(H, g.y + g.R)) / 2;
      var up = Math.max(-0.9, Math.min(0.9, (g.y - seen) / g.R));
      return Math.asin(up);
    }

    function turnToward(v, list, status) {
      if (!status) {
        v.returning = !!v.target;
        v.target = null;
        return;
      }
      var stars = list.filter(function (nd) { return covers(status, nd.status); });
      if (!stars.length) {
        v.target = null;
        return;
      }
      var cx = 0, cy = 0, cz = 0;
      stars.forEach(function (nd) { cx += nd.x; cy += nd.y; cz += nd.z; });
      cx /= stars.length; cy /= stars.length; cz /= stars.length;
      var h = Math.sqrt(cx * cx + cz * cz);
      // A band around the whole sphere has no facing longitude: give it a
      // quarter turn so the reveal is still a spin; a small cluster turns
      // its own side to the front.
      var yaw = h > 0.12 ? Math.atan2(cx, cz) : v.yaw + Math.PI / 2;
      var delta = yaw - v.yaw;
      delta -= 2 * Math.PI * Math.round(delta / (2 * Math.PI));
      // Stars are placed in status order down the sphere, so a set is a cap
      // or a ring near a pole (seen whole by facing that pole), or a band
      // round the middle (faced at its own latitude).
      var lat = Math.abs(cy) > 0.5 && h < 0.3
        ? (cy > 0 ? 1 : -1) * Math.PI / 2
        : Math.asin(Math.max(-1, Math.min(1, cy)));
      var pitch = Math.max(-2, Math.min(2, lat + viewLift(list === planet)));
      v.target = { yaw: v.yaw + delta, pitch: pitch };
      if (!motion()) {
        v.yaw = v.target.yaw;
        v.pitch = v.target.pitch;
        v.vel = 0;
      }
    }

    // ---- view state ----
    var dpr = 1, W = 0, H = 0;
    // Each body keeps its own turn; rate is its idle spin in radians per ms.
    var spin = {
      planet: { yaw: 0.7, pitch: -0.28, vel: 0, rate: 0.00011, rest: -0.28, pvel: 0, idle: 1, target: null },
      moon: { yaw: 2.1, pitch: -0.12, vel: 0, rate: 0.00016, rest: -0.12, pvel: 0, idle: 1, target: null }
    };
    var grabbed = spin.planet;
    var dragging = false, moved = 0, lastX = 0, lastY = 0, pointerType = "mouse";
    var hovered = null;
    var visible = true;
    var sparks = [];
    var nextSpark = 0;
    var lastT = 0;
    var running = false;
    var orbit = 0.9; // the moon's place on its orbit (parametric angle)
    var orbitBoost = 0; // extra orbital speed from the planet's tug, rad/ms
    var lastPlanetYaw = null;
    var center = { x: 0, y: 0, R: 0 };
    // Text laid over the globe (the hero's sentence and release line), in
    // canvas coordinates; the moon's orbit is fitted to stay clear of it.
    var keepOut = [];
    var fit = null;

    function size() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      var holder = stage.parentElement;
      keepOut = Array.prototype.filter.call(holder ? holder.querySelectorAll(".hero-side") : [], function (el) {
        return getComputedStyle(el).position === "absolute";
      }).map(function (el) {
        var r = el.getBoundingClientRect();
        return { left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top };
      });
      if (moon.length) fit = fitOrbit();
    }

    // ---- the moon's orbit ----
    //
    // A real orbit in 3D, so the two bodies never pass through each other:
    // the moon's sphere always stays outside the planet's, and whichever
    // centre is nearer the viewer is drawn in front (exact for two separate
    // spheres; at the moment the moon crosses the planet's depth their discs
    // cannot overlap). The orbit is a tilted ellipse seen from slightly above,
    // its centre raised over the planet and pushed back, so the moon swings
    // close and fast round the far side and drifts slowly across the front,
    // as gravity would have it (speed ~ 1/r^2, see tick).
    var LABEL_H = 24; // the name under the moon
    var GAP = 10; // closest approach between the two surfaces, px
    var DEPTH = 0.35; // how strongly distance shrinks the moon
    var ECC = 0.25; // how far the orbit's centre sits behind the planet's

    // Where the moon is at parametric angle `theta` for orbit `o` (sizes in
    // planet radii) around planet geometry `g`: screen x, y, depth z (px,
    // positive towards the viewer) and drawn radius r.
    function moonAt(theta, g, o) {
      var a = o.a * g.R;
      var z = a * (Math.sin(theta) - ECC);
      var f = 2.8 / (2.8 - (z / g.R) * DEPTH);
      return {
        x: g.x + a * Math.cos(theta),
        y: g.y - o.h * g.R + o.k * g.R * Math.sin(theta),
        z: z,
        r: o.m * g.R * f
      };
    }

    function distance(p, g) {
      var dx = p.x - g.x, dy = p.y - g.y;
      return Math.sqrt(dx * dx + dy * dy + p.z * p.z);
    }

    // Does orbit `o` keep the moon inside the canvas, clear of the text and
    // outside the planet all the way round?
    function orbitFits(o, g, texts) {
      for (var i = 0; i < 72; i++) {
        var p = moonAt((i / 72) * Math.PI * 2, g, o);
        if (p.y - p.r < 2 || p.x - p.r < 2 || p.x + p.r > W - 2 || p.y + p.r + LABEL_H > H) return false;
        if (distance(p, g) < g.R * (1 + o.m) + GAP) return false;
        for (var j = 0; j < texts.length; j++) {
          var t = texts[j];
          if (p.x + p.r > t.left - GAP && p.x - p.r < t.right + GAP && p.y + p.r + LABEL_H > t.top - GAP) return false;
        }
      }
      return true;
    }

    // The largest moon, then the widest and lowest orbit, that fits this
    // layout. Runs on resize only.
    function fitOrbit() {
      var g = planetGeometry(1.01);
      var tries = [keepOut, []];
      for (var n = 0; n < tries.length; n++) {
        for (var m = 0.26; m >= 0.119; m -= 0.02) {
          for (var ki = 0; ki < 3; ki++) {
            var k = [0.12, 0.08, 0.05][ki];
            for (var a = 1.6; a >= 0.3; a -= 0.04) {
              for (var h = 0.2; h <= 1.5; h += 0.02) {
                var o = { m: m, k: k, a: a, h: h };
                if (orbitFits(o, g, tries[n])) return withMeanDistance(o, g);
              }
            }
          }
        }
      }
      return withMeanDistance({ m: 0.12, k: 0.05, a: 1.2, h: 1 }, g);
    }

    function withMeanDistance(o, g) {
      var sum = 0;
      for (var i = 0; i < 72; i++) sum += distance(moonAt((i / 72) * Math.PI * 2, g, o), g);
      o.mean = sum / 72 / g.R;
      return o;
    }

    function planetGeometry(breath) {
      var R, cy;
      if (rise) {
        // The globe rises from the bottom edge: its top is whole, its lower
        // part cut off by the frame. With a moon it sits a little smaller
        // and lower, leaving room above it for the moon's far side.
        R = Math.min(W * 0.34, H * 0.8) * (moon.length ? 0.85 : 1) * breath;
        cy = R * (moon.length ? 1.3 : 1.06) + 8;
      } else {
        R = Math.min(W, H) * (moon.length ? 0.3 : 0.36) * breath;
        cy = H / 2;
      }
      return { x: W / 2, y: cy, R: R };
    }

    function motion() {
      return !reduce.matches;
    }

    function rotate(nd, cx, cy, R, v) {
      var cyw = Math.cos(v.yaw), syw = Math.sin(v.yaw);
      var cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
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
      var g = planetGeometry(breath);
      center = g;
      planet.forEach(function (nd) { rotate(nd, g.x, g.y, g.R, spin.planet); });
      if (moon.length && fit) {
        var p = moonAt(orbit, g, fit);
        moon.mz = p.z;
        moon.cx = p.x;
        moon.cy = p.y;
        moon.R = p.r;
        moon.dist = distance(p, g) / g.R;
        moon.forEach(function (nd) { rotate(nd, p.x, p.y, p.r, spin.moon); });
      }
      return g.R;
    }

    function dimFactor(nd) {
      return selected && !covers(selected, nd.status) ? 0.14 : 1;
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
        if (e && (!selected || covers(selected, e[0].status) || covers(selected, e[1].status))) {
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
      // A small set is labelled whole; a large one ("Works today") only its
      // own stars, so the names stay readable.
      var whole = all.filter(function (nd) { return covers(selected, nd.status); }).length <= 30;
      order.forEach(function (nd) {
        var named = whole ? covers(selected, nd.status) : nd.status === selected;
        if (!named || nd.depth < 0.55 || nd === hovered) return;
        var cx = nd.body === "moon" ? moon.cx : center.x;
        var right = nd.sx >= cx;
        // A name that would run under the hero's text is left off (the
        // star stays lit; hovering it still shows the name).
        var w = ctx.measureText(nd.label).width;
        var x0 = right ? nd.sx + 9 : nd.sx - 9 - w;
        var x1 = x0 + w;
        var covered = keepOut.some(function (k) {
          return x1 > k.left - 6 && x0 < k.right + 6 && nd.sy > k.top - 10;
        });
        if (covered) return;
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
      drawName(moonLabel, moon.cx, moon.cy + moon.R + 8, "top");
    }

    // A body's name, as an atlas labels a plate.
    function drawName(text, x, y, baseline) {
      ctx.font = "700 13px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = baseline;
      ctx.fillStyle = css(colors.ink, 0.75);
      ctx.fillText(text, x, y);
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
      if (moon.length) drawName(planetLabel, center.x, center.y - center.R * 1.02 - 8, "bottom");
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
      // A body in the hand stays put; the other keeps turning. A hovered
      // star slows its own body so it can be read.
      Object.keys(spin).forEach(function (body) {
        var v = spin[body];
        if (dragging && grabbed === v) return;
        if (!motion()) {
          v.vel = 0;
          return;
        }
        var slow = hovered && hovered.body === body ? 0.27 : 1;
        // Idle drift fades out while the body holds a selected status.
        v.idle += ((v.target ? 0 : 1) - v.idle) * (1 - Math.pow(0.96, dt / 16));
        if (v.target) {
          // Damped spring torque toward the target (settles in about 1 s).
          v.vel += (SPRING * (v.target.yaw - v.yaw) - DAMP * v.vel) * dt;
          v.pvel += (SPRING * (v.target.pitch - v.pitch) - DAMP * v.pvel) * dt;
          v.yaw += v.vel * dt;
          v.pitch += v.pvel * dt;
          return;
        }
        if (v.returning) {
          // Selection cleared: ease back to the body's own tilt.
          v.pvel += (SPRING * 0.5 * (v.rest - v.pitch) - DAMP * 0.7 * v.pvel) * dt;
          v.pitch += v.pvel * dt;
          if (Math.abs(v.pitch - v.rest) < 0.0005 && Math.abs(v.pvel) < 0.00001) {
            v.returning = false;
          }
        }
        v.yaw += v.vel * dt + v.rate * slow * v.idle * dt;
        v.vel *= Math.pow(0.93, dt / 16);
      });
      if (moon.length && fit && motion()) advanceOrbit(dt);
      draw(t);
      if (shouldAnimate()) request();
      else lastT = 0;
    }

    // Gravity: the moon moves fastest where it is closest to the planet
    // (angular speed ~ 1/r^2), and the planet's spin tugs it along: turn
    // the planet faster and the moon is drawn after it, with a lag, then
    // settles back to its own pace; turn it against the orbit and the moon
    // slows.
    var SPRING = 0.000022; // turn-to-status stiffness, 1/ms^2
    var DAMP = 0.0088; // just under critical damping: one soft overshoot
    var ORBIT_RATE = 0.00016; // rad/ms at the mean distance
    var TUG = 0.6;
    function advanceOrbit(dt) {
      var yaw = spin.planet.yaw;
      var planetRate = lastPlanetYaw === null ? spin.planet.rate : (yaw - lastPlanetYaw) / dt;
      lastPlanetYaw = yaw;
      var pace = spin.planet.rate * spin.planet.idle;
      var pull = Math.max(-0.003, Math.min(0.003, (planetRate - pace) * TUG));
      orbitBoost += (pull - orbitBoost) * (1 - Math.pow(0.985, dt / 16));
      if (dragging && grabbed === spin.moon) return; // held in the hand
      var r = moon.dist || fit.mean;
      var kepler = (fit.mean / r) * (fit.mean / r);
      // A counter-spin brakes the moon but never turns it back.
      var natural = ORBIT_RATE * kepler;
      orbit += Math.max(natural * 0.15, natural + orbitBoost) * dt;
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

    // Which body a drag starting at (x, y) turns: the moon when the pointer
    // is on it and it is not hidden behind the planet, else the planet (the
    // open sky turns the planet too, as the biggest target).
    function bodyAt(x, y) {
      if (!moon.length) return spin.planet;
      var slop = pointerType === "touch" ? 12 : 4;
      var mdx = x - moon.cx, mdy = y - moon.cy;
      var onMoon = mdx * mdx + mdy * mdy <= Math.pow(moon.R * 1.04 + slop, 2);
      var pdx = x - center.x, pdy = y - center.y;
      var onPlanet = pdx * pdx + pdy * pdy <= Math.pow(center.R * 1.02, 2);
      return onMoon && (!onPlanet || moon.mz >= 0) ? spin.moon : spin.planet;
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
      var p = local(ev);
      grabbed = bodyAt(p.x, p.y);
      grabbed.vel = 0;
      grabbed.pvel = 0;
      grabbed.target = null;
      grabbed.returning = false;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      request();
    });

    canvas.addEventListener("pointermove", function (ev) {
      if (dragging) {
        var dx = ev.clientX - lastX, dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        grabbed.yaw += dx * 0.008;
        grabbed.pitch = Math.max(-1.1, Math.min(1.1, grabbed.pitch + dy * 0.006));
        grabbed.vel = (dx * 0.008) / 16;
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

    // Arrow keys turn the planet; with Shift they turn the moon.
    canvas.addEventListener("keydown", function (ev) {
      var step = 0.18;
      var v = ev.shiftKey && moon.length ? spin.moon : spin.planet;
      if (/^Arrow/.test(ev.key)) {
        v.target = null;
        v.returning = false;
        v.pvel = 0;
      }
      if (ev.key === "ArrowLeft") v.yaw -= step;
      else if (ev.key === "ArrowRight") v.yaw += step;
      else if (ev.key === "ArrowUp") v.pitch = Math.max(-1.1, v.pitch - step);
      else if (ev.key === "ArrowDown") v.pitch = Math.min(1.1, v.pitch + step);
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
    // The text the moon avoids changes height once the web fonts arrive.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resized);

    stage.hidden = false;
    stage.setAttribute("data-ui", "");
    size();
    request();
  }
})();
