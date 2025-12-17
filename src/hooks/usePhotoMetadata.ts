import { useEffect, useRef, useState } from "react";
import type { PhotoAsset } from "../lib/types";

type PhotoMetadata = Record<string, Record<string, string> | null>;

export function usePhotoMetadata(photos: PhotoAsset[]) {
  const cacheRef = useRef<Map<string, Record<string, string>>>(new Map());
  const [metadata, setMetadata] = useState<PhotoMetadata>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const missing = photos.filter((photo) => !cacheRef.current.has(photo.infoUrl));

    if (missing.length === 0) {
      const newState: PhotoMetadata = {};
      photos.forEach((photo) => {
        const info = cacheRef.current.get(photo.infoUrl) ?? null;
        newState[photo.originalUrl] = info;
      });
      setMetadata(newState);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);

    Promise.all(
      missing.map(async (photo) => {
        try {
          const response = await fetch(photo.infoUrl);
          if (!response.ok) {
            return { photo, info: null } as const;
          }
          const json = (await response.json()) as Record<string, string>;
          return { photo, info: json } as const;
        } catch (error) {
          return { photo, info: null } as const;
        }
      })
    )
      .then((results) => {
        if (cancelled) {
          return;
        }
        results.forEach(({ photo, info }) => {
          if (info) {
            cacheRef.current.set(photo.infoUrl, info);
          }
        });
        const newState: PhotoMetadata = {};
        photos.forEach((photo) => {
          const info = cacheRef.current.get(photo.infoUrl) ?? null;
          newState[photo.originalUrl] = info;
        });
        setMetadata(newState);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [photos]);

  return { metadata, isLoading };
}
