// jsdom does not implement layout APIs that CodeMirror uses during measurement.
// Returning no rects makes CodeMirror skip measurement-dependent optimizations.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
}
