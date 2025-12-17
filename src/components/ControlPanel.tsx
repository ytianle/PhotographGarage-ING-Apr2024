import { useState } from "react";
import { FiSettings, FiToggleLeft, FiToggleRight } from "react-icons/fi";
import { TbArrowsDiagonalMinimize2, TbArrowsDiagonal, TbArrowsMaximize } from "react-icons/tb";
import { useGallery } from "../context/GalleryContext";

const SIZE_CONFIG = [
  { key: "small", label: "Small", icon: TbArrowsDiagonalMinimize2 },
  { key: "medium", label: "Medium", icon: TbArrowsDiagonal },
  { key: "large", label: "Large", icon: TbArrowsMaximize }
] as const;

export function ControlPanel() {
  const [open, setOpen] = useState(false);
  const { imageSize, setImageSize, paginationEnabled, togglePagination, currentNode } = useGallery();
  const hasPhotos = (currentNode?.photos.length ?? 0) > 0;

  return (
    <aside className="control-panel">
      <button
        type="button"
        className="control-panel-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <FiSettings size={22} />
      </button>
      {open && (
        <div className="control-panel-drawer">
          {SIZE_CONFIG.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`control-button${imageSize === key ? " active" : ""}`}
              onClick={() => setImageSize(key)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`control-button${paginationEnabled ? " active" : ""}`}
            onClick={togglePagination}
            disabled={!hasPhotos}
          >
            {paginationEnabled ? <FiToggleRight size={20} /> : <FiToggleLeft size={20} />}
            Pagination
          </button>
        </div>
      )}
    </aside>
  );
}
