import { isRecitePunct } from '../grading/longq.ts';

type ReciteGridProps = {
  boxes: readonly string[];
  value: string;
};

type Cell = { key: string; className: string; text: string };

function layoutCells(boxes: readonly string[], typed: readonly string[]): Cell[] {
  const laid = boxes.reduce<{ order: number; cells: Cell[] }>(
    (state, expected, index) => {
      if (isRecitePunct(expected)) {
        return {
          order: state.order,
          cells: [...state.cells, { key: `p-${index}`, className: 'recite-cell punct', text: expected }],
        };
      }
      const text = typed[state.order] ?? '';
      return {
        order: state.order + 1,
        cells: [
          ...state.cells,
          {
            key: `h-${index}`,
            className: text ? 'recite-cell filled' : 'recite-cell empty',
            text,
          },
        ],
      };
    },
    { order: 0, cells: [] },
  );
  return laid.cells;
}

/** Square preview above the recite field. Punctuation is prefilled; hanzi follow the textarea. */
export function ReciteGrid({ boxes, value }: ReciteGridProps) {
  const typed = Array.from(value).filter((ch) => !isRecitePunct(ch) && !/\s/.test(ch));
  const hanziSlots = boxes.filter((ch) => !isRecitePunct(ch)).length;
  const cells = layoutCells(boxes, typed);
  const overflow = typed.slice(hanziSlots);
  const filled = Math.min(typed.length, hanziSlots);

  return (
    <div className="recite-live">
      <div className="char-grid" role="img" aria-label="背誦即時方格預覽">
        {cells.map((cell) => (
          <span key={cell.key} className={cell.className}>
            {cell.text}
          </span>
        ))}
        {overflow.map((ch, index) => (
          <span key={`over-${index}`} className="recite-cell filled overflow-mark">
            {ch}
          </span>
        ))}
      </div>
      <p className="recite-meta">
        已填漢字 <strong>{filled}</strong>／{hanziSlots}
        {overflow.length > 0 ? `，多出 ${overflow.length} 字` : ''}
      </p>
    </div>
  );
}
