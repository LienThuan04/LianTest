// Keep the text and basic formatting supported by the exam editor.
// Image attachments are rendered separately from their saved Storage URLs.
(function () {
  const allowed = new Set([
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI",
    "BLOCKQUOTE", "FIGURE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD",
    "TH", "CAPTION", "H2", "H3", "H4", "HR",
  ]);
  const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"]);
  window.examEssayHtml = function (value) {
    const source = document.createElement("template");
    source.innerHTML = String(value ?? "");
    const output = document.createElement("div");
    function append(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) {
        const lines = node.textContent.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (index) parent.appendChild(document.createElement("br"));
          parent.appendChild(document.createTextNode(line));
        });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return;
      let target = parent;
      if (allowed.has(node.tagName)) {
        target = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === "TD" || node.tagName === "TH") {
          for (const attribute of ["colspan", "rowspan"]) {
            const count = Number(node.getAttribute(attribute));
            if (Number.isInteger(count) && count > 0 && count <= 100) target.setAttribute(attribute, String(count));
          }
        }
        parent.appendChild(target);
      }
      for (const child of node.childNodes) append(child, target);
    }
    for (const child of source.content.childNodes) append(child, output);
    return output.innerHTML;
  };
  function renderSavedEssays() {
    document.querySelectorAll("[data-exam-essay]").forEach((element) => {
      element.innerHTML = window.examEssayHtml(element.textContent);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderSavedEssays);
  else renderSavedEssays();
})();
