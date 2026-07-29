# Design QA — Growth Dashboard Follow-up

## Evidence

- Desktop source visual truth: `/var/folders/sq/myly3dqn1716q2f94ydkyn4w0000gp/T/codex-clipboard-5c93d83e-45f6-4d77-8b38-392c3c567ce9.png` — 1487 × 1058 PNG, 1×.
- Account source visual truth: `/var/folders/sq/myly3dqn1716q2f94ydkyn4w0000gp/T/codex-clipboard-e3dd78e9-ac7e-4566-b1e0-f46dfec4e3f5.png` — 244 × 108 PNG, 1×.
- Browser-rendered desktop implementation: `.design-qa-polish-desktop.png` — 1280 × 720 PNG at a 1280 × 720 CSS viewport, 1×.
- Focused account implementation: `.design-qa-account-focus.png` — 172 × 76 PNG cropped from the same desktop render.
- Browser-rendered mobile implementation: `.design-qa-polish-mobile.png` — 390 × 844 PNG at a 390 × 844 CSS viewport, 1×.
- Browser-rendered evidence dialog: `.design-qa-evidence-dialog.png` — 1280 × 720 PNG at a 1280 × 720 CSS viewport, 1×.
- Latest issue source: `/var/folders/sq/myly3dqn1716q2f94ydkyn4w0000gp/T/codex-clipboard-f7bc2efe-09cc-4635-ac62-0b5d21620c22.png` — 2888 × 1638 PNG, 2× capture (1444 × 819 logical px).
- Latest browser-rendered desktop implementation: `.design-qa-account-final.png` — 1280 × 720 PNG at a 1280 × 720 CSS viewport, 1×.
- Latest browser-rendered mobile implementation: `.design-qa-account-mobile-final.png` — 390 × 844 PNG at a 390 × 844 CSS viewport, 1×.
- Latest compact-layout source visual truth: `/var/folders/sq/myly3dqn1716q2f94ydkyn4w0000gp/T/codex-clipboard-ff17dac6-cf35-4b05-a889-ee41dbce2419.png` — 2844 × 1634 PNG, 2× capture (1422 × 817 logical px).
- Latest compact-layout desktop implementation: `.design-qa-team-compact-full.png` — 1280 × 1280 full-page PNG from a 1280 × 720 CSS viewport, 1×.
- Latest compact-layout mobile implementation: `.design-qa-team-compact-mobile-final.png` — 390 × 1759 full-page PNG from a 390 × 844 CSS viewport, 1×.
- State: authenticated `林晓` account; L4 member targeting L5; 0/3 evidence coverage; `2026-07` cycle.
- Density normalization: source and implementation were all captured/rendered at 1×. The desktop dashboard source is wider than the live 1280 px viewport, so the comparison judged matching content regions rather than browser-edge whitespace.
- Browser console: checked the final mobile render after interaction; 0 error-level messages.

## Full-view comparison evidence

The desktop source and browser-rendered implementation were placed in the same comparison input, followed by the account source and the focused rendered account crop in the same input. The latest issue screenshot and latest desktop browser render were also placed in the same comparison input. The compact-layout source and `.design-qa-team-compact-full.png` were placed in the same comparison input; the desktop analysis state and its mobile rendering were then checked separately. The mobile screen and evidence-entry dialog were separately inspected from browser captures.

The implementation preserves the reference's light shell, strong display title, dark grid certification canvas, left L4 lockup, horizontal level rail, right-side action region, violet CTA language, and white evidence/feedback surfaces. The live product intentionally keeps its four real destinations and its own L5 criteria instead of replacing them with the mock's fictional navigation and rows.

## Focused-region comparison evidence

- Account identity: desktop avatar is 42 × 42 px with 15 px, 800-weight initials; the `林晓` label is 17 px / 750 weight in deep navy; the 20 px chevron is a separate muted-gray disclosure target. Mobile retains a visible 15 px / 750 label, 34 px purple avatar, and 18 px chevron. This resolves the prior small, low-prominence account identity treatment.
- Header and title: checked the white header, violet active state, `曜石信号` display hierarchy, separate mobile subtitle, status line, and cycle control.
- Certification canvas: checked the dark grid, L4 mark, gap chip, target definition, progress rail, metrics, action divider, primary CTA, and detail action.
- Evidence dialog: clicked the unique `提交证据` control, verified the real `添加 L5 晋级证据` dialog, both new field helpers, the explicit disabled-submit explanation, and then closed it.
- Mobile priority: at 390 × 844, the `提交证据` button ends at y=453.8 px and is therefore available in the first viewport; the main title and subtitle have separate lines; no horizontal overflow was observed.
- Latest title and account treatment: the hard-coded `曜石信号` display copy is now `我的成长`. The oversized violet avatar with dark initials is replaced by a compact 36 px deep-navy avatar with white initials, 15 px deep-navy account name, and 18 px gray chevron. Mobile uses the same treatment at 32 px / 14 px / 17 px.
- Compact level analysis: at 1280 px, `当前层级分布` now occupies a 284 px panel with a 142 px, ten-column bar chart (rather than a tall one-row-per-level list). At 390 px the panel is 247.5 px tall, the chart is 324 px wide, and no horizontal overflow is present. Each column remains an accessible button that filters the member list by the selected level.

## Required fidelity surfaces

- Fonts and typography: the product now uses **Noto Sans SC** (400/500/600/700) as the global Chinese UI face, with an explicit PingFang/Microsoft YaHei fallback chain. **Geist Sans** is reserved for numeric metrics and level labels, with tabular figures enabled. Browser-computed body text confirmed the Noto Sans SC stack; desktop and mobile text were checked for optical weight, wrapping, and truncation.
- Spacing and layout rhythm: the desktop keeps the 32 px content edge, 408 px hero, right action slice, and lower panel rhythm. Mobile uses 16 px gutters, places the action before the hero, and keeps the CTA full width.
- Colors and visual tokens: light-gray canvas, white surfaces, near-black grid hero, violet accents, and slate metadata were checked. The account avatar is now solid deep navy with white initials; the name is deep navy and the chevron is muted gray, creating clear visual separation without the former purple-on-dark pairing.
- Image quality and asset fidelity: neither reference requires product photography, illustration, or a portrait asset. The initials avatar is intentional live UI, not a substituted image; Lucide supplies the required chevron.
- Copy and content: live navigation and evidence copy intentionally differ from the mock. The new form helper copy is product-specific guidance, visible only inside the evidence-entry flow.
- Accessibility and behavior: the account control remains a labeled button, the evidence flow remains semantic and keyboard-operable, the helper content is adjacent to the controlled fields, and the mobile primary action remains above the fold.

## Findings

No actionable P0, P1, or P2 visual mismatches remain for the supplied references.

## Comparison history

### Pass 1 — dashboard composition

- [P2] The early next-action region exceeded the hero and broke the reference's horizontal composition.
- Fix: span the action surface across the hero containing block, then constrain it to the right-side width. Browser evidence confirmed a 408 px-tall action region aligned with the hero.

### Pass 2 — dashboard detail density

- [P2] The hero was missing the gap chip, target explanatory line, completion metric, and inset evidence-ledger boundary.
- Fix: added the data-driven gap chip, target definition/date, target completion metric, and inset ledger treatment.

### Pass 3 — mobile and evidence-entry follow-up

- [P1] On the earlier 390 px presentation, the title and action hierarchy were crowded and the primary CTA could fall below the first viewport.
- [P2] Evidence-entry fields did not tell the user what good input looked like or why submission was unavailable.
- Fix: split the mobile title/subtitle, move the action card before the hero, make its CTA full width, add two field helpers, and add the disabled-submit explanation.
- Post-fix evidence: `.design-qa-polish-mobile.png` shows the CTA at y=409.8–453.8 inside the 844 px viewport; `.design-qa-evidence-dialog.png` shows the helpers and the disabled-submit explanation.

### Pass 4 — account identity clarity

- [P2] The account identity was too small and visually low contrast in the header.
- Fix: made the desktop avatar 42 px, raised the visible `林晓` label to 17 px / 750 deep navy, enlarged the chevron to 20 px, and retained a readable 15 px mobile label.
- Post-fix evidence: the focused source/render comparison shows a clear purple initials avatar, untruncated account label, and distinct disclosure chevron. Browser-computed values confirmed the desktop and mobile sizes above.

### Pass 5 — remove ambiguous heading and low-contrast avatar

- [P1] The hard-coded `曜石信号` did not communicate the current page purpose.
- [P2] The large violet initials avatar used dark lettering, which was visually harsh and insufficiently legible.
- Fix: replaced the heading with `我的成长`; simplified the account trigger into a 36 px deep-navy avatar with white initials, 15 px deep-navy name, and 18 px chevron. The mobile variant uses 32 px / 14 px / 17 px while retaining the same high-contrast palette.
- Post-fix evidence: `.design-qa-account-final.png` and `.design-qa-account-mobile-final.png`; browser-computed styles confirmed white avatar text on `rgb(32, 40, 61)`, `我的成长` as the heading, and a working account menu (`aria-expanded=true` when opened).

### Pass 6 — compact analysis and product typography

- [P1] The one-row-per-level distribution made the left team-analysis panel much taller than its paired promotion panel, pushing useful information below the fold.
- [P2] The former system-font mix did not give Chinese metadata, controls, and numerical metrics a deliberate shared typographic voice.
- Fix: changed the distribution to a 10-column vertical bar chart with counts above and L1–L10 labels below, keeping the existing level-filter interaction. Added global Noto Sans SC typography tokens and a separate Geist metric face for numbers/levels.
- Post-fix evidence: `.design-qa-team-compact-full.png` and `.design-qa-team-compact-mobile-final.png`; browser measurements confirmed a 284 px desktop panel / 142 px chart and a 247.5 px mobile panel / 324 px chart, without horizontal overflow. Clicking `查看 L4 成员，共 2 人` yielded the expected two-person L4 member list; restoring `团队分析` returned the analysis state. The browser console contained 0 error-level messages.

## Follow-up polish

- [P3] When a real profile portrait becomes available, it can replace the initials avatar without changing the account chip's spacing or typography.
- [P3] The local development watermark in the lower-left corner is emitted by the development framework and is excluded from product UI fidelity assessment.

## Implementation checklist

- [x] Align the growth dashboard with the supplied desktop certification-dashboard visual language.
- [x] Unify typography, buttons, panels, ledger rows, feedback treatment, and status styling.
- [x] Make the account avatar, `林晓` label, and chevron legible at desktop and mobile widths.
- [x] Replace the ambiguous `曜石信号` display title with `我的成长`.
- [x] Replace the violet/dark-text avatar treatment with a high-contrast account trigger.
- [x] Put the mobile primary action above the hero and keep it in the initial viewport.
- [x] Clarify evidence-entry fields and unavailable submit state.
- [x] Verify browser-rendered desktop, mobile, dialog, and primary CTA behavior.
- [x] Compress the team level distribution without removing its level-filter behavior.
- [x] Apply a deliberate Chinese UI/metric typography system throughout the product.
- [x] Check build output and diff whitespace.

final result: passed
