import { useMemo } from "react";
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
    paginationEnabled,
    currentPage,
    photosPerPage,
    defaultRootCovers,
    albumCovers
  } = useGallery();

  const folderEntries = useMemo(() => {
    if (!currentNode) {
      return [] as Array<[string, AlbumNode]>;
    }
    const entries = Object.entries(currentNode.folders) as Array<[string, AlbumNode]>;
    return entries.sort((a, b) => b[0].localeCompare(a[0]));
  }, [currentNode]);

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

  const showEmpty = folderEntries.length === 0 && visiblePhotos.length === 0;

  const gridStyle = useMemo(
    () => ({
      ["--thumb-size" as const]: `${Math.max(120, imagePixelSize)}px`
    }),
    [imagePixelSize]
  );

  return (
    <>
      <section className="gallery-grid" style={gridStyle}>
        {folderEntries.map(([folderName, folderNode]) => {
          const cover = resolveCover({ folderName, folderNode, currentPath, albumCovers, defaultRootCovers });
          return (
            <article
              key={folderName}
              className="folder-card"
              style={{
                backgroundImage: `url(${cover.url})`,
                width: `${imagePixelSize}px`,
                height: `${imagePixelSize}px`
              }}
              title={folderName}
              onClick={() => enterFolder(folderName)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  enterFolder(folderName);
                }
              }}
            >
              {cover.showIcon && <div className="folder-card-icon" aria-hidden="true" />}
              <div className="folder-card-label">{folderName}</div>
            </article>
          );
        })}

        {visiblePhotos.map((photo) => {
          const info = metadata[photo.originalUrl];
          const caption = info ? buildCaption(info) : undefined;

          return (
            <figure
              key={photo.originalUrl}
              className="photo-card"
              style={{ width: `${imagePixelSize}px` }}
            >
              <a
                href={photo.originalUrl}
                data-fancybox="gallery"
                data-caption={caption}
                aria-label={`Open ${photo.name}`}
              >
                <LazyImage
                  source={photo.previewUrl}
                  alt={photo.name}
                  style={{
                    width: `${imagePixelSize}px`,
                    height: "auto",
                    borderRadius: "10px",
                    margin: "10px auto"
                  }}
                />
              </a>
              <figcaption>{formatPhotoName(photo.name)}</figcaption>
            </figure>
          );
        })}

        {showEmpty && <p>No folders or photos here yet.</p>}
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

  if (folderNode.photos[0]) {
    return { url: folderNode.photos[0].previewUrl, showIcon: true };
  }

  return { url: "/unnamed.png", showIcon: true };
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
