import type { DependencyList } from "react";
import { useEffect } from "react";
import { Fancybox } from "@fancyapps/ui";

const TOGGLE_BUTTON_CLASS = "fancybox-toggle-source";
const PROGRESS_CLASS = "fancybox-source-progress";
const LABEL_ORIGINAL = "View Original";
const LABEL_COMPRESSED = "View Compressed";

type SourceState = "original" | "compressed" | "unknown";
const activeRequests = new WeakMap<any, XMLHttpRequest>();
const slideSource = new WeakMap<any, SourceState>();

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
  const toolbar = fancybox?.container?.querySelector(
    ".fancybox__toolbar__column.is-right"
  ) as HTMLElement | null;
  if (!toolbar) {
    return null;
  }

  let button = toolbar.querySelector(`.${TOGGLE_BUTTON_CLASS}`) as HTMLButtonElement | null;
  if (button) {
    return button;
  }

  button = document.createElement("button");
  button.type = "button";
  button.className = `f-button ${TOGGLE_BUTTON_CLASS}`;
  button.textContent = LABEL_ORIGINAL;
  button.title = LABEL_ORIGINAL;
  toolbar.prepend(button);

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
  if (!slide || !button) {
    return;
  }

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

export function useFancybox(deps: DependencyList) {
  useEffect(() => {
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
        display: {
          left: ["infobar"],
          middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "flipX", "flipY"],
          right: ["slideshow", "thumbs", "close"]
        }
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
