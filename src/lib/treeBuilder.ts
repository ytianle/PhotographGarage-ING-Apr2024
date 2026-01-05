import { AlbumNode, PhotoAsset } from "./types";

const IMAGE_EXTENSIONS = /\.(jpe?g|png)$/i;

type ProgressOptions = {
  onProgress?: (percent: number, processed: number, total: number) => void;
  progressInterval?: number;
};

export function buildAlbumTree(urls: string[], options: ProgressOptions = {}): AlbumNode {
  const root: AlbumNode = {
    name: "public",
    path: ["public"],
    folders: {},
    photos: []
  };

  const total = urls.length;
  const onProgress = options.onProgress;
  const progressInterval = options.progressInterval ?? 50;

  urls.forEach((url, idx) => {
    const match = url.match(/public\/(.+)$/);
    if (!match) {
      if (onProgress && (idx + 1) % progressInterval === 0) {
        onProgress(Math.round(((idx + 1) / total) * 100), idx + 1, total);
      }
      return;
    }

    const relativePath = match[1];
    const segments = relativePath.split("/");
    let node = root;

    segments.forEach((segment, idx) => {
      const isFile = idx === segments.length - 1;

      if (isFile) {
        if (!IMAGE_EXTENSIONS.test(segment)) {
          return;
        }

        const photo = createPhotoAsset(url, node.path.concat(segment));
        node.photos.push(photo);
        return;
      }

      if (!node.folders[segment]) {
        node.folders[segment] = {
          name: segment,
          path: node.path.concat(segment),
          folders: {},
          photos: []
        };
      }

      node = node.folders[segment];
    });

    if (onProgress && ((idx + 1) % progressInterval === 0 || idx + 1 === total)) {
      onProgress(Math.round(((idx + 1) / total) * 100), idx + 1, total);
    }
  });

  return root;
}

function createPhotoAsset(originalUrl: string, path: string[]): PhotoAsset {
  const fileNameWithQuery = path[path.length - 1];
  const fileName = fileNameWithQuery.split("?")[0];
  const middleUrl = originalUrl
    .replace("/public/", "/public_middle/")
    .replace(/\.[^.?]+(?=\?|$)/, ".webp");
  const previewUrl = originalUrl.replace("/public/", "/public_small/");
  const infoUrl = previewUrl.replace(/\.[^.]+$/, "_info.json");

  return {
    name: fileName,
    originalUrl,
    middleUrl,
    previewUrl,
    infoUrl
  };
}

export function getNodeByPath(root: AlbumNode | null, path: string[]): AlbumNode | null {
  if (!root) {
    return null;
  }

  if (path.length === 0) {
    return root;
  }

  let node: AlbumNode | null = root;

  for (let i = 1; i < path.length; i += 1) {
    if (!node?.folders[path[i]]) {
      return null;
    }
    node = node.folders[path[i]];
  }

  return node;
}
