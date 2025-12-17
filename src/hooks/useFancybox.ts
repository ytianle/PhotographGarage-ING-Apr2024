import type { DependencyList } from "react";
import { useEffect } from "react";
import { Fancybox } from "@fancyapps/ui";

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
      }
    });

    return () => {
      Fancybox.destroy();
    };
  }, deps);
}
