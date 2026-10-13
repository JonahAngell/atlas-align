# ATLAS Audit Workflow Contract

**Phase:** 0, documentation only  
**Application:** ATLAS Align v2.2.8  
**Authority:** This document is the authoritative future-state workflow contract. It does not change current runtime behavior. Exact tables, columns, routes, payloads, transaction boundaries, role representation, Inbox storage, attachment-binary handling, and event persistence remain Phase 1 source-verification tasks.

## 1. Scope and source classification

### Verified current facts

- ATLAS Align v2.2.8 uses HTML, CSS, JavaScript, Express, and PostgreSQL.
- Status is revisioned audit-document metadata. Missing status normalizes to Draft; duplicate audits reset to Draft.
- Ready for Review and Complete are current runtime statuses, with Critical Error restrictions on those transitions.
- Durable saves use revision-aware writes and stale-audit protections.
- Immutable audit-level and step-level revision history and restoration exist.
- The backend has central audit authorization, an audit repository, and migrations.
- Hierarchy utilities include `normalizeHierarchyFields()`, `setStepParent()`, and `branchTypeOptions()`.
- Assignments have assigned, backup, and developer roles; assignment changes mutate the active revisioned document.
- CSS under `css/` is authoritative, root `styles.css` is generated, and browser scripts use ordered classic loading. These are review-only constraints in Phase 0.

### Mandatory future requirements

The five-state model, revision-bound approval, actor exclusions, immutable publications, Inbox projection model, legacy mapping, restoration rules, and event requirements below are mandatory for later implementation.

### Proposed Phase 1 structures

Any event identifier, endpoint, table, column, transaction design, or storage object named as proposed is non-current until verified and implemented.

## 2. Source-of-truth model

| Concern                                 | Authority                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Editable content and working state      | Current persisted audit revision                                                         |
| Approval lifecycle and decision history | Approval request bound to the exact revision                                             |
| Published content                       | Immutable numbered publication snapshot                                                  |
| Action and notification display         | Inbox item as an actionable or informational projection                                  |
| Authorization and transition validity   | Server-side authorization plus transactional state, revision, and concurrency validation |

The Inbox is never the approval authority. A failed transition preserves the previously accepted state and never silently changes data.

## 3. State and lifecycle definitions

Exactly five working states exist:

1. **Draft:** Editable. Includes new audits, denied submissions, invalidated approvals, restored audits or steps, and migrated records needing fresh approval.
2. **Pending Approval:** One exact current revision has one unresolved request assigned to exactly one eligible approver.
3. **Approved:** The exact submitted revision was approved and remains valid only while current.
4. **Published:** The approved revision was released as an immutable numbered snapshot.
5. **Draft Revision:** Editable cycle opened from Published. Prior publications remain immutable; a complete submit, approve, publish cycle is required.

**Recently Deleted** is an administrative lifecycle condition for a published snapshot, not a working state. Rejected is not a state. Denial is a request outcome, Inbox result, and activity event.

## 4. Common authorization, revision, and concurrency rules

- `Assigned Analyst` means every user in `assignments.assigned`.
- Any Assigned Analyst may edit and submit an eligible Draft or Draft Revision.
- An Assigned Analyst cannot approve or publish the same audit, including a user who also has `atlas-admin-team`.
- Approve, publish, and unlock require an active authenticated `atlas-admin-team` user who is not an Assigned Analyst and whose state, revision, and concurrency preconditions remain valid.
- The same eligible person may approve and publish, but these remain separate recorded actions.
- Sending a publication to Recently Deleted requires an authenticated `atlas-align-admin`, explicit confirmation, and concurrency validation.
- Later implementations must enforce capability checks at the authoritative server boundary. Client visibility and disabled controls are not authorization.

## 5. Transition matrix

“Exact” means the client-supplied revision/request/publication token still identifies the authoritative current object immediately before commit.

| Action                              | Source                                               | Result                     | Eligible actor and Assigned Analyst rule                                                                            | Revision and concurrency precondition                                                                                  | Required inputs                                                   | Approval-request effect                                     | Inbox effect                                                 | Publication effect                                           | Activity event                                                                 | Failure/stale behavior                                                                           |
| ----------------------------------- | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Create audit                        | None                                                 | Draft                      | Authenticated actor with current create capability; analyst exclusion not applicable                                | Atomic create; no conflicting identifier                                                                               | Valid audit input                                                 | None                                                        | None                                                         | None                                                         | `audit.created` (proposed)                                                     | Reject invalid, unauthorized, or conflicting create; no partial record                           |
| Submit                              | Draft                                                | Pending Approval           | Any Assigned Analyst; selected approver must be active, authenticated-capable, `atlas-admin-team`, and not assigned | Exact current revision; no unresolved competing request; atomic audit/request/Inbox/event write                        | Exactly one eligible approver; optional requester message         | Create unresolved, revision-bound request                   | Create actionable selected-approver item                     | None                                                         | `approval.submission_requested`, `approval.request_created` (proposed)         | Reject stale/invalid state, missing or ineligible approver, or concurrent submit; preserve Draft |
| Submit                              | Draft Revision                                       | Pending Approval           | Same as Draft submit                                                                                                | Same as Draft submit                                                                                                   | Same as Draft submit                                              | Same                                                        | Same                                                         | Prior publication unchanged                                  | Same                                                                           | Preserve Draft Revision on failure                                                               |
| Approve                             | Pending Approval                                     | Approved                   | Selected active `atlas-admin-team` approver, not assigned                                                           | Exact current revision and unresolved exact request; actor still eligible; atomic decision                             | Decision and response, response may be empty if UI policy permits | Resolve Approved with actor, response, timestamp            | Disable action; inform requester                             | None                                                         | `approval.request_approved` (proposed)                                         | Reject stale, changed actor, duplicate, or concurrent action; refresh/disable stale Inbox action |
| Deny                                | Pending Approval                                     | Draft                      | Selected active eligible approver, not assigned                                                                     | Same exact checks as approve                                                                                           | Decision; response required                                       | Resolve Denied with actor, response, timestamp              | Disable action; inform requester                             | None                                                         | `approval.request_denied` (proposed)                                           | Same stale behavior; do not create Rejected state                                                |
| Edit submitted content or metadata  | Pending Approval                                     | Draft                      | Authorized editor, including any Assigned Analyst                                                                   | Exact current revision; atomic edit plus invalidation                                                                  | Valid edit                                                        | Invalidate current request                                  | Disable action; notify requester and selected approver       | None                                                         | `workflow.submitted_content_edited`, `approval.request_invalidated` (proposed) | Stale edit rejected; concurrent approval/edit permits only one atomic winner                     |
| Edit approved content               | Approved                                             | Draft                      | Authorized editor                                                                                                   | Exact approved revision; atomic edit/invalidation                                                                      | Valid edit                                                        | Approval no longer authorizes current revision              | Inform relevant actors as defined in Phase 1 delivery design | None                                                         | `workflow.approved_content_edited`, `approval.request_invalidated` (proposed)  | Stale edit rejected; no publication is changed                                                   |
| Restore audit                       | Draft, Pending Approval, Approved, or Draft Revision | Draft                      | Authorized restore actor                                                                                            | Exact current revision/history target; atomic write; published snapshots excluded                                      | Historical revision and preview acknowledgement                   | Pending request Invalidated; approved authority invalidated | Disable stale action and notify affected actors              | None                                                         | `audit.restored`, and `approval.invalidated_by_restoration` when applicable    | Reject stale/conflict; preserve current content                                                  |
| Restore step                        | Draft, Pending Approval, Approved, or Draft Revision | Draft                      | Authorized restore actor                                                                                            | Same as audit restore                                                                                                  | Historical step and placement preview                             | Same                                                        | Same                                                         | None                                                         | `step.restored`; placement event when adjusted                                 | Reject stale/conflict; published snapshots unchanged                                             |
| Publish                             | Approved                                             | Published                  | Active authenticated `atlas-admin-team`, not assigned                                                               | Exact current revision equals exact approved revision; approval remains valid; publication number allocated atomically | Publication confirmation and required metadata                    | Retain approval history                                     | Informational projection as later specified                  | Create immutable numbered snapshot                           | `audit.published` (proposed)                                                   | Reject stale approval/revision, changed eligibility, duplicate number, or concurrent update      |
| Unlock                              | Published                                            | Draft Revision             | Active authenticated `atlas-admin-team`, not assigned                                                               | Exact publication/current lifecycle and concurrency token                                                              | Unlock confirmation/reason if required                            | No request until resubmission                               | Informational projection                                     | Preserve all publications; create/activate editable revision | `audit.published_unlocked`, `audit.draft_revision_created` (proposed)          | Reject stale/missing publication or changed eligibility                                          |
| Administratively delete publication | Published publication                                | Recently Deleted lifecycle | Authenticated `atlas-align-admin`; assigned exclusion not required by this contract                                 | Exact publication and lifecycle token; explicit confirmation; atomic event                                             | Publication ID and explicit confirmation                          | None                                                        | Informational projection if later required                   | Mark only targeted snapshot Recently Deleted                 | `publication.sent_to_recently_deleted` (proposed)                              | Reject missing confirmation, stale/missing snapshot, or concurrent change; no cascade inferred   |

## 6. Actor and capability matrix

| Actor/context                                        | Edit                                           | Submit                 | Approve                                                                                               | Publish                                   | Unlock                           | Send publication to Recently Deleted                                                       |
| ---------------------------------------------------- | ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| Assigned Analyst                                     | Yes, eligible working state                    | Yes                    | No                                                                                                    | No                                        | No unless not assigned at commit | Only if independently `atlas-align-admin`; deletion rule does not imply approval authority |
| Non-assigned active authenticated `atlas-admin-team` | Only with separate edit capability             | Not by this role alone | Yes when selected and exact checks pass                                                               | Yes                                       | Yes                              | No unless also `atlas-align-admin`                                                         |
| Assigned Analyst also `atlas-admin-team`             | Yes                                            | Yes                    | No                                                                                                    | No                                        | No while assigned                | Only if also `atlas-align-admin`                                                           |
| Authenticated `atlas-align-admin`                    | No implied edit right                          | No implied right       | No implied right                                                                                      | No implied right                          | No implied right                 | Yes with confirmation and concurrency validation                                           |
| Inactive user                                        | No transition                                  | No                     | No                                                                                                    | No                                        | No                               | No                                                                                         |
| Unauthenticated user                                 | No                                             | No                     | No                                                                                                    | No                                        | No                               | No                                                                                         |
| Original requester                                   | Edit/submit if currently assigned and eligible | Yes if assigned        | Only if no longer assigned, now eligible, and selected; never on own stale request without all checks | Only if currently eligible and unassigned | Same                             | Only with `atlas-align-admin`                                                              |
| Selected approver                                    | No implied edit right                          | No implied right       | Yes while active, eligible, selected, and request unresolved                                          | Yes if separately eligible                | Yes if separately eligible       | Only with `atlas-align-admin`                                                              |
| Same eligible approver and publisher                 | No implied edit right                          | No implied right       | Yes                                                                                                   | Yes as a separate action                  | Yes                              | Only with `atlas-align-admin`                                                              |
| Stale actor or changed roles/assignments             | No action from stale projection                | Revalidate             | Reject if no longer eligible                                                                          | Reject                                    | Reject                           | Reject if admin capability lost                                                            |

## 7. Approval request and Inbox lifecycle

### Entities

- **Approval request:** system of record with audit ID, exact revision ID, requester, selected approver, status, decision, response, timestamps, and history.
- **Actionable Inbox item:** projection permitting the selected approver to attempt an unresolved request action. It must revalidate authoritative data on action.
- **Informational Inbox item:** non-authoritative notification with no transition authority.
- **Decision:** Approved or Denied outcome recorded on the request.
- **Request status:** Unresolved, Approved, Denied, Invalidated, or Superseded. `Superseded` is used only when a newer accepted submission replaces an older request; editing/restoration or eligibility loss uses Invalidated.
- **Inbox delivery/display status:** independent from request status and must not imply authority. Exact names remain Phase 1 verification/design work.
- Completed and invalidated requests remain historical. Stale actions return an actionable error and refresh or disable the projection.

### Invalidation matrix

| Case                                          | Actionable?                                                    | Request status                                                                                                   | Audit state                   | Inbox action                      | Notifications/event                                            | User response                              | New submission?                            |
| --------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Content or metadata edited pending            | No                                                             | Invalidated                                                                                                      | Draft                         | Disabled                          | Notify requester/approver; edit plus invalidation events       | Content changed; request no longer current | Yes                                        |
| Assignment change affects analyst exclusion   | No if approver becomes assigned or request eligibility changes | Invalidated                                                                                                      | Draft                         | Disabled                          | Notify affected actors; invalidation event                     | Eligibility changed                        | Yes                                        |
| Approver inactive or loses `atlas-admin-team` | No                                                             | Invalidated                                                                                                      | Draft                         | Disabled                          | Notify requester/approver when deliverable; invalidation event | Approver no longer eligible                | Yes, choose eligible approver              |
| Approver becomes Assigned Analyst             | No                                                             | Invalidated                                                                                                      | Draft                         | Disabled                          | Same                                                           | Assigned Analyst cannot approve this audit | Yes                                        |
| Revision changed by another accepted write    | No                                                             | Invalidated                                                                                                      | Draft                         | Disabled                          | Notify; invalidation and concurrency diagnostics               | Request targets an older revision          | Yes                                        |
| Audit or step restored pending                | No                                                             | Invalidated                                                                                                      | Draft                         | Disabled                          | Restoration and approval-invalidated events                    | Restoration changed current content        | Yes                                        |
| Approve/deny against stale revision           | No                                                             | Existing authoritative status unchanged                                                                          | Authoritative state unchanged | Refresh/disable as applicable     | Stale-action event                                             | Refresh and review current audit           | Based on current state                     |
| Duplicate decision; already resolved          | No                                                             | Approved or Denied                                                                                               | Existing state                | Disabled                          | Stale/already-resolved diagnostic event                        | Request already resolved                   | No, unless current state later requires it |
| Already invalidated or superseded             | No                                                             | Existing status                                                                                                  | Current authoritative state   | Disabled                          | Stale-action event                                             | Request is no longer actionable            | Yes when working state allows              |
| Concurrent approval and edit                  | Only atomic winner                                             | Winner determines Approved or Invalidated                                                                        | Approved or Draft             | Loser refreshes                   | Decision or edit/invalidation plus conflict event              | Concurrent update; refresh                 | If edit wins, yes                          |
| Concurrent approval and denial                | Only atomic winner                                             | Approved or Denied                                                                                               | Approved or Draft             | Disabled                          | Winning decision plus conflict event                           | Request already resolved                   | Depends on outcome                         |
| Concurrent submit attempts                    | Only atomic winner                                             | New accepted request; other rejected or older request Superseded only if an explicit accepted replacement occurs | Pending Approval              | One authoritative actionable item | Request-created and conflict events                            | Another submission was accepted            | No for accepted request                    |
| Audit missing/inaccessible                    | No                                                             | No unsafe mutation                                                                                               | No unsafe mutation            | Disabled/hidden after refresh     | Diagnostic event without sensitive details                     | Audit unavailable or access denied         | Not determinable until access restored     |

All decision commits revalidate authentication, capability, Assigned Analyst exclusion, selected actor, state, exact revision, unresolved request, and concurrency atomically.

## 8. Publication and Recently Deleted

A publication is allowed only from Approved and freezes the authoritative audit JSON plus attachment identifiers/references contained in that JSON. Publication allocates an immutable number and preserves prior publications. Normal editing, ordinary deletion, archive, and restoration cannot mutate a published snapshot.

Unlock preserves the source publication and records actor, source publication, resulting working revision, and timestamp. The Draft Revision must complete a new approval cycle.

Recently Deleted affects only the targeted publication snapshot under this contract. No cascade to the working audit, other publications, or a Draft Revision is inferred. Retention duration, restore from Recently Deleted, and permanent deletion are unresolved product policies and block later destructive implementation until separately approved.

## 9. Legacy migration matrix

| Source value                  | Target                                                                                                                                        | Approval/publication treatment                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Draft                         | Draft                                                                                                                                         | None synthesized                                               |
| Requirement Gathering         | Draft                                                                                                                                         | None synthesized                                               |
| Ready for Review              | Pending Approval only if a valid exact revision-bound request and eligible approver can be established from verified records; otherwise Draft | Never invent approver/request/decision                         |
| Complete                      | Draft                                                                                                                                         | Editable; not approved or published; fresh submission required |
| Null, blank, or missing       | Draft, preserving verified current normalization                                                                                              | None synthesized                                               |
| Differently cased known value | Normalize only if Phase 1 data profiling and migration design explicitly establish safe case-insensitive equivalence                          | None synthesized                                               |
| Duplicate audit               | Draft, preserving verified current duplicate rule                                                                                             | None synthesized                                               |
| Unknown value                 | Safe non-approving result: Draft plus reconciliation record, unless validated current data constraints require the migration to stop          | None synthesized                                               |

Migration must be idempotent, transactionally bounded by the validated schema and batch design, and observable. Before and after reports must include counts by raw source value, mapped value, unresolved Ready for Review records, unknown values, failures, and reconciled totals. No numeric results are claimed in Phase 0. Rollback and recovery claims require a validated forward-migration design, backup/recovery capability, and transaction boundaries. Phase 0 executes no migration.

## 10. Restoration contract

Restoration creates a new current editable revision with lineage and an event. Restored audits and steps result in Draft, including from Pending Approval, Approved, or Draft Revision. Restoration invalidates any request or approval no longer bound to the exact current revision and never mutates a publication.

If a restored step's former parent is absent, the preview must disclose root placement; commit sets `parentId` to `null`, normalizes `branchType` to the verified canonical root value, and records placement-adjustment metadata. Phase 1 must verify the root literal from hierarchy source and persisted examples before implementation. Existing separate parent/branch fields and established hierarchy utilities should be reused only after source confirms the applicable path.

## 11. Attachment Snapshot Finding

### Inspected evidence

The supplied current project context identifies audit JSON persistence, import/repository boundaries, revision history, and publication/export surfaces, but the supplied attachments do not establish separate attachment-binary storage or immutable binary snapshot behavior.

### Verified facts and unknowns

- Verified minimum: publication freezes authoritative audit JSON and attachment identifiers/references contained in that JSON.
- Unknown: whether binaries exist separately, where they are stored, and whether they can be copied, versioned, retained, recovered, or made immutable.

### Phase 1 verification

Inspect current audit document shapes and samples, repository normalization/import, routes, storage paths, identifiers, database schema, and any object/file storage. Record evidence and emit `attachment.snapshot_verification_completed` only after verification. Do not claim binary coverage without proof.

## 12. Workflow event catalog

Identifiers below are proposed because current persistent event names were not verified.

| Proposed event                               | Trigger                                         | State/lifecycle result       | Required context                                                     | History use                           |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `audit.created`                              | Create accepted                                 | Draft                        | audit, revision, actor, timestamp, outcome, correlation if supported | User + diagnostics                    |
| `approval.submission_requested`              | Submit accepted                                 | Pending Approval             | audit/revision/request, requester, approver, timestamp               | User + diagnostics                    |
| `approval.request_created`                   | Request persisted                               | Pending Approval             | Same plus request status                                             | User + diagnostics                    |
| `approval.request_approved`                  | Approval accepted                               | Approved                     | Decision actor/response/time and request                             | User + diagnostics                    |
| `approval.request_denied`                    | Denial accepted                                 | Draft                        | Decision actor/response/time and request                             | User + diagnostics                    |
| `approval.request_invalidated`               | Edit, restore, or eligibility loss              | Draft                        | Request, reason, actor/system initiator, revision lineage            | User + diagnostics                    |
| `approval.request_superseded`                | New accepted submission explicitly replaces old | Pending Approval             | Old/new request IDs and correlation                                  | User + diagnostics                    |
| `workflow.submitted_content_edited`          | Pending content changes                         | Draft                        | Audit, old/new revisions, actor, reason                              | User + diagnostics                    |
| `workflow.approved_content_edited`           | Approved content changes                        | Draft                        | Audit, approved/new revisions, actor                                 | User + diagnostics                    |
| `audit.restored`                             | Audit restore accepted                          | Draft                        | Source/target revisions, actor, restoration metadata                 | User + diagnostics                    |
| `step.restored`                              | Step restore accepted                           | Draft                        | Step, source/target revisions, actor, metadata                       | User + diagnostics                    |
| `step.orphan_placement_adjusted`             | Missing former parent                           | Draft                        | Step, missing parent, root placement and branch normalization        | User + diagnostics                    |
| `approval.invalidated_by_restoration`        | Restore breaks binding                          | Draft                        | Request, prior/current revision, restoration correlation             | User + diagnostics                    |
| `audit.published`                            | Publish accepted                                | Published                    | Audit/revision/approval/publication ID and number, publisher, time   | User + diagnostics                    |
| `audit.published_unlocked`                   | Unlock accepted                                 | Draft Revision               | Source publication, actor, time                                      | User + diagnostics                    |
| `audit.draft_revision_created`               | Editable cycle created                          | Draft Revision               | Source publication and new revision                                  | User + diagnostics                    |
| `publication.sent_to_recently_deleted`       | Admin deletion accepted                         | Recently Deleted             | Publication ID/number, admin actor, confirmation, time               | User + diagnostics                    |
| `workflow.stale_action_rejected`             | Stale action rejected                           | Unchanged                    | Actor, target IDs, safe reason, expected/actual tokens where safe    | Diagnostics; user-visible when useful |
| `workflow.concurrency_conflict_detected`     | Concurrent conflict                             | Unchanged or winner's result | Correlation and safe concurrency metadata                            | Diagnostics                           |
| `migration.status_mapped`                    | Legacy row mapped                               | Mapped state                 | Audit, raw/normalized values, outcome, batch correlation             | Diagnostics/reconciliation            |
| `migration.legacy_complete_reset`            | Complete mapped                                 | Draft                        | Audit/revision, no synthetic authorities                             | User + diagnostics                    |
| `attachment.snapshot_verification_completed` | Verification completed                          | None                         | Evidence inspected, result, actor, timestamp                         | Diagnostics/governance                |

Every applicable event includes audit ID, revision ID, actor, timestamp, outcome, reason/response, request ID, publication ID/number, requester/target actor, restoration and placement metadata, and correlation/concurrency metadata when the architecture supports it. Sensitive internals are not user-facing.

## 13. Error categories

| Category                       | Required behavior                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Authentication required        | Request sign-in; no state change                                                  |
| Capability denied              | State required capability without exposing policy internals                       |
| Assigned Analyst exclusion     | Explain the audit cannot be approved/published by an assigned analyst             |
| Invalid source state           | Identify the allowed current action context                                       |
| Stale audit revision           | Preserve state; refresh current revision                                          |
| Stale approval request         | Disable/refresh Inbox action                                                      |
| Changed actor eligibility      | Reject and refresh eligibility                                                    |
| Missing required approver      | Require exactly one eligible approver                                             |
| Approver no longer eligible    | Return to safe Draft through authoritative invalidation when committed atomically |
| Concurrent update              | Reject loser; refresh authoritative state                                         |
| Publication no longer current  | Reject and refresh approval/revision/publication data                             |
| Already resolved action        | Disable repeat action and show recorded outcome                                   |
| Missing publication snapshot   | No deletion/unlock mutation; report unavailable snapshot                          |
| Admin confirmation missing     | Require explicit confirmation; no mutation                                        |
| Restoration parent unavailable | Preview adjusted root placement before commit                                     |
| Attachment behavior unverified | Limit promise to JSON and embedded references                                     |

Errors are actionable, do not expose secrets/tokens/database internals, preserve accepted state on failure, produce diagnostics/events where defined, and refresh stale projections.

## 14. Phase 1 implementation-impact appendix

Verified current touchpoints to inspect, without Phase 0 modification:

- Backend: `server.js`, `src/audit-authorization.js`, `src/audit-repository.js`, `src/schema.js`, current migrations.
- Browser state/persistence: `js/01-state-dom.js`, `js/04-persistence.js`, `js/11-repo-library.js`, `js/16-page-shell.js`, `js/18-audit-database.js`, `js/19-audit-version-history.js`.
- Hierarchy/validation: `js/02-hierarchy.js`, `js/08-step-templates-validation.js`, `js/23-atlas-audit-issues.js`.
- Presentation review: My Audits and Publication Preview HTML/CSS, plus `index.html` load order.
- Data/tests: `audit-index.json`, `audits/*.json`, schema/profile/audit-issue tests, and any discovered Inbox/publication/event tables or routes.

Phase 1 must verify exact schema, constraints, revision tokens, transactions, routes, role enforcement, Inbox model, event conventions, root `branchType`, and attachment storage before proposing changes. Any material source conflict is blocking and must revise this contract rather than silently changing policy.

## 15. Cross-matrix consistency checklist

- Exactly five working states are used; Recently Deleted is lifecycle-only; Rejected is absent.
- Assigned Analysts cannot approve or publish their audit.
- Approval is request-authoritative, exact-revision-bound, and separate from publication.
- Every content-changing edit or restoration invalidates incompatible pending/approved authority and returns to Draft.
- Publications remain immutable; unlock creates Draft Revision; administrative deletion targets one publication without inferred cascade.
- Legacy Complete maps to Draft with no synthetic approval/publication; unsafe Ready for Review records map to Draft rather than inventing an approver.
- Inbox items are projections and stale actions revalidate server-side.
- Attachment promises stop at JSON and embedded references until binary storage is verified.
- Phase 0 changes documentation only.

## Pending Approval mutation lock and analyst rescission

- `Pending Approval` is a hard audit-document mutation lock for every user. Review-session decisions and discussions remain separate from audit-document writes.
- The active approval request remains bound to its submitted revision. Ordinary save, restore, assignment, and import-over-existing-audit operations must not advance the audit while the request is active.
- A current Assigned Analyst may rescind the exact current Pending request with a nonblank reason. Rescission is atomic, resolves actionable Inbox projections, closes any Draft review session as `Rescinded`, records `approval.request_rescinded`, preserves history, and creates no audit revision.
- Rescission returns an initial workflow cycle to `Draft` and a post-publication cycle to `Draft Revision`, based on persisted publication lineage.
