interface LoaderProps {
  active: boolean;
}

export function Loader({ active }: LoaderProps) {
  return (
    <div className={`theater-loader${active ? " active" : ""}`} role="status" aria-label="Loading" aria-hidden={!active}>
      <div className="theater-curtain top" aria-hidden="true" />
      <div className="theater-spot">
        <div className="duck" />
      </div>
      <div className="theater-curtain bottom" aria-hidden="true" />
    </div>
  );
}
