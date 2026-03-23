# Lessons Learned

## Optimistic UI updates: lift state to the common parent
**Date:** 2026-03-23
**Context:** PrerequisiteBanner had local optimistic state (`createdNotes`) while StudyContextBar read from the parent's `readiness` state. After generating a prereq note, the banner updated but the study bar didn't.
**Rule:** When multiple components need to reflect the same optimistic update, lift the state mutation to their common parent. Don't maintain shadow state in a child — update the canonical state directly via a setter passed as prop.

## "Known" must mean actually taught, not just encountered
**Date:** 2026-03-23
**Context:** `sync_concepts_from_analysis` adds both concepts AND prerequisites to `UserConcept`. `check_readiness` treated all entries as "known", so a note's own prerequisites showed as 100% covered because they matched themselves.
**Rule:** When querying for "known" concepts, filter by `source_type = "concept"` (taught in a note) not `"prerequisite"` (required by a note). Also filter `Document.deleted == False` so soft-deleted notes don't count.
