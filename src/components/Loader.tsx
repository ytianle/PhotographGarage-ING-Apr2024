interface LoaderProps {
  active: boolean;
}

export function Loader({ active }: LoaderProps) {
  if (!active) {
    return null;
  }
  return <div className="loader" role="status" aria-label="Loading" />;
}
