import { useGallery } from "../context/GalleryContext";

export function Breadcrumb() {
  const { currentPath, goToPath } = useGallery();

  const handleClick = (index: number) => {
    const targetPath = currentPath.slice(0, index + 1);
    goToPath(targetPath);
  };

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {currentPath.map((segment, index) => {
        const label = index === 0 ? "Public" : segment;
        const isLast = index === currentPath.length - 1;
        return (
          <span key={segment + index}>
            <a
              href="#"
              className={isLast ? "active" : undefined}
              onClick={(event) => {
                event.preventDefault();
                handleClick(index);
              }}
            >
              {label}
            </a>
            {!isLast && <span>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
