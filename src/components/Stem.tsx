type StemProps = {
  stem: string;
  target: string;
};

export function Stem({ stem, target }: StemProps) {
  if (!target || !stem.includes(target)) {
    return <p className="stem">{stem}</p>;
  }
  const parts = stem.split(target);
  return (
    <p className="stem">
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          {part}
          {index < parts.length - 1 ? <strong className="target">{target}</strong> : null}
        </span>
      ))}
    </p>
  );
}
