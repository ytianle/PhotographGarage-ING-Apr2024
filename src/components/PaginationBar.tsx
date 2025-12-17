import { useGallery } from "../context/GalleryContext";

interface PaginationBarProps {
  totalItems: number;
}

export function PaginationBar({ totalItems }: PaginationBarProps) {
  const { paginationEnabled, photosPerPage, currentPage, goToPage } = useGallery();

  if (!paginationEnabled) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, photosPerPage)));

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination-bar">
      <div className="pagination-inner">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <button
            key={page}
            type="button"
            className={`pagination-button${page === currentPage ? " active" : ""}`}
            onClick={() => goToPage(page)}
          >
            {page}
          </button>
        ))}
      </div>
    </div>
  );
}
