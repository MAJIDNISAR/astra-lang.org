// astra-lang.org — small progressive enhancements. Every page works without
// this file: the nav stays visible, code stays selectable, the theme follows
// the system.
(function () {
  "use strict";

  var root = document.documentElement;
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      var t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null;
    }
  }

  function effectiveTheme() {
    return storedTheme() || (systemDark.matches ? "dark" : "light");
  }

  // Every click flips what you see. Picking the theme your system already
  // uses clears the stored choice, so the page goes back to following it.
  function toggleTheme() {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    var system = systemDark.matches ? "dark" : "light";
    try {
      if (next === system) localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch (e) { /* private mode: the choice lasts for this page only */ }
    if (next === system) delete root.dataset.theme;
    else root.dataset.theme = next;
    return next;
  }

  function announce(text) {
    var live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(function () { live.textContent = text; }, 30);
  }

  // ---- header controls: theme toggle + mobile menu ----
  var ICONS = {
    light: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
           '<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" ' +
           'stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    dark: '<path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1z" fill="none" ' +
          'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  };

  function setupHeader() {
    var header = document.querySelector("header.site");
    if (!header) return;
    var wrap = header.querySelector(".wrap");
    var nav = header.querySelector("nav.main");

    var actions = document.createElement("div");
    actions.className = "header-actions";

    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "icon-btn theme-toggle";
    function renderTheme() {
      var current = effectiveTheme();
      var other = current === "dark" ? "light" : "dark";
      themeBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
        ICONS[current] + "</svg>";
      themeBtn.setAttribute("aria-label", "Switch to " + other + " theme");
      themeBtn.title = "Switch to " + other + " theme";
    }
    themeBtn.addEventListener("click", function () {
      announce(toggleTheme() + " theme");
      renderTheme();
    });
    systemDark.addEventListener("change", renderTheme);
    renderTheme();
    actions.appendChild(themeBtn);

    if (nav) {
      if (!nav.id) nav.id = "site-nav";
      var menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "icon-btn nav-toggle";
      menuBtn.setAttribute("aria-controls", nav.id);
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.textContent = "menu";
      var setOpen = function (open) {
        header.classList.toggle("nav-open", open);
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
        menuBtn.textContent = open ? "close" : "menu";
      };
      menuBtn.addEventListener("click", function () {
        setOpen(!header.classList.contains("nav-open"));
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && header.classList.contains("nav-open")) {
          setOpen(false);
          menuBtn.focus();
        }
      });
      // Leaving the phone layout closes the menu, so it never reopens stale.
      window.matchMedia("(max-width: 860px)").addEventListener("change", function (e) {
        if (!e.matches) setOpen(false);
      });
      actions.appendChild(menuBtn);
    }

    wrap.appendChild(actions);
    // Only now may CSS collapse the nav: the button to reopen it exists.
    if (nav) root.classList.add("nav-ready");
  }

  // ---- copy buttons on code blocks ----
  // Shell blocks (marked `$` prompts) copy only the commands, without prompts,
  // output or trailing `# comments`. A source block that ends with a
  // transcript copies only the source. `data-copy="none"` opts a block out.
  function textToCopy(pre) {
    var text = pre.innerText.replace(/\s+$/, "");
    var lines = text.split("\n");
    if (pre.querySelector(".p")) {
      var cmds = lines
        .filter(function (l) { return /^\$\s/.test(l); })
        .map(function (l) { return l.replace(/^\$\s+/, "").replace(/\s+#\s.*$/, ""); });
      return cmds.length ? cmds.join("\n") : text;
    }
    var firstPrompt = lines.findIndex(function (l) { return /^\$\s/.test(l); });
    return firstPrompt > 0 ? lines.slice(0, firstPrompt).join("\n").replace(/\s+$/, "") : text;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.className = "sr-only";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  // A code block that scrolls sideways must be reachable by keyboard, so it
  // becomes a focusable, labelled region only while it actually overflows.
  function syncScrollable(pres) {
    Array.prototype.forEach.call(pres, function (pre) {
      if (pre.scrollWidth > pre.clientWidth + 1) {
        if (!pre.hasAttribute("tabindex")) {
          var block = pre.closest(".codeblock");
          var tab = block && block.querySelector(".tab");
          pre.setAttribute("tabindex", "0");
          pre.setAttribute("role", "region");
          pre.setAttribute("aria-label",
            (tab ? tab.textContent.trim() : "Code example") + " (scrolls sideways)");
        }
      } else if (pre.getAttribute("tabindex") === "0") {
        pre.removeAttribute("tabindex");
        pre.removeAttribute("role");
        pre.removeAttribute("aria-label");
      }
    });
  }

  function addCopyButton(pre) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "copy";
    btn.setAttribute("aria-label", pre.querySelector(".p") ? "Copy commands" : "Copy code");
    btn.addEventListener("click", function () {
      copy(textToCopy(pre)).then(function () {
        btn.textContent = "copied";
        btn.classList.add("done");
        announce("Copied to clipboard");
        window.setTimeout(function () {
          btn.textContent = "copy";
          btn.classList.remove("done");
        }, 1600);
      }, function () {
        announce("Copy failed. Select the text instead.");
      });
    });

    var head = document.createElement("div");
    head.className = "code-head";
    var block = pre.parentNode;
    var tab = block.classList.contains("codeblock") && block.querySelector(":scope > .tab");
    if (tab) {
      block.insertBefore(head, tab);
      head.appendChild(tab);
    } else {
      var wrap = document.createElement("div");
      wrap.className = "pre-wrap";
      block.insertBefore(wrap, pre);
      wrap.appendChild(head);
      wrap.appendChild(pre);
    }
    head.appendChild(btn);
  }

  function setupCode() {
    var pres = document.querySelectorAll("main pre");
    Array.prototype.forEach.call(pres, function (pre) {
      if (pre.getAttribute("data-copy") !== "none") addCopyButton(pre);
    });
    syncScrollable(pres);
    var pending = 0;
    window.addEventListener("resize", function () {
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(function () { syncScrollable(pres); });
    });
  }

  function setupLive() {
    var live = document.createElement("div");
    live.id = "live";
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }

  setupLive();
  setupHeader();
  setupCode();
})();
