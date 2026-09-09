export function KbdHint({ keys }: { readonly keys: string }) {
  return (
    <kbd className="hm-mono rounded-sm border border-border px-1 text-[10px] text-dim">
      {keys}
    </kbd>
  );
}
