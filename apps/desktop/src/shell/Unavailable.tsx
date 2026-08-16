import { cn } from "../lib/utils";

/**
 * Empty-state placeholder for unavailable shell surfaces.
 *
 * Centers a short title and description inside a flex column. An optional
 * `className` overrides default alignment/padding (e.g. for inline use in the
 * bottom panel).
 */
export function Unavailable({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground", className)}>
      <strong className="text-foreground text-[0.95rem]">{title}</strong>
      <p className="text-xs leading-normal max-w-88">{description}</p>
    </div>
  );
}
