import { File, FileArchive, FileCode2, FileImage, FileJson2, FileText, type LucideProps } from "lucide-react";

export function WorkspaceFileIcon({ name, ...props }: { readonly name: string } & LucideProps) {
  const extension = name.split(".").at(-1)?.toLowerCase();

  if (extension === "md" || extension === "markdown" || extension === "txt") return <FileText {...props} />;
  if (extension === "json") return <FileJson2 {...props} />;
  if (["ts", "tsx", "js", "jsx", "rs", "css", "html", "yml", "yaml"].includes(extension ?? "")) return <FileCode2 {...props} />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension ?? "")) return <FileImage {...props} />;
  if (["zip", "gz", "tar", "7z"].includes(extension ?? "")) return <FileArchive {...props} />;
  return <File {...props} />;
}
