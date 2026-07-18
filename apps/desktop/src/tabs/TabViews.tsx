import type { Tab } from "@thinkbrain/core";

import { useAppStore } from "../stores/appStore";
import { getDocumentForTabResource } from "./tabContent";
import styles from "./tabViews.module.css";

export function PreviewTab({ tab }: { readonly tab: Tab }) {
  const contents = useAppStore(
    (state) => getDocumentForTabResource(state.editorDocuments, tab)?.editorContents ?? ""
  );

  return (
    <article className={styles.preview}>
      <header className={styles.viewHeader}>
        <p>Markdown preview</p>
        <h2>{tab.title}</h2>
      </header>
      <pre className={styles.previewContents}>{contents}</pre>
    </article>
  );
}

export function UnavailableTab({
  feature,
  detail
}: {
  readonly feature: string;
  readonly detail: string;
}) {
  return (
    <section className={styles.unavailable} aria-label={`${feature} unavailable`}>
      <p className={styles.eyebrow}>Unavailable</p>
      <h2>{feature}</h2>
      <p>{detail}</p>
    </section>
  );
}
