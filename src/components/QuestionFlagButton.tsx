import { useId, useRef, useState } from 'react';
import type { FlagEmailStatus, FlagQuestion } from '../lib/questionFlag.ts';

function confirmReport(qNo: string): boolean {
  if (!window.confirm(`確定回報第${qNo}題？`)) return false;
  return window.confirm('請再確認一次，才會送出這次回報。');
}

export function QuestionFlagButton({
  question,
  signedIn,
  onReport,
}: {
  question: FlagQuestion;
  signedIn: boolean;
  onReport: (question: FlagQuestion) => Promise<FlagEmailStatus>;
}) {
  const hintId = useId();
  const lock = useRef(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'reported'>('idle');
  const [hint, setHint] = useState<string | null>(null);

  const label = status === 'reported' ? '已回報' : status === 'pending' ? '回報中…' : '回報問題';
  const ariaLabel =
    status === 'reported'
      ? `第${question.qNo}題已回報`
      : status === 'pending'
        ? `正在回報第${question.qNo}題`
        : `回報問題：第${question.qNo}題`;

  async function flag() {
    if (lock.current || status === 'reported') return;
    if (!signedIn) {
      setHint('請先登入，才能回報問題。');
      return;
    }
    if (!confirmReport(question.qNo)) return;
    lock.current = true;
    setStatus('pending');
    setHint(null);
    try {
      const emailStatus = await onReport(question);
      setStatus('reported');
      if (emailStatus === 'failed') setHint('已回報。電郵暫時未能送出。');
    } catch (caught) {
      lock.current = false;
      setStatus('idle');
      const message = caught instanceof Error && caught.message ? caught.message : '回報未能記下，請再試一次。';
      setHint(message);
    }
  }

  return (
    <div className="flag-control">
      <button
        type="button"
        className="button secondary compact flag-button"
        aria-label={ariaLabel}
        aria-describedby={hint ? hintId : undefined}
        disabled={status === 'pending' || status === 'reported'}
        onClick={() => void flag()}
      >
        {label}
      </button>
      {hint ? (
        <span id={hintId} role="alert" className="flag-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
