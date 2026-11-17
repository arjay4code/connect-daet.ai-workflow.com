import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('mobile navigation and pending review table contain their overflow', async () => {
  const [layout, pendingReviews] = await Promise.all([
    read('../app/(dashboard)/workflow/layout.tsx'),
    read('../app/(dashboard)/workflow/admin/pending/page.tsx'),
  ]);

  assert.match(layout, /max-lg:overflow-y-auto/);
  assert.match(pendingReviews, /<div className="max-lg:overflow-x-auto">\s*<table className="w-full max-lg:min-w-\[760px\]/);
});

test('submission previews and completion dialog fit and scroll on mobile and tablet', async () => {
  const [userDetail, officeDetail, closeDialog] = await Promise.all([
    read('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx'),
    read('../components/OfficeSubmissionDetail.tsx'),
    read('../components/CloseSubmissionDialog.tsx'),
  ]);

  assert.match(userDetail, /max-lg:h-\[min\(65vh,480px\)\] max-lg:min-h-\[min\(65vh,360px\)\]/);
  assert.match(officeDetail, /max-lg:h-\[min\(65vh,480px\)\] max-lg:min-h-\[min\(65vh,360px\)\]/);
  assert.match(closeDialog, /max-lg:items-start max-lg:overflow-y-auto/);
});
