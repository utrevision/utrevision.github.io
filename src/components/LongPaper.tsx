import { useState, type ReactNode } from 'react';
import { Stem } from './Stem.tsx';
import { ReciteGrid } from './ReciteGrid.tsx';
import {
  fieldKey,
  isRecitePunct,
  visibleChars,
  type GlossLongItem,
  type LongItem,
  type LongQuiz,
} from '../grading/longq.ts';

type LongPaperProps = {
  paper: LongQuiz;
  answers: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
};

function valueOf(answers: Readonly<Record<string, string>>, key: string): string {
  return answers[key] ?? '';
}

function GlossGroup({
  items,
  answers,
  onChange,
}: {
  items: readonly GlossLongItem[];
  answers: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
}) {
  const max = items.reduce((sum, item) => sum + item.max, 0);
  return (
    <section className="q-card" aria-labelledby="q-gloss-1">
      <div className="q-head">
        <h3 id="q-gloss-1">題1</h3>
        <span className="pts">{max} 分</span>
      </div>
      {items[0]?.prompt ? <p>{items[0].prompt}</p> : null}
      {items.map((item) => (
        <div key={item.id} className="gloss-sub">
          <p className="meta">{item.qNo}</p>
          <Stem stem={item.stem} target={item.target} />
          {item.sourceLabel ? <p className="hint">{item.sourceLabel}</p> : null}
          <div className="field">
            <label htmlFor={`field-${item.id}`}>「{item.target}」</label>
            <input
              id={`field-${item.id}`}
              name={item.id}
              type="text"
              lang="zh-Hant"
              value={valueOf(answers, item.id)}
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => onChange(item.id, event.target.value)}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

export function LongPaper({ paper, answers, onChange }: LongPaperProps) {
  const [gaps, setGaps] = useState<ReadonlySet<string>>(new Set());

  function leaveField(id: string, complete: boolean) {
    setGaps((current) => {
      const next = new Set(current);
      if (complete) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < paper.items.length) {
    const item = paper.items[index];
    if (!item) break;
    if (item.type === 'gloss') {
      const group: GlossLongItem[] = [];
      const prompt = item.prompt;
      while (index < paper.items.length) {
        const next = paper.items[index];
        if (!next || next.type !== 'gloss' || next.prompt !== prompt) break;
        group.push(next);
        index += 1;
      }
      blocks.push(<GlossGroup key={group[0]?.id ?? 'gloss'} items={group} answers={answers} onChange={onChange} />);
      continue;
    }

    blocks.push(
      <section key={item.id} className="q-card" aria-labelledby={`q-${item.id}`}>
        <div className="q-head">
          <h3 id={`q-${item.id}`}>題{item.qNo}</h3>
          <span className="pts">{item.max} 分</span>
        </div>
        <ItemBody item={item} answers={answers} onChange={onChange} gaps={gaps} onLeave={leaveField} />
      </section>,
    );
    index += 1;
  }

  return <div className="long-fields">{blocks}</div>;
}

function ItemBody({
  item,
  answers,
  onChange,
  gaps,
  onLeave,
}: {
  item: Exclude<LongItem, GlossLongItem>;
  answers: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
  gaps: ReadonlySet<string>;
  onLeave: (id: string, complete: boolean) => void;
}) {
  if (item.type === 'mc') {
    return (
      <fieldset className="choices">
        <legend>{item.prompt}</legend>
        {item.stem ? <Stem stem={item.stem} target={item.target ?? ''} /> : null}
        {item.sourceLabel ? <p className="hint">{item.sourceLabel}</p> : null}
        {item.choices.map((choice) => (
          <label key={choice.key} className="choice">
            <input
              type="radio"
              name={item.id}
              value={choice.key}
              checked={valueOf(answers, item.id) === choice.key}
              onChange={() => onChange(item.id, choice.key)}
            />
            <span>
              {choice.key}　{choice.text}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (item.type === 'recite') {
    const key = item.id;
    return (
      <>
        <p>{item.prompt}</p>
        <p className="hint">上方方格即時顯示。標點已預先填好；漢字跟輸入欄逐字填入。判分以輸入欄全文為準。</p>
        <ReciteGrid boxes={item.charBoxes} value={valueOf(answers, key)} markGaps={gaps.has(key)} />
        <div className="field">
          <label htmlFor={`field-${key}`}>在此輸入原文</label>
          <textarea
            id={`field-${key}`}
            lang="zh-Hant"
            rows={3}
            value={valueOf(answers, key)}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value;
              onChange(key, next);
              if (visibleChars(next).length >= item.charBoxes.filter((ch) => !isRecitePunct(ch)).length) {
                onLeave(key, true);
              }
            }}
            onBlur={(event) => {
              const slots = item.charBoxes.filter((ch) => !isRecitePunct(ch)).length;
              onLeave(key, visibleChars(event.target.value).length >= slots);
            }}
          />
        </div>
      </>
    );
  }

  if (item.type === 'short_fill') {
    const slots = item.charCount ?? 0;
    const boxes = Array.from({ length: slots }, () => '');
    const key = item.id;
    return (
      <>
        <p>{item.prompt}</p>
        {slots > 0 ? (
          <ReciteGrid boxes={boxes} value={valueOf(answers, key)} markGaps={gaps.has(key)} />
        ) : null}
        <div className="field">
          <label htmlFor={`field-${key}`}>在此輸入</label>
          <input
            id={`field-${key}`}
            type="text"
            lang="zh-Hant"
            value={valueOf(answers, key)}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value;
              onChange(key, next);
              if (slots > 0 && visibleChars(next).length >= slots) onLeave(key, true);
            }}
            onBlur={(event) => {
              if (slots === 0) return;
              onLeave(key, visibleChars(event.target.value).length >= slots);
            }}
          />
        </div>
      </>
    );
  }

  if (item.type === 'kara_table') {
    return (
      <>
        <p>{item.prompt}</p>
        <div className="table-wrap">
          <table className="kara">
            <thead>
              <tr>
                {item.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row) => (
                <tr key={row.person}>
                  <th scope="row">{row.person}</th>
                  {row.cells.map((cell) => {
                    const key = fieldKey(item.id, row.person, cell.key);
                    return (
                      <td key={cell.key} className={cell.given ? 'given-cell' : undefined}>
                        {cell.given ? (
                          cell.text
                        ) : cell.points && cell.points.length > 0 ? (
                          <textarea
                            id={`field-${key}`}
                            lang="zh-Hant"
                            rows={4}
                            aria-label={`${row.person}${cell.label ?? '具體表現'}`}
                            value={valueOf(answers, key)}
                            maxLength={400}
                            spellCheck={false}
                            onChange={(event) => onChange(key, event.target.value)}
                          />
                        ) : (
                          <input
                            id={`field-${key}`}
                            type="text"
                            lang="zh-Hant"
                            aria-label={`${row.person}${cell.label ?? '形象'}`}
                            value={valueOf(answers, key)}
                            maxLength={40}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => onChange(key, event.target.value)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <p>{item.prompt}</p>
      {item.type === 'sentence_translate' && item.source ? <p className="stem source-line">{item.source}</p> : null}
      {item.type === 'long_points' && item.quote ? <blockquote className="quote">{item.quote}</blockquote> : null}
      <div className="field">
        <label htmlFor={`field-${item.id}`}>你的答案</label>
        <textarea
          id={`field-${item.id}`}
          lang="zh-Hant"
          rows={6}
          value={valueOf(answers, item.id)}
          maxLength={1500}
          spellCheck={false}
          onChange={(event) => onChange(item.id, event.target.value)}
        />
      </div>
    </>
  );
}
