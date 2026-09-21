// Keep Japanese UI words together even in browsers without CSS auto-phrase.
// Only presentation nodes change; form values and saved journal text are untouched.
export function wrapJapaneseLabels(root, language) {
  if (language !== "ja" || typeof Intl.Segmenter !== "function") return;
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  const targets = root.querySelectorAll(
    "h1, h2, h3, .btn, .tag, summary, .field > span, .check > span, .tag-label, .plan-name, .plan-comparison th, .catalog-group td",
  );
  for (const target of targets) {
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest(".ui-label"))
        nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(node.data)) continue;
      const words = [];
      for (const { segment } of segmenter.segment(node.data)) {
        // Attach particles, endings and closing punctuation to the preceding word.
        if (
          words.length &&
          !/\s$/u.test(words.at(-1)) &&
          /^(は|が|を|に|へ|と|で|の|も|や|です|ます|する|した|から|まで|だけ|[、。！？）」』】])$/u.test(
            segment,
          )
        )
          words[words.length - 1] += segment;
        else if (words.length && /^[（「『【]$/u.test(words.at(-1)))
          words[words.length - 1] += segment;
        else words.push(segment);
      }
      const fragment = document.createDocumentFragment();
      for (const word of words) {
        if (/^\s+$/u.test(word)) fragment.append(document.createTextNode(word));
        else {
          const span = document.createElement("span");
          span.className = "ui-word";
          span.textContent = word;
          fragment.append(span);
        }
      }
      const label = document.createElement("span");
      label.className = "ui-label";
      label.append(fragment);
      node.replaceWith(label);
    }
  }
}
