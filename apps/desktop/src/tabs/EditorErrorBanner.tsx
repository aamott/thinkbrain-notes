/** The error strip every CodeMirror-backed editor renders above the view. */
export function EditorErrorBanner({ error }: { readonly error: string }) {
  return (
    <p
      className="m-0 px-[0.9rem] py-2 border-b border-b-[color-mix(in_srgb,var(--color-destructive)_50%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-xs"
      role="alert"
    >
      {error}
    </p>
  );
}
