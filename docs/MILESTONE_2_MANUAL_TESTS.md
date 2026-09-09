# Milestone 2 manual verification — Brave / Chrome

## Build and reload

Use Node.js 24.15+ and pnpm 11.19.0. No environment file, API key, or provider configuration is needed.

```powershell
cd "C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension"
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:dist
```

1. Open `brave://extensions` or `chrome://extensions` and enable Developer mode.
2. If Grounded Job Assistant is already installed from this folder, click **Reload** on its existing card. Do not remove it: uninstalling deletes local extension data. Reload preserves the extension ID and enables migration testing with your existing data.
3. For a new installation, click **Load unpacked** and select `C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist`.
4. Confirm version **0.2.0**, then close any old settings tabs and reopen **Open settings** from the popup.
5. Check that only Dashboard, My Profile, Resumes, Answer Library, and Job Preferences are enabled. Applications, AI Settings, and Automation Settings remain disabled.

## Profile and verification

1. Open My Profile. If you already have Milestone 1 data, confirm it appears unchanged, including education, employment, skills, answers, and preferences in their respective sections.
2. Enter contact details. Add two education entries, two employment entries, a project, and a certification. Enter skills in several categories, one per line. Preserve dates as you know them; partial dates such as `2024` are allowed.
3. Confirm **Save verified profile** is disabled until you check the accuracy confirmation. Check it, edit a value, and confirm the checkbox resets and saving is disabled again.
4. Check the confirmation and save. Expect **Saved locally.** Reopen the section and verify all values persisted. The popup should report profile readiness when first name, last name, and valid email are confirmed.
5. Edit each kind of history entry, remove one education/employment entry, and remove a skill. Confirm and save, then reopen the section and check the changes.
6. Add an unused blank history entry and try to save: expect a validation error. Remove the blank entry. Invalid email, invalid links, and excessively long fields must also prevent saving without changing previously saved data.
7. Make an edit and select another section. Cancel the discard prompt: your edits remain. Closing/reloading the page with edits should use the browser's unsaved-changes warning.

## Answer Library

1. Add one answer of each type. New entries default to **Always ask me**.
2. Save a factual answer and a custom answer using only your exact supplied values. Both require a nonempty answer and explicit accuracy confirmation.
3. AI generation allowed later and Always ask me should show no answer-value input and make no API request. Saving these modes stores no generated answer.
4. For a voluntary demographic question, manually choose the category and exact answer. Trying to save that category with AI generation enabled must fail. The extension must never select a demographic response on its own.
5. Edit an answer, save, reopen, and verify it. Delete an answer and save. Duplicate questions must produce an error.

## Job Preferences

1. Enter desired/excluded titles, locations, industries, employment types, and excluded companies. Use one item per line.
2. Select remote/hybrid/onsite and role types as appropriate. Enter minimum and desired salary in the same currency and pay period; record those units explicitly in your salary Answer Library answer if needed.
3. Save, reopen, and verify every field. Clear optional salaries and save: blank values mean unknown, not zero.
4. A negative salary or desired salary below the minimum must be rejected without altering saved preferences.

## Multiple resumes and review

1. Open Resumes. Add a small text-based PDF with a name such as `IT Support Resume` and intended job categories, one per line. Use only files you intend to store locally.
2. Expect the original file metadata to appear, followed by **Unverified import review**. The extracted text should be readable. Only unambiguous email and explicit GitHub/LinkedIn URLs may be suggested automatically. Other fields remain blank for manual mapping/correction.
3. Verify that My Profile has not changed. If you have edited the review, use **Save unverified draft** before leaving. Reopen Resumes and the draft: those edits should persist but remain unverified.
4. In the review, correct the email if necessary and manually add supported history or skills alongside the extracted text. Expand **Existing profile for comparison**. Read **Changes to your profile**. Imported history appends; avoid manually adding history you already have.
5. Confirm that the import button remains disabled until you check the review confirmation. Changing a proposed value resets confirmation.
6. If an imported contact value differs from a saved value, the review must show both values and require the separate **Replace the conflicting saved contact values** checkbox. Leaving that unchecked must block confirmation.
7. Confirm the import. The draft disappears and the reviewed values appear in My Profile. Existing blank import fields must not erase saved facts. Existing history must remain. Repeated clicks must not consume the same draft twice.
8. Add a DOCX resume with a different name/category and repeat the extraction/review steps. Both original files should persist after closing/reopening the browser and after extension Reload.
9. Save or discard any open review to enable resume metadata controls. Rename one resume and update its categories. Verify filename, type, size, and original bytes remain unchanged.
10. Check the explicit delete checkbox on one resume, then click **Delete resume**. Its metadata and bytes should disappear while the other resume stays. Existing profile facts and separately stored drafts must remain, as the deletion message states.

## Failure and concurrency checks

1. Try an unsupported file type, an empty file, a file over 10 MB, or text renamed to `.pdf`: expect a clear error and no new record.
2. Try a malformed, encrypted, image-only, or unusually complex resume. Parsing may fail or yield no readable text. The stored original should remain available for retry/removal; no profile data should become verified. OCR is not supported.
3. Open settings in two tabs, load My Profile in both, and save an edit in the first. Save a different edit in the second: expect the stale-data error; its unsaved edits remain visible. Copy needed edits before reloading that section, then reapply them to the newer record.
4. Repeat with the same resume metadata in two tabs. The stale tab must not overwrite or delete a newly edited record.
5. Reload a browser tab during extraction. The original file may have been stored before parsing stopped; reopening Resumes should allow extraction retry. A completed draft is independent of the original binary and remains reviewable after deleting the resume.

## Security and Milestone 1 regression

1. Inspect the extension card: no new site-access permission should be requested.
2. Open an ordinary HTTP/HTTPS page and use **Scan current page**. Expect the original coarse page type, ATS hint, and field counts. There must be no expanded job extraction, score, form fill, or submission.
3. Scan a browser-internal page: expect the existing unsupported-page behavior.
4. Inspect the settings page Network tab while extracting a resume. Parser modules, workers, fonts, and character maps may load from the extension's own URL; no applicant data or document should go to an external service.
5. If testing corrupted storage or migrations manually, use a disposable browser profile and synthetic data only. Automated tests already cover malformed legacy/current records, unknown fields, future versions, failed writes, and retained originals. Do not edit your real stored applicant records to perform corruption testing.

Record browser version, pass/fail, and any console error (without personal data). Complete these checks before beginning Milestone 3.
