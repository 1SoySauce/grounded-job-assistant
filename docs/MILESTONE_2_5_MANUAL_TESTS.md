# Milestone 2.5 manual verification — structured resume parsing

Use sanitized resumes or copies you intentionally choose to store locally. Parsing is local and does not use AI or a network service, but extension storage is not encryption at rest.

## Build and reload

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

1. Open `brave://extensions` or `chrome://extensions`, enable Developer mode, and click **Reload** on the existing Grounded Job Assistant card. Do not remove the extension if you want to preserve its local data.
2. For a clean browser profile, choose **Load unpacked** and select `C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist`.
3. Open settings from the popup, then open Resumes. Keep DevTools Network and Console visible during at least one extraction.

## Structured PDF and DOCX checks

Repeat these checks once with a text-based PDF and once with a DOCX. Across the two sanitized files, include mixed/uppercase headings, at least two schools, two jobs, a current job, Projects, categorized Skills, and Certifications.

1. Add the resume and wait for **Unverified import review**. Confirm the raw extracted text remains visible and readable.
2. Confirm grouped cards appear only for detected Contact, Education, Employment, Projects, Skills, and Certifications data. Every card must say **UNVERIFIED**; every listed suggestion must show a high/medium/low percentage and the exact source text.
3. Check the header. A clear first-line full name may be split into first/middle/last. Email, phone, city/state, explicit country, LinkedIn, GitHub, and one remaining portfolio URL should be proposed only when unambiguous. Confirm no name is inferred from an email or username.
4. Check every education record: institution, degree, major, concentration, GPA, location, and available dates. Verify `2025`, `Jan 2025`, and similar source precision is preserved without an invented day.
5. Check every employment record: employer, title, location, start/end dates, Present/Current status, bullets, and technologies actually written in that work block. Verify bullets stay with the correct employer.
6. Check Projects records and their bullets, technologies, GitHub URL, and deployed URL. Text outside a clear Projects section must not create a project.
7. Check categorized skills. Formatting separators may be normalized, but no skill absent from the resume should appear. Experience with AWS or another technology must never create a certification.
8. Check Certifications. Only explicit entries under Certifications/Certificates should be proposed.

## Review, conflicts, and duplicates

1. Before confirmation, open My Profile in a second settings tab and verify none of the suggestions has entered the profile.
2. Check the final confirmation, then edit any proposed value. The confirmation must immediately clear and the import button must become disabled.
3. Clear an incorrect optional value and remove one whole proposed education, employment, project, or certification record. Confirm the change remains after **Save unverified draft** and reopening the draft.
4. Create two contact conflicts with already saved profile values. Confirm each row shows its saved and proposed values, independently defaults to **Keep saved**, and can independently select **Use proposed**.
5. For a new nonblank personal field, confirm its row defaults to **Include** and can be changed to **Exclude**. Blank proposals must not appear as destructive changes or erase saved values.
6. Import two clearly new education records and two clearly new projects. Exclude one of each, confirm the import, and verify only the retained records were appended.
7. Import proposed skills in two categories. Exclude one category and confirm the other; existing saved skills must remain untouched in both categories.
8. Import an education/job/project/certification that exactly matches a saved record. Its row must say **Exact duplicate — skipped**, and confirmation must not add it.
9. Import a record with the same institution/employer/name but a different degree/title. Its row must default to **Exclude** and offer **Add as separate record**. Approving it must append a new record and never merge the records.
10. Check final confirmation, then change any decision. The confirmation must immediately clear and the import button must become disabled until checked again.
11. Change several decisions, click **Save unverified draft**, reopen it, and verify the choices remain. Reload the settings page and repeat. Existing drafts created before decision controls must open with safe defaults.
12. Confirm a reviewed import. Verify only retained nonblank proposals enter My Profile, their source is resume import, the draft disappears, and repeat confirmation is impossible.

## Per-change table and responsive layout

1. At a normal desktop width, confirm the table has readable **Field / entry**, **Saved value**, **Proposed value**, and **Decision** columns. Field and Saved labels must not collapse into character-by-character wrapping.
2. Confirm labels read like **First name**, **Education 1 — Institution**, **Employment 1 — Job title**, **Project 1 — Name**, and **Skills — Cloud**. Random record UUIDs and raw paths such as `personal.firstName` must not be visible labels.
3. Review long responsibilities, descriptions, technologies, skills, and URLs. Their complete values must wrap inside readable cells without overlapping controls or being truncated.
4. Narrow the settings window to approximately 420–700 CSS pixels. Confirm the table retains readable column widths and becomes horizontally scrollable instead of crushing its columns. Scroll to the Decision column and operate every selector with mouse and keyboard.
5. Tab through the scroll region, decision selectors, final confirmation, and action buttons. Confirm visible focus remains present and every control is reachable.
6. Confirm **UNVERIFIED**, confidence levels and percentages, exact provenance text, raw extracted text, and saved-versus-proposed values remain visible alongside the decision controls.

## Manual regression rerun after parser hardening

Discard the draft created by the earlier parser build, then click **Extract for review** again so the stored PDF is parsed by the new code.

1. For a header containing `City, ST, (212) 555-0147`, verify City and State are proposed, Phone is proposed separately, and Country remains blank. Repeat with a URL/email/date in the third position; none may become Country. An explicit recognized country such as `Country: Canada` may be proposed.
2. For an education record with separate `Major:`, `Concentration:`, `Minor:`, and `GPA:` lines, verify all four values attach to that school and each suggestion cites its exact labeled line.
3. For `Automation Engineering Intern    Buffalo, NY`, verify the title excludes the location and Location is `Buffalo, NY`. Repeat with a company followed by a US city/state. Confirm an unlabeled suffix without a city/state remains part of the original title rather than being guessed as a location.
4. In Projects, use bullets that wrap onto unbulleted continuation lines. Verify sentence fragments, workflow text, safeguards, and documentation continuations remain in the current project's description/responsibility text and do not create extra project records. Test at least two genuine project headers in the same section.
5. For `Data / Cloud / DevOps:`, verify the listed skills map to Cloud; verify `Languages / Programming`, `Security / Testing`, and `Systems / Tools` map to their supported categories. No absent skill may appear.
6. Edit one corrected suggestion and verify the final accuracy checkbox resets. Save the draft, reopen it, and confirm confidence/provenance and raw text remain available. Do not confirm into the profile until every proposed value is accurate.

## Second Brave regression rerun

Again discard any draft created by the prior build and re-extract the stored resume.

1. Confirm the institution excludes its trailing city/state, while Education Location contains that city/state and both suggestions cite the original institution line.
2. Confirm a terminal month/year or year-only value is removed from Degree and appears unchanged as Graduation Date. Verify a non-date program number remains in Degree.
3. On a line containing `Concentration: Information Systems | GPA: 3.4`, confirm Concentration stops before the GPA label and GPA remains separately populated. Repeat with other inline `Major:`, `Minor:`, and `GPA:` combinations.
4. With two consecutive jobs, confirm wrapped bullet lines remain in the first job’s responsibilities but the second employer/title do not. If an intentionally unusual second date cannot be parsed, its apparent header must still not enter the first responsibility.
5. With two or three genuine projects, verify every clear standalone title becomes its own record, including titles without URLs. Include title-plus-descriptor-plus-date layouts and wrapped bullet prose. Confirm sentence fragments and ambiguous title-like lines do not become projects or enter a preceding bullet as a project header.
6. Save a phone as `(555) 123-4567` and propose `555-123-4567`; save State as `New York` and propose `NY`. Neither formatting-only difference should show a conflict or replace the saved display form. Different digits, different states, and different email addresses must still require explicit replacement approval.
7. Edit or remove a suggestion and verify confirmation resets. Before final confirmation, verify My Profile is unchanged and raw text, confidence, and provenance remain visible.

## Project title and descriptor regression rerun

Discard the draft created by the prior build, rebuild, reload the extension, and click **Extract for review** again.

1. In the Projects section, use two sanitized records in this order: title with an attached year, project-type descriptor, and bullets; then title with an attached month/year, a different project-type descriptor, and bullets.
2. Confirm exactly two project cards appear. The stronger first line of each group must be Name, the immediately following descriptor must be Description, and every following bullet must remain in that same card's Responsibilities.
3. Confirm the title-attached year and month/year remain exactly as extracted. A descriptor date range must likewise remain visible in the descriptor source text; no day may be invented.
4. Repeat with one title containing a GitHub URL and one title without any URL. The URL must populate only its URL suggestion and must not be included in Name or cause another project record.
5. Add one project without a descriptor among projects that do have descriptors. Confirm all genuine projects remain separate and no descriptor becomes a project Name.
6. Include a wrapped, unbulleted continuation after a responsibility plus an explicit `Technologies:` line. Confirm the continuation remains in Responsibilities and the technology line does not become a title or descriptor.
7. Inspect provenance in each card: Name cites the title line, Description cites only the descriptor line, Responsibilities cite their responsibility text, Technologies cite only contributing technology lines, and each URL cites that URL.
8. Add ordinary prose and an intentionally ambiguous pair of adjacent title-like lines. Confirm neither creates a contentless extra project; conservative omission is acceptable for the ambiguous line.
9. Before confirmation, verify My Profile is unchanged and every project suggestion remains **UNVERIFIED**. Edit any project value and confirm the accuracy checkbox resets.

## Limits and regressions

1. Try an image-only/scanned PDF. Expect no OCR; the UI should report that no readable text was extracted or parsing should fail safely. The original file remains available for retry/removal and the profile remains unchanged.
2. Try a layout with columns or unusual headings. Record omitted, swapped, or weak suggestions. Correct them only in the unverified review and confirm the displayed raw source remains the reference.
3. Confirm DevTools shows no external request carrying resume data. Parser workers/fonts may load only from the extension URL. Confirm no new site permission appears on the extension card.
4. Run the profile, Answer Library, Job Preferences, resume persistence/deletion, stale-tab, active-tab scan, and protected-page regression checks in `docs/MILESTONE_2_MANUAL_TESTS.md`.

Record browser/version, file type/layout, pass/fail, and sanitized console output. Do not begin Milestone 3 until these checks pass.
