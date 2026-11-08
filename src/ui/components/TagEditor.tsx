import { useState } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';

export function TagEditor({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange(tags: string[]): void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');

  const add = (value: string) => {
    const cleaned = value.trim().replace(/^#/, '');
    if (!cleaned || tags.includes(cleaned)) {
      setDraft('');
      return;
    }
    onChange([...tags, cleaned]);
    setDraft('');
  };

  const unused = suggestions.filter((tag) => !tags.includes(tag)).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[6px] border border-line-strong bg-bg p-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
          >
            <TagIcon size={9} aria-hidden="true" />
            {tag}
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              className="opacity-60 hover:opacity-100"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          aria-label="添加标签"
          placeholder={tags.length ? '继续添加…' : '输入标签后回车，例如 前端'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          className="min-w-[110px] flex-1 border-0 bg-transparent p-0.5 text-[12.5px] text-text outline-none placeholder:text-text-faint"
        />
        {draft.trim() && (
          <button type="button" className="icon-btn h-6 w-6" aria-label="确认添加标签" onClick={() => add(draft)}>
            <Plus size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {unused.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] text-text-faint">常用</span>
          {unused.map((tag) => (
            <button key={tag} type="button" className="chip hover:text-accent" onClick={() => add(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}