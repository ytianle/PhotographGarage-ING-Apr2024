import { useGallery } from "../context/GalleryContext";

export function Breadcrumb() {
  const { currentPath, goToPath } = useGallery();

  const handleClick = (index: number) => {
    const targetPath = currentPath.slice(0, index + 1);
    goToPath(targetPath);
  };

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {currentPath.map((segment, index) => {
          const label = index === 0 ? "Public" : segment;
          const isLast = index === currentPath.length - 1;
          return (
            <li key={`${segment}-${index}`} className="breadcrumb-item">
              <a
                href="#"
                className={`breadcrumb-link${isLast ? " active" : ""}`}
                title={label}
                aria-current={isLast ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  handleClick(index);
                }}
              >
                {label}
              </a>
              {!isLast && (
                <span className="breadcrumb-sep" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
