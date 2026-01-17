import type { DependencyList } from "react";
import { useEffect } from "react";
import { Fancybox } from "@fancyapps/ui";

const TOGGLE_BUTTON_CLASS = "fancybox-toggle-source";
const INFO_BUTTON_CLASS = "fancybox-toggle-info";
const PROGRESS_CLASS = "fancybox-source-progress";
const LABEL_ORIGINAL = "View Original";
const LABEL_COMPRESSED = "View Compressed";
const LABEL_INFO_ON = "Hide Info";
const LABEL_INFO_OFF = "Show Info";
const INFO_ICON = "ⓘ";

type SourceState = "original" | "compressed" | "unknown";
const activeRequests = new WeakMap<any, XMLHttpRequest>();
const slideSource = new WeakMap<any, SourceState>();
const watermarkMasks = new Map<string, string>();
let infoVisible = false;
let allowOriginalSource = true;
let watermarkEnabled = false;
let minimalUi = false;

function getSlideSources(slide: any) {
  const trigger = slide?.triggerEl as HTMLElement | null;
  const original = trigger?.dataset?.fancyboxOriginal || "";
  const compressed = trigger?.dataset?.fancyboxCompressed || "";
  return { original, compressed };
}

function getCurrentState(slide: any, original: string, compressed: string): SourceState {
  const img = slide?.contentEl?.querySelector("img") as HTMLImageElement | null;
  const current = img?.getAttribute("src") || slide?.src || "";
  if (original && current === original) {
    return "original";
  }
  if (compressed && current === compressed) {
    return "compressed";
  }
  return "unknown";
}

function getStoredState(slide: any): SourceState {
  return slideSource.get(slide) ?? "unknown";
}

function setStoredState(slide: any, state: SourceState) {
  slideSource.set(slide, state);
}

function setInfoState(container: HTMLElement, next: boolean) {
  infoVisible = next;
  container.classList.toggle("is-info-visible", infoVisible);
}

function ensureInfoButton(fancybox: any) {
  const container = fancybox?.container as HTMLElement | null;
  if (!container) {
    return null;
  }
  const existingButtons = Array.from(
    container.querySelectorAll(`.${INFO_BUTTON_CLASS}`)
  ) as HTMLButtonElement[];
  const primaryButton = existingButtons[0] ?? null;
  for (let i = 1; i < existingButtons.length; i += 1) {
    existingButtons[i].remove();
  }

  const toolbar = container.querySelector(
    ".fancybox__toolbar__column.is-right"
  ) as HTMLElement | null;
  if (!toolbar) {
    return null;
  }

  let button = primaryButton;
  if (button) {
    if (button.parentElement !== toolbar) {
      toolbar.prepend(button);
    }
    return button;
  }

  button = document.createElement("button");
  button.type = "button";
  button.className = `f-button ${INFO_BUTTON_CLASS}`;
  button.setAttribute("aria-pressed", String(infoVisible));
  button.textContent = INFO_ICON;
  button.title = infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF;
  button.setAttribute("aria-label", infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF);
  toolbar.prepend(button);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !infoVisible;
    setInfoState(container, next);
    button.setAttribute("aria-pressed", String(infoVisible));
    button.title = infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF;
    button.setAttribute("aria-label", infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF);
  });

  return button;
}

function updateButtonLabel(button: HTMLButtonElement, state: SourceState) {
  if (state === "original") {
    button.textContent = LABEL_COMPRESSED;
    button.title = LABEL_COMPRESSED;
    return;
  }
  button.textContent = LABEL_ORIGINAL;
  button.title = LABEL_ORIGINAL;
}

function ensureProgressEl(slideEl: HTMLElement) {
  let el = slideEl.querySelector(`.${PROGRESS_CLASS}`) as HTMLDivElement | null;
  if (el) {
    return el;
  }
  el = document.createElement("div");
  el.className = PROGRESS_CLASS;
  el.textContent = "0%";
  slideEl.appendChild(el);
  return el;
}

function setSlideWatermark(slide: any, enabled: boolean) {
  const contentEl = slide?.contentEl as HTMLElement | undefined;
  if (!contentEl) {
    return;
  }
  contentEl.classList.toggle("is-watermarked", enabled);
  if (!enabled) {
    contentEl.style.removeProperty("--watermark-mask");
  }
}

function applyWatermarkMask(slide: any) {
  if (!watermarkEnabled) {
    return;
  }
  const contentEl = slide?.contentEl as HTMLElement | undefined;
  const img = contentEl?.querySelector("img") as HTMLImageElement | null;
  if (!contentEl || !img) {
    return;
  }
  const src = img.currentSrc || img.src;
  if (!src) {
    return;
  }
  const cached = watermarkMasks.get(src);
  if (cached) {
    contentEl.style.setProperty("--watermark-mask", `url("${cached}")`);
    return;
  }
  if (!img.complete || img.naturalWidth === 0) {
    img.addEventListener(
      "load",
      () => {
        applyWatermarkMask(slide);
      },
      { once: true }
    );
    return;
  }
  try {
    const maxSize = 360;
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);
    const data = source.data;
    const out = output.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const alpha = Math.max(0, Math.min(255, Math.round(((luminance - 1000) / 1) * 255)));
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = alpha;
    }
    ctx.putImageData(output, 0, 0);
    const maskUrl = canvas.toDataURL("image/png");
    watermarkMasks.set(src, maskUrl);
    contentEl.style.setProperty("--watermark-mask", `url("${maskUrl}")`);
  } catch {
    contentEl.style.removeProperty("--watermark-mask");
  }
}

function setSlideLoading(slide: any, isLoading: boolean) {
  const el = slide?.el as HTMLElement | undefined;
  if (!el) {
    return;
  }
  el.classList.toggle("is-switching-source", isLoading);
  if (!isLoading) {
    const progressEl = el.querySelector(`.${PROGRESS_CLASS}`);
    progressEl?.remove();
  }
}

function setSlideProgress(slide: any, percent: number) {
  const el = slide?.el as HTMLElement | undefined;
  if (!el) {
    return;
  }
  const progressEl = ensureProgressEl(el);
  const safePercent = Math.max(0, Math.min(100, percent));
  progressEl.textContent = `${safePercent}%`;
}

function loadImageWithProgress(
  slide: any,
  img: HTMLImageElement,
  nextSrc: string,
  onDone: () => void
) {
  const previous = activeRequests.get(slide);
  if (previous) {
    previous.abort();
  }

  const xhr = new XMLHttpRequest();
  activeRequests.set(slide, xhr);
  xhr.open("GET", nextSrc, true);
  xhr.responseType = "blob";

  xhr.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) {
      const percent = Math.round((event.loaded / event.total) * 100);
      setSlideProgress(slide, percent);
    } else {
      setSlideProgress(slide, 0);
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
      const objectUrl = URL.createObjectURL(xhr.response);
      img.addEventListener(
        "load",
        () => {
          URL.revokeObjectURL(objectUrl);
          onDone();
        },
        { once: true }
      );
      img.src = objectUrl;
      return;
    }

    img.src = nextSrc;
    onDone();
  };

  xhr.onerror = () => {
    img.src = nextSrc;
    onDone();
  };

  xhr.send();
}

function ensureToggleButton(fancybox: any) {
  const container = fancybox?.container as HTMLElement | null;
  if (!container) {
    return null;
  }
  const existingButtons = Array.from(
    container.querySelectorAll(`.${TOGGLE_BUTTON_CLASS}`)
  ) as HTMLButtonElement[];
  const primaryButton = existingButtons[0] ?? null;
  for (let i = 1; i < existingButtons.length; i += 1) {
    existingButtons[i].remove();
  }

  const toolbar = container.querySelector(
    ".fancybox__toolbar__column.is-right"
  ) as HTMLElement | null;
  const leftToolbar = container.querySelector(
    ".fancybox__toolbar__column.is-left"
  ) as HTMLElement | null;
  if (!toolbar) {
    return null;
  }

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const target = isMobile ? toolbar : leftToolbar || toolbar;

  let button = primaryButton;
  if (button) {
    if (button.parentElement !== target) {
      target.prepend(button);
    }
    return button;
  }

  button = document.createElement("button");
  button.type = "button";
  button.className = `f-button ${TOGGLE_BUTTON_CLASS}`;
  button.textContent = LABEL_ORIGINAL;
  button.title = LABEL_ORIGINAL;
  target.prepend(button);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const slide = fancybox.getSlide();
    if (!slide) {
      return;
    }

    const { original, compressed } = getSlideSources(slide);
    if (!original || !compressed) {
      return;
    }

    const state = getCurrentState(slide, original, compressed);
    const effectiveState = state !== "unknown" ? state : getStoredState(slide);
    const nextState = effectiveState === "original" ? "compressed" : "original";
    const nextSrc = nextState === "original" ? original : compressed;
    const img = slide?.contentEl?.querySelector("img") as HTMLImageElement | null;
    if (img) {
      setSlideLoading(slide, true);
      const finalize = () => {
        setSlideLoading(slide, false);
        img.removeEventListener("load", finalize);
        img.removeEventListener("error", finalize);
        setStoredState(slide, nextState);
      };
      img.addEventListener("load", finalize);
      img.addEventListener("error", finalize);
      setSlideProgress(slide, 0);
      loadImageWithProgress(slide, img, nextSrc, finalize);
    }
    slide.src = nextSrc;
    updateButtonLabel(button, nextState);
  });

  return button;
}

function syncToggleButton(fancybox: any) {
  const slide = fancybox.getSlide();
  const button = ensureToggleButton(fancybox);
  const infoButton = minimalUi ? null : ensureInfoButton(fancybox);
  if (!slide || !button) {
    return;
  }

  setSlideWatermark(slide, watermarkEnabled);
  applyWatermarkMask(slide);

  if (infoButton) {
    const container = fancybox?.container as HTMLElement | null;
    if (container) {
      setInfoState(container, infoVisible);
      infoButton.setAttribute("aria-pressed", String(infoVisible));
      infoButton.title = infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF;
      infoButton.setAttribute("aria-label", infoVisible ? LABEL_INFO_ON : LABEL_INFO_OFF);
    }
  }

  if (!allowOriginalSource || minimalUi) {
    button.disabled = true;
    button.style.display = "none";
    return;
  }

  button.style.display = "";
  const { original, compressed } = getSlideSources(slide);
  if (!original || !compressed) {
    button.disabled = true;
    return;
  }

  button.disabled = false;
  const state = getCurrentState(slide, original, compressed);
  const resolvedState = state === "unknown" ? getStoredState(slide) : state;
  const initialState = resolvedState === "unknown" ? "compressed" : resolvedState;
  setStoredState(slide, initialState);
  updateButtonLabel(button, initialState);
}

export function useFancybox(
  deps: DependencyList,
  options?: { allowOriginal?: boolean; watermark?: boolean; minimalUi?: boolean }
) {
  useEffect(() => {
    allowOriginalSource = options?.allowOriginal ?? true;
    watermarkEnabled = options?.watermark ?? false;
    minimalUi = options?.minimalUi ?? false;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const toolbarDisplay = minimalUi
      ? { left: [], middle: [], right: ["close"] }
      : isMobile
        ? {
            left: ["infobar"],
            middle: ["zoomIn", "zoomOut", "toggle1to1"],
            right: ["slideshow", "thumbs", "close"]
          }
        : {
            left: ["infobar"],
            middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "flipX", "flipY"],
            right: ["slideshow", "thumbs", "close"]
          };

    Fancybox.bind("[data-fancybox='gallery']", {
      loop: true,
      contentClick: "toggleCover",
      Images: {
        Panzoom: {
          maxScale: 2
        },
        protected: true
      },
      Toolbar: {
        display: toolbarDisplay
      },
      Thumbs: {
        autoStart: !isMobile && !minimalUi
      },
      on: {
        "Carousel.ready": (fancybox: any) => {
          syncToggleButton(fancybox);
        },
        "Carousel.change": (fancybox: any) => {
          syncToggleButton(fancybox);
        },
        done: (fancybox: any) => {
          syncToggleButton(fancybox);
        }
      }
    });

    return () => {
      Fancybox.destroy();
    };
  }, deps);
}
