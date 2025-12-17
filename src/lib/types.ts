export type ImageSizeKey = "small" | "medium" | "large";

export interface PhotoAsset {
  name: string;
  originalUrl: string;
  previewUrl: string;
  infoUrl: string;
}

export interface AlbumNode {
  name: string;
  path: string[];
  folders: Record<string, AlbumNode>;
  photos: PhotoAsset[];
}

export interface GalleryData {
  root: AlbumNode | null;
  flatList: string[];
}
