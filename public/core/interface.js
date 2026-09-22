// App-owned dialogs. Date arithmetic uses local noon to avoid DST midnight gaps.
export function shiftDay(date, offset) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthCells(month) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(year, number - 1, 1, 12);
  const days = new Date(year, number, 0, 12).getDate();
  return [
    ...Array(first.getDay()).fill(null),
    ...Array.from(
      { length: days },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
}
let activeDialog = null;
function modal(label, content, onCancel, trigger) {
  if (activeDialog) return null;
  const previous = trigger || document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  dialog.setAttribute("aria-label", label);
  dialog.innerHTML = content;
  document.body.append(dialog);
  activeDialog = dialog;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const siblings = [...document.body.children].filter((el) => el !== dialog);
  const states = siblings.map((el) => [el, el.inert]);
  states.forEach(([el]) => (el.inert = true));
  function close() {
    activeDialog = null;
    if (dialog.close) dialog.close();
    dialog.remove();
    states.forEach(([el, inert]) => (el.inert = inert));
    document.body.style.overflow = previousOverflow;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    onCancel();
  });
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
      onCancel();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Tab") {
      const items = [
        ...dialog.querySelectorAll('button:not(:disabled),[tabindex="0"]'),
      ];
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  });
  if (dialog.showModal) dialog.showModal();
  else {
    dialog.setAttribute("open", "");
    dialog.classList.add("dialog-fallback");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
  }
  return { dialog, close };
}
let pendingConfirmation;
export function confirmDiscard(t) {
  if (pendingConfirmation) return pendingConfirmation;
  pendingConfirmation = new Promise((resolve) => {
    let view;
    const finish = (value) => {
      view?.close();
      resolve(value);
    };
    view = modal(
      t("unsavedTitle"),
      `<h2>${t("unsavedTitle")}</h2><p>${t("unsaved")}</p><div class="dialog-actions"><button type="button" class="btn ghost" data-dialog-cancel>${t("keepEditing")}</button><button type="button" class="btn primary" data-dialog-discard>${t("discardMove")}</button></div>`,
      () => finish(false),
    );
    if (!view) {
      resolve(false);
      return;
    }
    view.dialog.querySelector("[data-dialog-cancel]").onclick = () =>
      finish(false);
    view.dialog.querySelector("[data-dialog-discard]").onclick = () =>
      finish(true);
    view.dialog.querySelector("[data-dialog-cancel]").focus();
  }).finally(() => (pendingConfirmation = null));
  return pendingConfirmation;
}
export function pickDate({ value, max, locale, t, marked = [], trigger }) {
  return new Promise((resolve) => {
    let month = value.slice(0, 7),
      selected = value,
      view;
    const finish = (date) => {
      view?.close();
      resolve(date);
    };
    view = modal(t("chooseDate"), "", () => finish(null), trigger);
    if (!view) {
      resolve(null);
      return;
    }
    view.dialog.classList.add("calendar-dialog");
    const moveMonth = (offset) => {
      const [y, m] = month.split("-").map(Number),
        date = new Date(y, m - 1 + offset, 1, 12);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    };
    function draw(focusDate = null, focusSelector = null) {
      const label = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
      }).format(new Date(`${month}-01T12:00:00`));
      const weekdays = Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
          new Date(2024, 0, 7 + i, 12),
        ),
      );
      view.dialog.innerHTML = `<div class="calendar-heading"><h2>${t("chooseDate")}</h2><button class="btn ghost icon-button" data-calendar-cancel aria-label="${t("close")}">×</button></div><div class="calendar-month"><button class="btn ghost icon-button" data-calendar-prev aria-label="${t("previousMonth")}">◀︎</button><strong data-calendar-month="${month}" aria-live="polite">${label}</strong><button class="btn ghost icon-button" data-calendar-next aria-label="${t("nextMonth")}" ${moveMonth(1) > max.slice(0, 7) ? "disabled" : ""}>▶︎</button></div><div class="calendar-weekdays" aria-hidden="true">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-grid" role="group" aria-label="${label}">${monthCells(
        month,
      )
        .map((date) =>
          date
            ? `<button type="button" class="calendar-day ${marked.includes(date) ? "has-record" : ""}" data-calendar-date="${date}" aria-label="${new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date(`${date}T12:00:00`))}" aria-pressed="${date === selected}" ${date === max ? 'aria-current="date"' : ""} ${date > max ? "disabled" : ""}>${Number(date.slice(-2))}</button>`
            : "<span></span>",
        )
        .join(
          "",
        )}</div><div class="calendar-footer"><button class="btn ghost" data-calendar-today>${t("today")}</button><button class="btn ghost" data-calendar-cancel>${t("cancel")}</button></div>`;
      view.dialog
        .querySelectorAll("[data-calendar-cancel]")
        .forEach((el) => (el.onclick = () => finish(null)));
      view.dialog.querySelector("[data-calendar-prev]").onclick = () => {
        month = moveMonth(-1);
        draw(null, "[data-calendar-prev]");
      };
      view.dialog.querySelector("[data-calendar-next]").onclick = () => {
        month = moveMonth(1);
        draw(null, "[data-calendar-next]");
      };
      view.dialog.querySelector("[data-calendar-today]").onclick = () =>
        finish(max);
      view.dialog.querySelectorAll("[data-calendar-date]").forEach((el) => {
        el.onclick = () => finish(el.dataset.calendarDate);
        el.onkeydown = (e) => {
          const offset = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
          }[e.key];
          if (offset !== undefined) {
            e.preventDefault();
            const date = shiftDay(el.dataset.calendarDate, offset);
            if (date <= max) {
              month = date.slice(0, 7);
              draw(date);
            }
          }
        };
      });
      const target = focusSelector
        ? view.dialog.querySelector(focusSelector)
        : view.dialog.querySelector(
            `[data-calendar-date="${focusDate || selected}"]:not(:disabled)`,
          );
      (target || view.dialog.querySelector("[data-calendar-prev]")).focus();
    }
    draw();
  });
}

// The gray thumb follows the finger continuously, then commits on release.
// Both a horizontal drag and a long press can start the gesture.
export function bindSlideNavigation(nav, navigate) {
  let gesture = null,
    timer = null,
    frame = null,
    suppressUntil = 0;
  const clear = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = null;
    nav
      .querySelectorAll(".nav-preview")
      .forEach((el) => el.classList.remove("nav-preview"));
    nav.classList.remove("nav-scrubbing");
    nav.style.removeProperty("--nav-position");
    gesture = null;
  };
  const geometry = () => {
    const track = nav.querySelector(".nav-track");
    if (!track) return null;
    const rect = track.getBoundingClientRect(),
      buttons = [...track.querySelectorAll("button[data-go]")];
    return { rect, buttons, slot: (rect.width - 12) / buttons.length };
  };
  const targetAt = (x, y) => {
    const g = geometry();
    if (
      !g ||
      x < g.rect.left ||
      x > g.rect.right ||
      y < g.rect.top ||
      y > g.rect.bottom
    )
      return null;
    const i = Math.max(
      0,
      Math.min(
        g.buttons.length - 1,
        Math.floor((x - g.rect.left - 6) / g.slot),
      ),
    );
    return g.buttons[i].disabled ? null : g.buttons[i];
  };
  const draw = () => {
    frame = null;
    if (!gesture?.armed) return;
    const g = geometry();
    if (!g) return;
    const x = Math.max(
      0,
      Math.min(
        g.slot * (g.buttons.length - 1),
        gesture.x - g.rect.left - 6 - g.slot / 2,
      ),
    );
    nav.style.setProperty("--nav-position", `${x}px`);
    nav
      .querySelectorAll(".nav-preview")
      .forEach((el) => el.classList.remove("nav-preview"));
    targetAt(gesture.x, gesture.y)?.classList.add("nav-preview");
  };
  const arm = () => {
    if (!gesture) return;
    clearTimeout(timer);
    gesture.armed = true;
    nav.classList.add("nav-scrubbing");
    draw();
  };
  nav.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const button = e.target.closest("button[data-go]");
    if (!button || button.disabled) return;
    clear();
    suppressUntil = 0;
    gesture = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      armed: false,
    };
    button.setPointerCapture?.(e.pointerId);
    timer = setTimeout(arm, 300);
  });
  nav.addEventListener("pointermove", (e) => {
    if (!gesture || gesture.id !== e.pointerId) return;
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    const dx = Math.abs(e.clientX - gesture.startX),
      dy = Math.abs(e.clientY - gesture.startY);
    if (!gesture.armed && dy > 12 && dy > dx) {
      clear();
      suppressUntil = performance.now() + 600;
      return;
    }
    if (!gesture.armed && dx > 6 && dx > dy) arm();
    if (gesture.armed) {
      e.preventDefault();
      if (frame === null) frame = requestAnimationFrame(draw);
    }
  });
  nav.addEventListener("pointerup", (e) => {
    if (!gesture || gesture.id !== e.pointerId) return;
    const next = gesture.armed
      ? targetAt(e.clientX, e.clientY)?.dataset.go
      : null;
    if (gesture.armed) {
      e.preventDefault();
      suppressUntil = performance.now() + 600;
    }
    clear();
    if (next) void navigate(next);
  });
  nav.addEventListener("pointercancel", () => {
    if (gesture) suppressUntil = performance.now() + 600;
    clear();
  });
  nav.addEventListener("lostpointercapture", clear);
  nav.addEventListener("contextmenu", (e) => e.preventDefault());
  nav.addEventListener(
    "click",
    (e) => {
      if (performance.now() < suppressUntil && e.detail !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}
