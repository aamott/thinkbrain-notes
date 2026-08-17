/**
 * Shared class strings for the small bordered buttons in {@link UpdateBanner}
 * and {@link StaleDocumentBanner}.
 *
 * Both banners render the same two button shapes — a neutral one and a
 * primary-tinted one — and the strings have to stay byte-identical or the two
 * banners drift apart visually. Keeping them here means a change is one edit,
 * not two, and a difference is impossible to miss in review.
 */
export const bannerButtonClass =
  "border border-border rounded-small py-[0.28rem] px-[0.6rem] text-foreground bg-surface cursor-pointer font-inherit text-[0.72rem]";

export const bannerButtonPrimaryClass =
  "border border-primary rounded-small py-[0.28rem] px-[0.6rem] text-primary-foreground bg-primary cursor-pointer font-inherit text-[0.72rem]";
