'use client';

export function CategoryPicker({ id, value, onChange, categories }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  return <div className="flex flex-col gap-2">
    <label htmlFor={id} className="text-ink-2 text-sm">Category (optional)</label>
    <input id={id} list={`${id}-options`} value={value} maxLength={40} onChange={(event) => onChange(event.target.value)}
      placeholder="Type a category"
      className="border-hair bg-panel text-ink focus:border-line w-full rounded-xl border-2 px-3 py-2 text-sm outline-none" />
    <datalist id={`${id}-options`}>
      {categories.map((category) => <option key={category} value={category} />)}
    </datalist>
  </div>;
}
