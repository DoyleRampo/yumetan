function pagerControls(labels) {
  const controls = document.createElement("div");
  controls.className = "panel-controls";
  controls.setAttribute("role", "group");
  const previous = document.createElement("button");
  const next = document.createElement("button");
  for (const [button, icon] of [
    [previous, "←"],
    [next, "→"],
  ]) {
    button.type = "button";
    button.textContent = icon;
  }
  function relabel() {
    controls.setAttribute("aria-label", labels.panels);
    previous.setAttribute("aria-label", labels.back);
    next.setAttribute("aria-label", labels.next);
  }
  relabel();
  const counter = document.createElement("output");
  counter.setAttribute("aria-live", "polite");
  controls.append(previous, counter, next);
  controls.hidden = true;
  function update(index, count) {
    counter.value = `${index + 1} / ${count}`;
    previous.disabled = index === 0;
    next.disabled = index === count - 1;
  }
  return { controls, previous, next, update, relabel };
}

// Keep each screen and sheet in a fixed viewport. Native column fragmentation
// also lets a long journal entry continue on the next panel without losing text.
function createPager(container, labels, initial = 0) {
  const viewport = document.createElement("div");
  viewport.className = "panel-viewport";
  container.classList.add("paginated");
  const flow = document.createElement("div");
  flow.className = "panel-flow";
  flow.append(...container.childNodes);
  viewport.append(flow);

  const { controls, previous, next, update } = pagerControls(labels);
  container.append(viewport, controls);

  let index = initial;
  let count = 1;
  let frame;
  let pointerFocus;
  function show(position) {
    index = Math.max(0, Math.min(count - 1, position));
    viewport.scrollLeft = index * viewport.clientWidth;
    viewport.scrollTop = 0;
    update(index, count);
  }
  function measure() {
    const width = viewport.clientWidth;
    if (!width || !viewport.clientHeight) return;
    flow.style.setProperty("--panel-width", `${width}px`);
    // Documents can have a stable scrollbar-free first panel without a pager.
    controls.hidden = true;
    count = Math.max(1, Math.ceil((viewport.scrollWidth - 1) / width));
    if (count > 1) {
      controls.hidden = false;
      count = Math.max(1, Math.ceil((viewport.scrollWidth - 1) / width));
    }
    show(index);
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }
  function reveal(element) {
    if (
      !flow.contains(element) ||
      element.closest("dialog") !== flow.closest("dialog")
    )
      return;
    const width = viewport.clientWidth;
    if (!width) return;
    const rect = viewport.getBoundingClientRect();
    const scale = rect.width / width || 1;
    const offset =
      (element.getBoundingClientRect().left - rect.left) / scale +
      viewport.scrollLeft;
    show(Math.floor((offset + 1) / width));
  }
  function focusPanel(position) {
    show(position);
    // Keep keyboard focus on an enabled paging control at either end.
    if (document.activeElement?.disabled)
      (next.disabled ? previous : next).focus({ preventScroll: true });
  }
  previous.onclick = () => focusPanel(index - 1);
  next.onclick = () => focusPanel(index + 1);
  viewport.addEventListener(
    "pointerdown",
    () => {
      // A pointer already has a hit target. Aligning the panel before pointerup
      // can move that target away and swallow the click.
      clearTimeout(pointerFocus);
      pointerFocus = setTimeout(() => {
        pointerFocus = undefined;
      }, 0);
    },
    true,
  );
  viewport.addEventListener("focusin", (event) => {
    if (!pointerFocus) reveal(event.target);
  });
  viewport.addEventListener("load", schedule, true);
  viewport.addEventListener("toggle", schedule, true);
  const resize = new ResizeObserver(schedule);
  resize.observe(viewport);
  const changes = new MutationObserver(schedule);
  changes.observe(flow, {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
    subtree: true,
  });
  measure();
  return {
    get index() {
      return index;
    },
    reveal,
    measure,
    back() {
      if (!index) return false;
      show(index - 1);
      return true;
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(pointerFocus);
      resize.disconnect();
      changes.disconnect();
    },
  };
}

export function mountContentPagers(root, labels, previous = new Map()) {
  const pagers = new Map();
  for (const [index, area] of [
    ...root.querySelectorAll(
      // A sheet marked "scroll" keeps one long page that scrolls instead.
      ".tab-panel, .detail-text, .day-records, .sheet:not(.scroll) .sheet-body, .post-text:not(p)",
    ),
  ].entries()) {
    const key =
      area.id ||
      area.closest("[data-sheet]")?.dataset.sheet ||
      area.closest("[data-post-id]")?.dataset.postId ||
      index;
    pagers.set(key, createPager(area, labels, previous.get(key)));
  }
  const feed = root.querySelector(".feed-list.carousel");
  if (feed?.children.length > 1) {
    const key = "feed-pages";
    const pager = createOverflowPager(feed, labels, {
      horizontal: true,
      initial: previous.get(key),
    });
    pagers.set(key, pager);
  }
  return {
    positions() {
      return new Map([...pagers].map(([key, pager]) => [key, pager.index]));
    },
    destroy() {
      for (const pager of pagers.values()) pager.destroy();
    },
  };
}

// The stage uses its existing layout at high zoom. The feed also keeps its
// responsive cards and optional swipe, with arrows as a direct way through it.
function createOverflowPager(
  viewport,
  labels,
  { horizontal = false, initial = 0 } = {},
) {
  const { controls, previous, next, update, relabel } = pagerControls(labels);
  controls.classList.add(horizontal ? "feed-pager" : "stage-pager");
  viewport.after(controls);
  const position = horizontal ? "scrollLeft" : "scrollTop";
  const size = horizontal ? "clientWidth" : "clientHeight";
  const extent = horizontal ? "scrollWidth" : "scrollHeight";
  let step = 1,
    count = 1,
    index = initial;
  const end = () => Math.max(0, viewport[extent] - viewport[size]);

  function show(page) {
    index = Math.max(0, Math.min(count - 1, page));
    viewport[position] = index * step;
    update(index, count);
  }
  function syncPosition() {
    if (controls.hidden) return;
    index = Math.max(
      0,
      Math.min(
        count - 1,
        viewport[position] >= end() - 1
          ? count - 1
          : Math.round(viewport[position] / step),
      ),
    );
    update(index, count);
  }
  function move(delta) {
    syncPosition();
    show(index + delta);
    if (document.activeElement?.disabled)
      (next.disabled ? previous : next).focus({ preventScroll: true });
  }
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  viewport.addEventListener("scroll", syncPosition, { passive: true });

  function measure(needed = true, reset = false) {
    relabel();
    if (reset) index = 0;
    controls.hidden = !needed;
    step = horizontal
      ? Math.max(
          1,
          viewport.children[1].offsetLeft - viewport.children[0].offsetLeft,
        )
      : Math.max(1, viewport.clientHeight - 16);
    count = Math.ceil(Math.max(0, end() - 1) / step) + 1;
    controls.hidden = count < 2 || !needed;
    show(controls.hidden ? 0 : index);
  }
  const resize = horizontal ? new ResizeObserver(() => measure()) : null;
  resize?.observe(viewport);
  if (horizontal) measure();
  return {
    get index() {
      return index;
    },
    measure,
    destroy() {
      resize?.disconnect();
      viewport.removeEventListener("scroll", syncPosition);
    },
  };
}

export function createStagePager(stage, labels) {
  return createOverflowPager(stage, labels);
}

// While the on-screen keyboard is open the page shrinks to the part of the
// screen above it (--visible-height), so the field being typed in and the
// button under it stay in view.
//
// iOS first scrolls the whole page up to bring the focused field above the
// keyboard, measured against the full-height layout. Once the page has shrunk
// that scroll is no longer needed, but iOS keeps it: the visible area then
// starts part-way down the shortened page and shows the empty space below it
// (typing a nickname at registration sent the screen "down" to nothing).
// Everything fits in the visible area by now, so the page is put back at the
// top whenever the visible area is moved or resized while the keyboard is up,
// and once more when it closes.
export function fitVisualViewport(onChange = () => {}) {
  const visual = window.visualViewport;
  if (!visual) return;
  let open = false;
  function pinTop() {
    if (window.scrollY || visual.offsetTop || visual.pageTop)
      window.scrollTo(0, 0);
  }
  function sync() {
    const keyboard = visual.scale === 1 && visual.height < innerHeight - 1;
    document.documentElement.style.setProperty(
      "--visible-height",
      keyboard ? `${visual.height}px` : "",
    );
    document.body.classList.toggle("keyboard", keyboard);
    if (keyboard || open) {
      pinTop();
      // iOS can apply its own scroll after the resize event: check again
      // once the frame has been laid out.
      requestAnimationFrame(pinTop);
    }
    if (keyboard !== open) {
      open = keyboard;
      onChange(keyboard);
    } else if (keyboard) onChange(keyboard);
  }
  visual.addEventListener("resize", sync);
  visual.addEventListener("scroll", () => {
    if (open && visual.scale === 1) pinTop();
  });
  sync();
}
