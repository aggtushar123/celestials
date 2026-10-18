import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { answerQuestion, askQuestion, fetchQuestions } from '../../features/knowledge/knowledgeSlice';
import type { Question } from '../../features/knowledge/knowledgeSlice';
import { FUNCTION_LABELS } from '../../features/auth/authSlice';
import type { User } from '../../features/auth/authSlice';
import { formatDate } from '../../features/customers/formatters';
import { MentionTextarea } from '../shared/MentionTextarea';
import { Badge, Card, CardBody, CardHeader, EmptyState, INPUT, NUM, PRIMARY, Select, TYPE } from '../ui';

/**
 * Questions on this customer, routed to people. Ask one by picking who
 * should answer (or @mentioning them in the text); the person is
 * notified, answers here, and the answer is stored as a contribution
 * from their function — so the Copilot has it from then on and the next
 * person does not have to ask again.
 */
export function QuestionsPanel({ customerId, customerName, members }: { customerId: number; customerName: string; members: User[] }) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const rows = useAppSelector((s) => s.knowledge.questions[customerId]);
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    dispatch(fetchQuestions(customerId));
  }, [dispatch, customerId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const result = await dispatch(askQuestion({ customerId, text: text.trim(), ...(assignee ? { assignee_id: Number(assignee) } : {}) }));
    if (askQuestion.fulfilled.match(result)) {
      setText('');
      setAssignee('');
    }
  }

  const open = (rows ?? []).filter((q) => q.status === 'open');
  const answered = (rows ?? []).filter((q) => q.status === 'answered');

  const options = [
    { value: '', label: 'Whoever I @mention' },
    ...members.filter((m) => m.id !== me?.id).map((m) => ({ value: String(m.id), label: `${m.name}${m.function ? ` · ${FUNCTION_LABELS[m.function]}` : ''}` })),
  ];

  return (
    <Card as="section" pad="none" aria-labelledby={`questions-${customerId}`}>
      <CardHeader
        id={`questions-${customerId}`}
        title={`Questions about ${customerName}`}
        meta={
          open.length > 0 ? (
            <>
              <span className={NUM}>{open.length}</span> open
            </>
          ) : undefined
        }
      />

      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={`ask-${customerId}`} className="sr-only">
            Ask a question about {customerName}
          </label>
          <MentionTextarea
            id={`ask-${customerId}`}
            value={text}
            onChange={setText}
            rows={2}
            placeholder="Ask someone: pick a person below, or @mention them"
            className={`${INPUT} py-2`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select label="Who should answer" labelPosition="inline" value={assignee} onChange={setAssignee} options={options} />
            <button type="submit" disabled={!text.trim()} className={`${PRIMARY} ml-auto`}>
              Ask
            </button>
          </div>
        </form>
      </CardBody>

      {rows && rows.length === 0 && (
        <div className="border-t border-line-subtle">
          <EmptyState size="inline" title="No questions yet." />
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
          {[...open, ...answered].map((q) => (
            <QuestionRow key={q.id} q={q} canAnswer={me?.id === q.assignee.id} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuestionRow({ q, canAnswer }: { q: Question; canAnswer: boolean }) {
  const dispatch = useAppDispatch();
  const [body, setBody] = useState('');
  const isOpen = q.status === 'open';
  return (
    <li className="flex flex-col gap-1 px-4 py-3" aria-label={`Question for ${q.assignee.name}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${TYPE.meta}`}>
        <span>
          <span className="font-semibold text-ink">{q.asked_by.name}</span> asked <span className="font-semibold text-ink">{q.assignee.name}</span>
          <span>
            {' '}
            ({FUNCTION_LABELS[q.assignee.function]}) · <span className={NUM}>{formatDate(q.created_at.slice(0, 10))}</span>
          </span>
        </span>
        <Badge tone={isOpen ? 'neutral' : 'success'}>{q.status_display}</Badge>
      </div>
      <p className={TYPE.body}>{q.text}</p>
      {q.answer && (
        <p className={`${TYPE.bodyMuted} mt-1 border-l-2 border-line pl-3 whitespace-pre-wrap`}>
          {q.answer.body.replace(/^In answer to .*?": /, '')}
        </p>
      )}
      {isOpen && canAnswer && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) dispatch(answerQuestion({ id: q.id, body: body.trim() }));
          }}
        >
          <label htmlFor={`answer-${q.id}`} className={TYPE.label}>
            Your answer, stored as knowledge under {FUNCTION_LABELS[q.assignee.function]}
          </label>
          <textarea id={`answer-${q.id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${INPUT} py-2`} />
          <button type="submit" disabled={!body.trim()} className={`${PRIMARY} self-end`}>
            Answer
          </button>
        </form>
      )}
      {isOpen && !canAnswer && <p className={TYPE.meta}>Waiting on {q.assignee.name}.</p>}
    </li>
  );
}
