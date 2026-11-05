// astra-lang.org playground: the compiler, off the main thread.
//
// Loads astra.wasm (built from the compiler's playground/ crate) and answers
// { id, request } messages with { id, answer }. A request is the JSON the
// module takes ({ op: "run" | "check" | "fix" | "fmt" | "ir", source, stdin }).
// The page terminates this worker to stop a program that runs too long.
"use strict";

var api = null;
var loading = null;
var enc = new TextEncoder();
var dec = new TextDecoder();

function load() {
  if (!loading) {
    var url = new URL("astra.wasm", self.location.href);
    var instantiate = WebAssembly.instantiateStreaming
      ? WebAssembly.instantiateStreaming(fetch(url), {}).catch(function () {
          // Served without the application/wasm type: fall back to bytes.
          return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) {
            return WebAssembly.instantiate(b, {});
          });
        })
      : fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) {
          return WebAssembly.instantiate(b, {});
        });
    loading = instantiate.then(function (result) {
      api = result.instance.exports;
    });
  }
  return loading;
}

function ask(request) {
  var bytes = enc.encode(JSON.stringify(request));
  var ptr = api.pg_alloc(bytes.length);
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  var at = api.pg_call(ptr, bytes.length);
  var answer = dec.decode(new Uint8Array(api.memory.buffer, at, api.pg_result_len()));
  api.pg_free(ptr, bytes.length);
  return JSON.parse(answer);
}

self.onmessage = function (event) {
  var id = event.data.id;
  load().then(function () {
    var answer;
    try {
      answer = ask(event.data.request);
    } catch (e) {
      // The engine's own stack ran out (very deep recursion with large
      // frames) or the module trapped: its state is unknown, so load a fresh
      // copy for the next request.
      var deep = e instanceof RangeError || /stack|recursion/i.test(String(e && e.message));
      answer = {
        ok: false,
        phase: "run",
        stdout: "",
        error: deep
          ? "stack overflow (recursion too deep for the browser)"
          : "the playground stopped unexpectedly (" + (e && e.message ? e.message : e) + ")",
      };
      api = null;
      loading = null;
    }
    self.postMessage({ id: id, answer: answer });
  }, function (e) {
    loading = null;
    self.postMessage({ id: id, failed: "Could not load the compiler: " + (e && e.message ? e.message : e) });
  });
};

// Start downloading straight away so the first Run is quick.
load().then(function () { self.postMessage({ ready: true }); }, function () {});
