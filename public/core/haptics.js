const patterns = { tap: 12, step: 18, result: [25, 45, 35] };
const controls =
  'button, summary, a[href], input:is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="file"], [type="date"], [type="time"]), [role="button"]';

export function createHaptics(cap) {
  const native = cap?.isNativePlatform?.()
    ? cap.Plugins?.YumetanHaptics || cap.registerPlugin?.("YumetanHaptics")
    : null;
  let resetPulse;

  function pulse(kind) {
    try {
      if (native) {
        void native.pulse({ kind }).catch(() => {});
      } else {
        navigator.vibrate?.(patterns[kind]);
      }
    } catch {
      // Haptic support must never affect the action itself.
    }
  }

  function interaction(kind = "tap") {
    clearTimeout(resetPulse);
    resetPulse = setTimeout(() => {
      resetPulse = undefined;
    }, 0);
    pulse(kind);
  }

  document.addEventListener(
    "click",
    (event) => {
      const control = event.target.closest?.(controls);
      if (!control || control.matches(':disabled, [aria-disabled="true"]'))
        return;
      const step = control.matches(
        "[data-go], [data-dialog-discard], [data-entry], [data-type-detail], [data-action=back], [data-action=quiz-back], [data-action=quiz-next], [data-action=home], [data-action=record], [data-action=diary], [data-action=history], [data-action=catalog], [data-action=begin]",
      );
      interaction(step ? "step" : "tap");
    },
    true,
  );
  document.addEventListener(
    "change",
    (event) => {
      if (event.target.matches("select")) interaction();
    },
    true,
  );

  return {
    transition(kind) {
      if (kind === "result" || !resetPulse) pulse(kind);
    },
  };
}
