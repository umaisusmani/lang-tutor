'use client';

import dynamic from 'next/dynamic';

type Props = {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: 'md' | 'lg';
};

function EditorSkeleton({ minHeight = 'md' }: { minHeight?: 'md' | 'lg' }) {
  return <div aria-busy="true" className="border-line bg-panel rounded-xl border-2">
    <div className="border-hair h-11 border-b-2" />
    <div className={minHeight === 'lg' ? 'min-h-56 sm:min-h-72' : 'min-h-28'} />
  </div>;
}

// Tiptap is heavy and only needed once someone edits a note, so keep it out of the chat and notes bundles.
const Editor = dynamic(() => import('@/app/notes/rich-editor-impl').then((module) => module.RichEditorImpl), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export function RichEditor(props: Props) {
  return <Editor {...props} />;
}
