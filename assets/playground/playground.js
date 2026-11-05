// astra-lang.org playground page.
//
// The editor is a plain <textarea> over a highlighted <pre> with the same
// font and size; both grow to fit the program and scroll together in one
// container, so they never drift apart. The compiler runs in worker.js; a
// run that is still going after RUN_LIMIT_MS is stopped by terminating the
// worker. The program is kept in localStorage as a draft and can be shared
// as a link (#code=…, compressed when the browser can).
(function () {
  "use strict";

  var RUN_LIMIT_MS = 10000;
  var CHECK_DELAY_MS = 500;
  var KEYWORDS = /^(let|struct|fn|def|if|else|while|for|in|do|break|continue|import|export|pub|try|catch|switch|case|default|return|true|false|mut|const|throw|enum|match|impl|trait|async|await)$/;
  var TYPES = /^(int|float|bool|str|Vec|Map|Set|Result|Option|Self)$/;

  var $ = function (id) { return document.getElementById(id); };
  var source = $("pg-source");
  var highlight = document.querySelector(".pg-highlight code");
  var gutter = document.querySelector(".pg-gutter");
  var picker = $("pg-example");
  var stdin = $("pg-stdin");
  var status = $("pg-status");
  var runBtn = $("pg-run");
  var outPre = document.querySelector("#pg-output pre");
  var problemList = $("pg-problem-list");
  var problemJson = document.querySelector("#pg-problems pre");
  var problemCount = $("pg-problem-count");
  var irPre = document.querySelector("#pg-ir pre");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".pg-tabs [role=tab]"));
  if (!source || !window.Worker || !window.WebAssembly) return;

  document.querySelector(".pg").classList.add("pg-ready");

  // ---------------------------------------------------------------- worker
  var worker = null;
  var nextId = 1;
  var pending = {};
  var ready = false;
  var version = "";

  function startWorker() {
    worker = new Worker("assets/playground/worker.js");
    worker.onmessage = function (event) {
      var msg = event.data;
      if (msg.ready) {
        ready = true;
        // Only the first load is announced; after a Stop the status keeps
        // saying why the program was stopped.
        if (!version) {
          call({ op: "version" }).then(function (a) {
            version = a.version || "?";
            setStatus("Ready. Compiler " + version + ", running in your browser.");
          });
        }
        scheduleCheck(0);
        return;
      }
      var p = pending[msg.id];
      if (!p) return;
      delete pending[msg.id];
      if (msg.failed) p.reject(new Error(msg.failed));
      else p.resolve(msg.answer);
    };
    worker.onerror = function () { setStatus("The compiler could not start in this browser."); };
  }

  function call(request) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      worker.postMessage({ id: id, request: request });
    });
  }

  // Stop whatever is running: the worker and its compiler are discarded and
  // a fresh one loads (from the browser cache).
  function restartWorker(reason) {
    worker.terminate();
    Object.keys(pending).forEach(function (id) { pending[id].resolve({ ok: false, stopped: true, error: reason }); });
    pending = {};
    ready = false;
    startWorker();
  }

  function setStatus(text) { status.textContent = text; }

  // ---------------------------------------------------------------- editor
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function colour(text) {
    var re = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=(\s*\()?)/g;
    var html = "";
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      html += escapeHtml(text.slice(last, m.index));
      var cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "n" : KEYWORDS.test(m[4]) ? "kw" : TYPES.test(m[4]) ? "t" : m[5] ? "fn" : "";
      html += cls ? '<span class="' + cls + '">' + escapeHtml(m[0]) + "</span>" : escapeHtml(m[0]);
      last = re.lastIndex;
    }
    return html + escapeHtml(text.slice(last));
  }

  var errorLines = {};

  function render() {
    var text = source.value;
    // A trailing newline keeps the last line's height in the <pre>.
    highlight.innerHTML = colour(text) + "\n";
    var lines = text.split("\n");
    var longest = lines.reduce(function (n, l) { return Math.max(n, l.replace(/\t/g, "    ").length); }, 0);
    // At least the visible area, so a click below a short program still
    // lands in the editor.
    source.style.width = "max(100%, calc(" + (longest + 3) + "ch + 2 * var(--pg-pad)))";
    source.style.height = "max(100%, calc(" + lines.length + " * var(--pg-line) + 2 * var(--pg-pad)))";
    var nums = "";
    for (var i = 1; i <= lines.length; i++) {
      nums += errorLines[i] ? '<span class="err" title="' + escapeHtml(errorLines[i]) + '">' + i + "</span>\n" : i + "\n";
    }
    gutter.innerHTML = nums;
  }

  // Replace a range through the browser's editing commands, so Ctrl+Z
  // undoes it; fall back to setRangeText where execCommand is gone.
  function replaceRange(start, end, text) {
    source.focus();
    source.setSelectionRange(start, end);
    var done = false;
    try { done = document.execCommand("insertText", false, text); } catch (e) { done = false; }
    if (!done) {
      source.setRangeText(text, start, end, "end");
      source.dispatchEvent(new Event("input"));
    }
  }

  function setSource(text) { replaceRange(0, source.value.length, text); }

  function lineStart(pos) { return source.value.lastIndexOf("\n", pos - 1) + 1; }

  var tabEscapes = false; // Esc, then Tab, leaves the editor (no keyboard trap)

  source.addEventListener("keydown", function (e) {
    var v = source.value, s = source.selectionStart, end = source.selectionEnd;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === "Escape") { tabEscapes = true; return; }
    if (e.key === "Tab" && !tabEscapes) {
      e.preventDefault();
      var from = lineStart(s);
      if (e.shiftKey || s !== end) {
        // Indent or dedent every selected line by four spaces.
        var block = v.slice(from, end);
        var changed = e.shiftKey
          ? block.replace(/^( {1,4}|\t)/gm, "")
          : block.replace(/^/gm, "    ");
        replaceRange(from, end, changed);
        source.setSelectionRange(from, from + changed.length);
      } else {
        replaceRange(s, end, "    ");
      }
      return;
    }
    tabEscapes = false;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      var line = v.slice(lineStart(s), s);
      var indent = line.match(/^[ \t]*/)[0];
      if (/:\s*$/.test(line) || /\{\s*$/.test(line)) indent += "    ";
      replaceRange(s, end, "\n" + indent);
    }
  });

  var saveTimer = null;
  source.addEventListener("input", function () {
    render();
    scheduleCheck(CHECK_DELAY_MS);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem("pg-draft", JSON.stringify({ source: source.value, stdin: stdin.value })); } catch (e) { /* private mode */ }
    }, 400);
  });

  function goTo(line, column) {
    var lines = source.value.split("\n");
    var pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    pos += Math.max(0, (column || 1) - 1);
    source.focus();
    source.setSelectionRange(pos, pos);
    var scroller = source.closest(".pg-scroll");
    var lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 22;
    var y = (line - 1) * lineHeight;
    if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - 2 * lineHeight) {
      scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 3);
    }
  }

  // ---------------------------------------------------------------- tabs
  function showTab(name) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (name === "ir") showIr();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      showTab(next.dataset.tab);
    });
  });

  // ---------------------------------------------------------------- problems
  var lastReport = null;

  function cleanMessage(m) { return String(m || "").replace(/^Type error:\s*/, ""); }

  function showReport(report) {
    lastReport = report;
    var diags = (report && report.diagnostics) || [];
    errorLines = {};
    diags.forEach(function (d) { if (d.line) errorLines[d.line] = cleanMessage(d.message); });
    render();
    problemCount.textContent = diags.length ? String(diags.length) : "";
    problemJson.textContent = JSON.stringify(report, null, 2);
    problemList.innerHTML = "";
    if (!diags.length) {
      var ok = document.createElement("li");
      ok.className = "pg-clean";
      ok.textContent = "No problems. The program type-checks.";
      problemList.appendChild(ok);
      return;
    }
    diags.forEach(function (d) {
      var li = document.createElement("li");
      var where = d.line ? "line " + d.line + (d.column ? ", column " + d.column : "") : "no line yet";
      li.innerHTML = '<p class="pg-diag-head"><b></b> <span></span></p><p class="pg-diag-msg"></p><p class="pg-diag-hint"></p><div class="pg-diag-actions"></div>';
      li.querySelector("b").textContent = d.error_code || d.kind;
      li.querySelector(".pg-diag-head span").textContent = where;
      li.querySelector(".pg-diag-msg").textContent = cleanMessage(d.message);
      li.querySelector(".pg-diag-hint").textContent = d.suggestion || "";
      var actions = li.querySelector(".pg-diag-actions");
      if (d.line) actions.appendChild(button("Go to line " + d.line, function () { goTo(d.line, d.column); }));
      if (d.fix && d.fix.edits && d.fix.edits.length) {
        actions.appendChild(button("Apply this fix", function () { applyEdits(d.fix.edits); }, true));
      }
      problemList.appendChild(li);
    });
  }

  function button(label, onClick, primary) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = primary ? "pg-mini primary" : "pg-mini";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  // Apply fix edits (1-based line/column ranges), later ones first so earlier
  // offsets stay valid, as the compiler's own `fixes::apply` does.
  function applyEdits(edits) {
    var offset = function (line, column) {
      var lines = source.value.split("\n");
      var pos = 0;
      for (var i = 0; i < line - 1; i++) pos += lines[i].length + 1;
      return pos + column - 1;
    };
    edits.slice().sort(function (a, b) { return b.line - a.line || b.column - a.column; }).forEach(function (e) {
      replaceRange(offset(e.line, e.column), offset(e.end_line, e.end_column), e.text);
    });
    scheduleCheck(0);
  }

  var checkTimer = null;
  var checking = 0;
  function scheduleCheck(delay) {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () {
      if (!ready || running) return;
      var mine = ++checking;
      call({ op: "check", source: source.value }).then(function (a) {
        if (mine === checking && a.report) showReport(a.report);
      });
    }, delay);
  }

  // ---------------------------------------------------------------- actions
  var running = false;
  var limitTimer = null;

  function setRunning(on) {
    running = on;
    runBtn.textContent = on ? "Stop" : "Run";
    runBtn.classList.toggle("is-stop", on);
    runBtn.setAttribute("aria-label", on ? "Stop the program" : "Run the program");
  }

  function run() {
    if (running) {
      restartWorker("Stopped.");
      return;
    }
    setRunning(true);
    setStatus(ready ? "Running…" : "Loading the compiler, then running…");
    showTab("output");
    outPre.textContent = "";
    var started = performance.now();
    limitTimer = setTimeout(function () {
      restartWorker("Stopped after " + RUN_LIMIT_MS / 1000 + " seconds. Is there a loop that never ends?");
    }, RUN_LIMIT_MS);
    call({ op: "run", source: source.value, stdin: stdin.value }).then(function (a) {
      clearTimeout(limitTimer);
      setRunning(false);
      var ms = Math.round(performance.now() - started);
      if (a.stopped) {
        writeOutput("", a.error, null);
        setStatus(a.error);
        return;
      }
      if (a.phase === "check") {
        showReport(a.report);
        writeOutput("", "The program has " + a.report.diagnostics.length + " problem(s); see Problems.", null);
        showTab("problems");
        setStatus("Not run: fix the problems first (or press Fix).");
        return;
      }
      writeOutput(a.stdout || "", a.ok ? null : a.error, a.ok ? a.exit : null);
      setStatus((a.ok ? "Finished" : "Stopped with an error") + " in " + ms + " ms.");
    }, function (e) {
      clearTimeout(limitTimer);
      setRunning(false);
      setStatus(e.message);
    });
  }

  function writeOutput(text, error, exit) {
    outPre.textContent = text;
    if (!text && !error && exit !== null) {
      var none = document.createElement("span");
      none.className = "pg-meta";
      none.textContent = "(no output)\n";
      outPre.appendChild(none);
    }
    if (error) {
      var err = document.createElement("span");
      err.className = "pg-error";
      err.textContent = (text && !/\n$/.test(text) ? "\n" : "") + "error: " + String(error).replace(/^Runtime error:\s*/, "") + "\n";
      outPre.appendChild(err);
    }
    if (exit !== null) {
      var meta = document.createElement("span");
      meta.className = "pg-meta";
      meta.textContent = "exit " + exit;
      outPre.appendChild(meta);
    }
  }

  function check() {
    call({ op: "check", source: source.value }).then(function (a) {
      showReport(a.report);
      showTab("problems");
      var n = a.report.diagnostics.length;
      setStatus(n ? n + " problem(s). The JSON below is what an agent reads." : "No problems.");
    });
  }

  function fix() {
    call({ op: "fix", source: source.value }).then(function (a) {
      if (a.source !== source.value) setSource(a.source);
      showReport(a.report);
      var left = a.report.diagnostics.length;
      setStatus("Applied " + a.applied + " fix(es)." + (left ? " " + left + " problem(s) need a person (or a model)." : " The program checks clean: press Run."));
      showTab(left ? "problems" : "output");
    });
  }

  function format() {
    call({ op: "fmt", source: source.value }).then(function (a) {
      if (!a.ok) {
        setStatus("Can't format yet: " + a.error);
        return;
      }
      if (a.source !== source.value) setSource(a.source);
      setStatus("Formatted. The program's meaning is unchanged (astra fmt checks this).");
    });
  }

  function showIr() {
    irPre.textContent = "Generating…";
    call({ op: "ir", source: source.value }).then(function (a) {
      irPre.textContent = a.ok ? a.ir : "No IR: " + a.error;
    });
  }

  runBtn.addEventListener("click", run);
  $("pg-check").addEventListener("click", check);
  $("pg-fix").addEventListener("click", fix);
  $("pg-fmt").addEventListener("click", format);

  // ---------------------------------------------------------------- share
  function toBase64Url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(text) {
    var s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function encode(text) {
    var bytes = new TextEncoder().encode(text);
    if (window.CompressionStream) {
      return pipe(bytes, new CompressionStream("deflate-raw")).then(function (z) { return "z" + toBase64Url(z); });
    }
    return Promise.resolve("t" + toBase64Url(bytes));
  }
  function decode(code) {
    var bytes = fromBase64Url(code.slice(1));
    if (code[0] === "z") {
      return pipe(bytes, new DecompressionStream("deflate-raw")).then(function (b) { return new TextDecoder().decode(b); });
    }
    return Promise.resolve(new TextDecoder().decode(bytes));
  }

  $("pg-share").addEventListener("click", function () {
    encode(source.value).then(function (code) {
      var url = location.href.split("#")[0] + "#code=" + code;
      history.replaceState(null, "", url);
      var copied = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(url).then(function () { return true; }, function () { return false; })
        : Promise.resolve(false);
      copied.then(function (ok) {
        setStatus(ok ? "Link copied. It holds the whole program; nothing is uploaded." : "The address bar now holds a link to this program.");
      });
    });
  });

  // ---------------------------------------------------------------- examples
  var examples = [];

  function loadExample(id, replace) {
    var ex = examples.filter(function (e) { return e.id === id; })[0];
    if (!ex) return;
    if (replace) setSource(ex.source);
    else { source.value = ex.source; render(); }
    stdin.value = ex.stdin || "";
    stdin.closest("details").open = !!ex.stdin;
    picker.value = id;
    outPre.textContent = "";
    irPre.textContent = "";
    scheduleCheck(0);
  }

  picker.addEventListener("change", function () {
    loadExample(picker.value, true);
    setStatus("Loaded “" + picker.options[picker.selectedIndex].text + "”. Ctrl+Z brings back your previous code.");
  });

  function initialSource() {
    var m = /#code=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      return decode(m[1]).then(function (text) { return { source: text, stdin: "", shared: true }; }, function () { return null; });
    }
    try {
      var draft = JSON.parse(localStorage.getItem("pg-draft") || "null");
      if (draft && draft.source) return Promise.resolve(draft);
    } catch (e) { /* no storage */ }
    return Promise.resolve(null);
  }

  startWorker();
  setStatus("Loading the compiler (about 380 KB)…");
  fetch("assets/playground/examples.json").then(function (r) { return r.json(); }).then(function (list) {
    examples = list;
    list.forEach(function (ex) {
      var o = document.createElement("option");
      o.value = ex.id;
      o.textContent = ex.title;
      picker.appendChild(o);
    });
    return initialSource();
  }).then(function (start) {
    if (start) {
      source.value = start.source;
      stdin.value = start.stdin || "";
      picker.value = "";
      render();
      if (start.shared) setStatus("Opened a shared program.");
    } else {
      loadExample("welcome", false);
    }
  }).catch(function () {
    render();
  });
})();
