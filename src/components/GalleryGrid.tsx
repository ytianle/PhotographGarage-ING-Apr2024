import { useEffect, useMemo, useRef, useState } from "react";
import type { AlbumNode } from "../lib/types";
import { useGallery } from "../context/GalleryContext";
import { LazyImage } from "./LazyImage";
import { PaginationBar } from "./PaginationBar";
import { useFancybox } from "../hooks/useFancybox";
import { usePhotoMetadata } from "../hooks/usePhotoMetadata";

const ROOT_PATH = "public";

export function GalleryGrid() {
  const {
    currentNode,
    currentPath,
    enterFolder,
    imagePixelSize,
    imageSize,
    photoPixelSize,
    isLoading,
    paginationEnabled,
    showPhotoNames,
    currentPage,
    photosPerPage,
    defaultRootCovers,
    albumCovers
  } = useGallery();

  const folderTileSize = imagePixelSize;
  const photoTileSize = Math.max(120, photoPixelSize);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [layoutVars, setLayoutVars] = useState(() => ({
    cols: 1,
    gapPx: 24,
    widthPx: photoTileSize,
    folderCols: 1
  }));

  const [hoverTooltip, setHoverTooltip] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  }>({ visible: false, text: "", x: 0, y: 0 });

  const hideTooltip = () => {
    setHoverTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const showTooltip = (text: string, x: number, y: number) => {
    setHoverTooltip({ visible: true, text, x, y });
  };

  const folderEntries = useMemo(() => {
    if (!currentNode) {
      return [] as Array<[string, AlbumNode]>;
    }
    const entries = Object.entries(currentNode.folders) as Array<[string, AlbumNode]>;
    return entries.sort((a, b) => b[0].localeCompare(a[0]));
  }, [currentNode]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) {
      return;
    }

    const gapPx = 24;

    const update = () => {
      const available = element.clientWidth;
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const folderColsBySize = {
        small: 3,
        medium: 3,
        large: 2
      } as const;
      const mobileColsBySize = {
        small: 4,
        medium: 3,
        large: 2
      } as const;
      const cols = isMobile
        ? mobileColsBySize[imageSize]
        : Math.max(1, Math.floor((available + gapPx) / (photoTileSize + gapPx)));
      const folderCols = isMobile ? folderColsBySize[imageSize] : 1;
      const widthPx = isMobile
        ? available
        : cols * photoTileSize + Math.max(0, cols - 1) * gapPx;
      setLayoutVars((prev) =>
        prev.cols === cols && prev.widthPx === widthPx && prev.folderCols === folderCols
          ? prev
          : { cols, gapPx, widthPx, folderCols }
      );
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(element);
    return () => observer.disconnect();
  }, [photoTileSize, imageSize]);

  const totalPhotos = currentNode?.photos.length ?? 0;

  const visiblePhotos = useMemo(() => {
    if (!currentNode) {
      return [];
    }
    if (!paginationEnabled) {
      return currentNode.photos;
    }
    const start = (currentPage - 1) * Math.max(1, photosPerPage);
    const end = start + Math.max(1, photosPerPage);
    return currentNode.photos.slice(start, end);
  }, [currentNode, paginationEnabled, currentPage, photosPerPage]);

  const { metadata } = usePhotoMetadata(visiblePhotos);
  const fancyboxKey = useMemo(() => visiblePhotos.map((photo) => photo.originalUrl).join("|"), [visiblePhotos]);
  useFancybox([fancyboxKey]);

  const showEmpty = !isLoading && folderEntries.length === 0 && visiblePhotos.length === 0;

  const gridStyle = useMemo(
    () => ({
      ["--thumb-size" as const]: `${photoTileSize}px`,
      ["--grid-cols" as const]: `${layoutVars.cols}`,
      ["--grid-gap" as const]: `${layoutVars.gapPx}px`,
      ["--grid-width" as const]: `${layoutVars.widthPx}px`,
      ["--folder-cols" as const]: `${layoutVars.folderCols}`
    }),
    [photoTileSize, layoutVars]
  );

  return (
    <>
      <section ref={sectionRef} className="gallery-grid" style={gridStyle}>
        {hoverTooltip.visible && (
          <div
            className="cursor-tooltip"
            role="tooltip"
            style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
          >
            {hoverTooltip.text}
          </div>
        )}
        {folderEntries.length > 0 && (
          <div className="folder-grid">
            {folderEntries.map(([folderName, folderNode], idx) => {
              const cover = resolveCover({ folderName, folderNode, currentPath, albumCovers, defaultRootCovers });
              return (
                <article
                  key={folderName}
                  className={`folder-card stagger-jump`}
                  style={{
                    backgroundImage: `url("${cover.url}")`,
                    width: `${folderTileSize}px`,
                    height: `${folderTileSize}px`,
                    ["--jump-delay" as any]: `${idx * 40}ms`
                  }}
                  title={folderName}
                  onClick={() => {
                    hideTooltip();
                    enterFolder(folderName);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      hideTooltip();
                      enterFolder(folderName);
                    }
                  }}
                >
                  {cover.showIcon && <div className="folder-card-icon" aria-hidden="true" />}
                  <div
                    className="folder-card-label"
                    onMouseEnter={(event) => {
                      showTooltip(folderName, event.clientX + 14, event.clientY + 14);
                    }}
                    onMouseMove={(event) => {
                      setHoverTooltip((prev) =>
                        prev.visible
                          ? {
                              ...prev,
                              x: event.clientX + 14,
                              y: event.clientY + 14
                            }
                          : prev
                      );
                    }}
                    onMouseLeave={hideTooltip}
                  >
                    {folderName}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {visiblePhotos.length > 0 && (
          <div className="photo-masonry" aria-label="Photos">
            {visiblePhotos.map((photo, idx) => {
              const info = metadata[photo.originalUrl];
              const caption = info ? buildCaption(info) : undefined;
              const fullName = getFullPhotoName(photo.name);

              return (
                <figure
                  key={photo.originalUrl}
                  className={`photo-card stagger-jump`}
                  title={fullName}
                  style={{
                    ["--jump-delay" as any]: `${idx * 40}ms`
                  }}
                >
                  <a
                    href={photo.middleUrl}
                    data-fancybox="gallery"
                    data-fancybox-original={photo.originalUrl}
                    data-fancybox-compressed={photo.middleUrl}
                    data-caption={caption}
                    aria-label={`Open ${photo.name}`}
                    title={fullName}
                  >
                    <LazyImage
                      source={photo.previewUrl}
                      alt={photo.name}
                      style={{
                        width: "100%",
                        height: "auto",
                        borderRadius: "10px"
                      }}
                    />
                  </a>
                  {showPhotoNames && <figcaption title={fullName}>{formatPhotoName(photo.name)}</figcaption>}
                </figure>
              );
            })}
          </div>
        )}

        {showEmpty && (
          <div className="empty-state" role="status" aria-live="polite">
            <div className="empty-state-gif" aria-hidden="true" />
            <p className="sr-only">No folders or photos here yet.</p>
          </div>
        )}
      </section>
      <PaginationBar totalItems={totalPhotos} />
    </>
  );
}

function resolveCover({
  folderName,
  folderNode,
  currentPath,
  albumCovers,
  defaultRootCovers
}: {
  folderName: string;
  folderNode: AlbumNode;
  currentPath: string[];
  albumCovers: Record<string, string>;
  defaultRootCovers: Record<string, string>;
}): { url: string; showIcon: boolean } {
  const isRoot = currentPath.length === 1 && currentPath[0] === ROOT_PATH;

  if (isRoot && defaultRootCovers[folderName]) {
    return { url: defaultRootCovers[folderName], showIcon: false };
  }

  const targetPattern = albumCovers[folderName];

  if (targetPattern && folderNode.photos.length) {
    const firstPhoto = folderNode.photos[0].originalUrl;
    const base = extractPublicBase(firstPhoto);
    const replaced = targetPattern.replace("+", base).replace("*", folderName);
    const prefix = replaced.split("*")[0];
    const match = folderNode.photos.find((photo) => photo.originalUrl.startsWith(prefix));
    if (match) {
      return { url: match.previewUrl, showIcon: true };
    }
  }

  const candidate = findFirstPhoto(folderNode);
  if (candidate) {
    return { url: candidate.previewUrl, showIcon: true };
  }

  return { url: "/unnamed.png", showIcon: true };
}

function findFirstPhoto(node: AlbumNode): AlbumNode["photos"][number] | null {
  if (node.photos[0]) {
    return node.photos[0];
  }

  for (const child of Object.values(node.folders)) {
    const found = findFirstPhoto(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractPublicBase(url: string) {
  const index = url.indexOf("/public/");
  if (index === -1) {
    return url;
  }
  return url.slice(0, index + "/public".length);
}

function buildCaption(info: Record<string, string>) {
  const rows = [
    { key: "Exposure Time", label: "⏳ Exposure Time" },
    { key: "F Number", label: "💿 Aperture" },
    { key: "ISO Speed", label: "🔆 ISO Speed" },
    { key: "Focal Length", label: "🔭 Focal Length" },
    { key: "Flash", label: "📸 Flash" }
  ];

  const content = rows
    .map((row) => {
      const value = info[row.key] ?? "—";
      return `<span class="caption-key">${row.label}: </span><span class="caption-value">${value}</span>`;
    })
    .join("<br/>");

  return `<div style="position:absolute;bottom:6%;left:3%;font-size:1.15em;text-align:left;">${content}</div>`;
}

function formatPhotoName(name: string) {
  const [base] = name.split("?");
  if (!base.includes("-")) {
    return base;
  }
  const [prefix] = base.split("-");
  return `${prefix}.jpg`;
}

function getFullPhotoName(name: string) {
  const [base] = name.split("?");
  return base;
}
