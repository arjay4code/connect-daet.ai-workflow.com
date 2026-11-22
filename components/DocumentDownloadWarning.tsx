export default function DocumentDownloadWarning() {
  return (
    <p
      role="note"
      className="rounded-xl border border-pending-text/20 bg-pending-bg px-3 py-2.5 text-xs leading-relaxed text-pending-text"
    >
      <span className="font-semibold">Security caution:</span> Documents and attachments may contain malicious scripts or links from untrusted sources. Download only files you expect. Never enable macros or run embedded files, and report suspicious content to your administrator.
    </p>
  );
}
