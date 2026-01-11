import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  source: string;
}

export function LazyImage({ source, className, onLoad, alt, ...rest }: LazyImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const imageEl = imgRef.current;
    if (!imageEl) {
      return;
    }

    const shouldEagerLoad =
      typeof window !== "undefined" && /iPhone|iPad|iPod/i.test(window.navigator.userAgent);

    const handleLoad = (event: Event) => {
      setIsLoaded(true);
      onLoad?.(event as unknown as SyntheticEvent<HTMLImageElement>);
    };

    imageEl.addEventListener("load", handleLoad);

    if (shouldEagerLoad) {
      imageEl.src = source;
      return () => {
        imageEl.removeEventListener("load", handleLoad);
      };
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              imageEl.src = source;
              obs.disconnect();
            }
          });
        },
        { rootMargin: "50px", threshold: 0.01 }
      );
      observer.observe(imageEl);
      return () => {
        observer.disconnect();
        imageEl.removeEventListener("load", handleLoad);
      };
    }

    imageEl.src = source;

    return () => {
      imageEl.removeEventListener("load", handleLoad);
    };
  }, [source, onLoad]);

  const classes = ["lazy-image", isLoaded ? "loaded" : "", className ?? ""].filter(Boolean).join(" ");

  return <img ref={imgRef} className={classes} alt={alt} loading="lazy" decoding="async" {...rest} />;
}
