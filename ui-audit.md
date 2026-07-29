# Frontend UI Optimization Audit

## Captured flow

1. Growth dashboard — desktop
   - Evidence: `.ui-audit-01-growth-desktop.png`
   - Health: good core hierarchy; the reference style is established and the evidence CTA is clear.
2. Submit evidence — desktop dialog
   - Evidence: `.ui-audit-02-evidence-dialog.png`
   - Health: usable and well structured, but form guidance and validation feedback need refinement.
3. Growth dashboard — mobile
   - Evidence: `.ui-audit-03-growth-mobile.png`
   - Health: no horizontal overflow, but the main task CTA is too far below the fold and heading wrapping is poor.
4. Capability ladder — desktop
   - Evidence: `.ui-audit-04-capability-desktop.png`
   - Health: functionally clear, but it retains a different visual language from the upgraded growth dashboard.

## Priority backlog

### P1 — mobile task completion

- The mobile growth title breaks after the first character of the subtitle, and the submission CTA begins about 397 px below the 844 px viewport. The hero itself is 692 px high.
- Fix: stack the subtitle below `曜石信号` at mobile widths; reduce hero height; pin or move `提交证据` directly below the target summary. Keep the full evidence table after the action.

### P2 — apply one shell and component system across views

- Growth uses the new light shell, underline navigation, dark certification hero, and inset ledger. Capability uses an outlined active navigation state, gray ladder stage, and older card treatment.
- Fix: extract shared header, navigation-active, page-heading, panel, table, and state-badge tokens/components. Roll them through capability, review, team, settings, and all dialogs before adding new page-specific styling.

### P2 — evidence form clarity and validation

- The evidence dialog has a strong layout but mixes English `EVIDENCE` with Chinese UI, gives limited field-level guidance, and relies on a low-contrast disabled submit button before the user understands every required condition.
- Fix: use Chinese microcopy consistently; add concise examples beneath the two required content fields; show validation on blur and an explicit disabled-reason summary; distinguish link upload/import choices when those flows are available.

### P2 — responsive information priority

- On a 390 px viewport, update controls occupy the top of the hero while the conversion action is off-screen. The desktop table is structurally sound, but its mobile action order was not visible in the first viewport.
- Fix: define a mobile-first order: target → evidence CTA → progress → current status → criteria. Convert the desktop table to compact criterion cards after the first action.

### P3 — visual finishing pass

- Harmonize title/section scale between Growth and Capability, make progress/status chips use one semantic palette, and standardize border radii/shadows for cards and dialogs.
- Add empty, validation-error, loading, success, and long-copy screenshots to the UI regression set before polishing micro-interactions.

## Evidence limits

This audit covered the growth dashboard, evidence-entry dialog, mobile growth first viewport, and capability ladder. Review center, team, settings, non-default form errors, keyboard focus traversal, and screen-reader behavior were not fully audited here.
