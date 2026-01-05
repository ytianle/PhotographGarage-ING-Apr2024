import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { albumCoverImages } from "../data/albumCoverImages";
import { defaultRootCovers } from "../data/defaultCoverImages";
import { AlbumNode, ImageSizeKey } from "../lib/types";
import { buildAlbumTree, getNodeByPath } from "../lib/treeBuilder";
import { useAuth } from "./AuthContext";

interface GalleryContextValue {
  root: AlbumNode | null;
  currentNode: AlbumNode | null;
  currentPath: string[];
  isLoading: boolean;
  loadingProgress: number;
  loadingTotal: number;
  loadingProcessed: number;
  error: string | null;
  imageSize: ImageSizeKey;
  imagePixelSize: number;
  photoPixelSize: number;
  paginationEnabled: boolean;
  showPhotoNames: boolean;
  currentPage: number;
  photosPerPage: number;
  albumCovers: Record<string, string>;
  defaultRootCovers: Record<string, string>;
  setImageSize: (size: ImageSizeKey) => void;
  togglePagination: () => void;
  togglePhotoNames: () => void;
  setPaginationEnabled: (enabled: boolean) => void;
  goToPath: (path: string[]) => void;
  enterFolder: (folderName: string) => void;
  goToPage: (page: number) => void;
  refresh: () => Promise<void>;
}

const API_ENDPOINT = "https://7jaqpxmr1h.execute-api.us-west-2.amazonaws.com/prod";
const CACHE_KEY = "gallery:flatList:v1";
const FOLDER_PIXEL_SIZES: Record<ImageSizeKey, number> = {
  small: 80,
  medium: 150,
  large: 220
};

const PHOTO_PIXEL_SIZES: Record<ImageSizeKey, number> = {
  small: 150,
  medium: 220,
  large: 320
};

const GalleryContext = createContext<GalleryContextValue | undefined>(undefined);

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [root, setRoot] = useState<AlbumNode | null>(null);
  const [currentPath, setCurrentPathState] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return ["public"];
    }
    return parsePathFromLocation() ?? ["public"];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSizeState] = useState<ImageSizeKey>("medium");
  const [paginationEnabled, setPaginationEnabledState] = useState(false);
  const [showPhotoNames, setShowPhotoNames] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [photosPerPage, setPhotosPerPage] = useState(() => calculatePhotosPerPage(PHOTO_PIXEL_SIZES.medium));
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(0);
  const [loadingProcessed, setLoadingProcessed] = useState(0);
  const historyAction = useRef<"push" | "replace" | "none">("replace");
  const currentPathRef = useRef(currentPath);
  const loadingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  const fetchAlbums = useCallback(async (activeToken: string) => {
    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    const cachedList = readCachedList();
    if (cachedList.length > 0) {
      const tree = buildAlbumTree(cachedList);
      setRoot(tree);
      setLoadingProgress(100);
      setLoadingTotal(cachedList.length);
      setLoadingProcessed(cachedList.length);
    }

    const hasCache = cachedList.length > 0;
    setIsLoading(!hasCache);
    setError(null);
    setLoadingProgress(hasCache ? 100 : 0);
    setLoadingTotal(hasCache ? cachedList.length : 0);
    setLoadingProcessed(hasCache ? cachedList.length : 0);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${activeToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Session expired. Please log in again.");
          logout();
        } else {
          setError(`Unable to fetch albums (${response.status})`);
        }
        setRoot(null);
        return;
      }

      const payload = await response.json();

      if (payload?.statusCode && response.status === 200) {
        setError("Authentication failed while loading albums.");
        setRoot(null);
        return;
      }

      if (!Array.isArray(payload)) {
        setError("Unexpected API response format.");
        setRoot(null);
        return;
      }

      const progressInterval = Math.max(1, Math.floor(payload.length / 100));
      setLoadingTotal(payload.length);
      setLoadingProcessed(0);
      const tree = buildAlbumTree(payload, {
        onProgress: (percent, processed) => {
          if (!hasCache) {
            setLoadingProgress(percent);
            setLoadingProcessed(processed);
          }
        },
        progressInterval
      });
      setRoot(tree);
      setLoadingProcessed(payload.length);
      setLoadingProgress(100);
      writeCachedList(payload);
      const desiredPath = normalizePath(currentPathRef.current);
      const resolvedPath = getNodeByPath(tree, desiredPath) ? desiredPath : ["public"];
      historyAction.current = "replace";
      setCurrentPathState(resolvedPath);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setRoot(null);
    } finally {
      setLoadingProgress(100);
      setLoadingProcessed((prev) => (loadingTotal > 0 ? loadingTotal : prev));
      if (hasCache) {
        setIsLoading(false);
      } else {
        loadingTimeoutRef.current = window.setTimeout(() => {
          setIsLoading(false);
          loadingTimeoutRef.current = null;
        }, 1000);
      }
    }
  }, [logout]);

  const refresh = useCallback(async () => {
    if (!token) {
      setRoot(null);
      return;
    }
    await fetchAlbums(token);
  }, [token, fetchAlbums]);

  useEffect(() => {
    if (!token) {
      setRoot(null);
      historyAction.current = "replace";
      setCurrentPathState(["public"]);
      setCurrentPage(1);
      return;
    }

    fetchAlbums(token);
  }, [token, fetchAlbums]);

  useEffect(() => {
    const handleResize = () => {
      setPhotosPerPage(calculatePhotosPerPage(PHOTO_PIXEL_SIZES[imageSize]));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [imageSize]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      const statePath = Array.isArray(event.state?.path) ? (event.state.path as string[]) : null;
      const locationPath = parsePathFromLocation();
      const nextPath = normalizePath(statePath ?? locationPath ?? ["public"]);
      historyAction.current = "none";
      setCurrentPathState(nextPath);
      setCurrentPage(1);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("path", currentPath.join("/"));
    const state = { path: currentPath };
    const action = historyAction.current;

    if (action === "none") {
      historyAction.current = "push";
      return;
    }

    if (action === "replace") {
      window.history.replaceState(state, "", url);
    } else {
      window.history.pushState(state, "", url);
    }
    historyAction.current = "push";
  }, [currentPath]);

  useEffect(() => {
    if (!root || isLoading) {
      return;
    }

    if (!getNodeByPath(root, currentPath)) {
      historyAction.current = "replace";
      setCurrentPathState(["public"]);
      setCurrentPage(1);
    }
  }, [root, currentPath]);

  const setImageSize = useCallback((size: ImageSizeKey) => {
    setImageSizeState(size);
    setCurrentPage(1);
  }, []);

  const updateCurrentPath = useCallback(
    (recipe: (prev: string[]) => string[], action: "push" | "replace" | "none" = "push") => {
      historyAction.current = action;
      setCurrentPathState((prev) => normalizePath(recipe(prev)));
      setCurrentPage(1);
    },
    []
  );

  const togglePagination = useCallback(() => {
    setPaginationEnabledState((prev) => {
      const next = !prev;
      if (!next) {
        setCurrentPage(1);
      }
      return next;
    });
  }, []);

  const togglePhotoNames = useCallback(() => {
    setShowPhotoNames((prev) => !prev);
  }, []);

  const goToPath = useCallback((path: string[]) => {
    updateCurrentPath(() => path);
  }, [updateCurrentPath]);

  const enterFolder = useCallback((folderName: string) => {
    updateCurrentPath((prev) => prev.concat(folderName));
  }, [updateCurrentPath]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const setPaginationEnabled = useCallback((enabled: boolean) => {
    setPaginationEnabledState(enabled);
    if (!enabled) {
      setCurrentPage(1);
    }
  }, []);

  const currentNode = useMemo(() => getNodeByPath(root, currentPath), [root, currentPath]);

  const value = useMemo<GalleryContextValue>(
    () => ({
      root,
      currentNode,
      currentPath,
      isLoading,
      loadingProgress,
      loadingTotal,
      loadingProcessed,
      error,
      imageSize,
      imagePixelSize: FOLDER_PIXEL_SIZES[imageSize],
      photoPixelSize: PHOTO_PIXEL_SIZES[imageSize],
      paginationEnabled,
      showPhotoNames,
      currentPage,
      photosPerPage,
      albumCovers: albumCoverImages,
      defaultRootCovers,
      setImageSize,
      togglePagination,
      togglePhotoNames,
      setPaginationEnabled,
      goToPath,
      enterFolder,
      goToPage,
      refresh
    }),
    [
      root,
      currentNode,
      currentPath,
      isLoading,
      loadingProgress,
      loadingTotal,
      loadingProcessed,
      error,
      imageSize,
      paginationEnabled,
      showPhotoNames,
      currentPage,
      photosPerPage,
      setImageSize,
      togglePagination,
      togglePhotoNames,
      setPaginationEnabled,
      goToPath,
      enterFolder,
      goToPage,
      refresh
    ]
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery() {
  const context = useContext(GalleryContext);
  if (!context) {
    throw new Error("useGallery must be used within GalleryProvider");
  }
  return context;
}

function calculatePhotosPerPage(imageSize: number) {
  if (typeof window === "undefined") {
    return 30;
  }
  const pageWidth = window.innerWidth;
  const pageHeight = window.innerHeight;

  const horizontalGap = 28;
  const verticalGap = 28;
  const estimatedCardWidth = imageSize + horizontalGap;
  const estimatedCardHeight = imageSize * 1.25 + verticalGap;

  const imagesPerRow = Math.max(1, Math.floor(pageWidth / estimatedCardWidth));
  const imagesPerColumn = Math.max(1, Math.floor(pageHeight / estimatedCardHeight));

  return Math.min(300, Math.max(40, imagesPerRow * imagesPerColumn));
}

function parsePathFromLocation(): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("path");
    if (!value) {
      return null;
    }
    const decoded = decodeURIComponent(value);
    const segments = decoded
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    return normalizePath(segments);
  } catch (error) {
    return null;
  }
}

function normalizePath(path: string[]): string[] {
  const segments = path.map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return ["public"];
  }
  if (segments[0] !== "public") {
    return ["public", ...segments];
  }
  return [...segments];
}

function readCachedList(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeCachedList(list: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch (error) {
    // Ignore cache write errors.
  }
}
