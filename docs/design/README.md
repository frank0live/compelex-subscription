# Design records

The audits, designs, decision records and plans behind Row-Template's larger
changes. They are kept for maintainers and contributors who want to know **why**
the code is shaped the way it is.

> **These are historical records.** Each one describes the state of the project
> when it was written, including its own "Status" line. A document marked
> "proposal only" or "nothing implemented" may since have been implemented, in
> full or in part. For how the product behaves today, read the code, the
> [README](../../README.md) and the [documentation site](../README.md).

Code and tests cite these documents by file name (for example
`REBECCA-ADAPTER-DECISIONS.md §2`), so the names are stable.

## Templates and designs

| Document | What it is |
| --- | --- |
| [CUSTOM-TEMPLATE-GUIDELINES.md](CUSTOM-TEMPLATE-GUIDELINES.md) | The binding contract every template added to the repository must meet. |
| [CUSTOM-TEMPLATES-PROPOSAL.md](CUSTOM-TEMPLATES-PROPOSAL.md) | Architecture proposal for adding third-party and custom templates. |

## Country flags

| Document | What it is |
| --- | --- |
| [FLAG-RENDERER-AUDIT.md](FLAG-RENDERER-AUDIT.md) | Audit and cost study of the country flag system. |
| [FLAG-RENDERER-PHASE-0.5.md](FLAG-RENDERER-PHASE-0.5.md) | Addendum to the audit: the Phase 0.5 cost study. |

## Panel compatibility

How the subscription page is made to render on panels other than 3X-UI. 3X-UI
is the only supported panel; PasarGuard and Rebecca are research targets.

| Document | What it is |
| --- | --- |
| [PANEL-COMPATIBILITY-AUDIT.md](PANEL-COMPATIBILITY-AUDIT.md) | Source audit of PasarGuard and Rebecca against 3X-UI. Start here. |
| [ARCHITECTURE-MULTIPANEL-PLAN.md](ARCHITECTURE-MULTIPANEL-PLAN.md) | The multi-panel architecture plan built on that audit. |
| [PHASE-1-FOUNDATION-PLAN.md](PHASE-1-FOUNDATION-PLAN.md) | Implementation plan for the multi-panel foundation: canonical shell, adapter interface, panel registry, panel build target. |
| [PASARGUARD-ADAPTER-AUDIT.md](PASARGUARD-ADAPTER-AUDIT.md) | Mapping PasarGuard to the page's data contract, from source. |
| [PASARGUARD-RUNTIME-FIXTURE-PLAN.md](PASARGUARD-RUNTIME-FIXTURE-PLAN.md) | How to validate that mapping against an observed PasarGuard response. |
| [REBECCA-ADAPTER-AUDIT.md](REBECCA-ADAPTER-AUDIT.md) | Mapping Rebecca to the page's data contract, from source. |
| [REBECCA-ADAPTER-DECISIONS.md](REBECCA-ADAPTER-DECISIONS.md) | Decision record for Rebecca's time and status values. |
| [LIVE-POLLING-AUDIT.md](LIVE-POLLING-AUDIT.md) | Audit of the live status refresh contract across panels. |
| [MULTIPANEL-CHECKPOINT-PLAN.md](MULTIPANEL-CHECKPOINT-PLAN.md) | Repository-state audit and commit plan for the multi-panel work. |

## Installer

The management layer under `installer/`, in the order the work was done.

| Document | What it is |
| --- | --- |
| [INSTALLER-MULTIPANEL-AUDIT.md](INSTALLER-MULTIPANEL-AUDIT.md) | Phase 7A: what the installer would need to support more than one panel. |
| [INSTALLER-ACTIVATION-AUDIT.md](INSTALLER-ACTIVATION-AUDIT.md) | Phase 8A: how activation works today, per panel. |
| [INSTALLER-MULTIPANEL-DESIGN.md](INSTALLER-MULTIPANEL-DESIGN.md) | Phase 8B: the multi-panel installer design. |
| [INSTALLER-BACKUP-DESIGN.md](INSTALLER-BACKUP-DESIGN.md) | Phase 8C: the format-2 backup snapshot design. |
| [INSTALLER-BACKUP-REVIEW.md](INSTALLER-BACKUP-REVIEW.md) | Phase 8D: review of the backup design. |
| [INSTALLER-PANEL-INTERFACE.md](INSTALLER-PANEL-INTERFACE.md) | P3: the frozen panel adapter interface. |
| [INSTALLER-TRANSACTION-DESIGN.md](INSTALLER-TRANSACTION-DESIGN.md) | P4: the transaction engine that drives a panel adapter. |
| [INSTALLER-PANEL-3XUI.md](INSTALLER-PANEL-3XUI.md) | P5A: the 3X-UI panel adapter and its validation boundary. |

## Documentation platform

How the documentation site under `docs/` was chosen and built.

| Document | What it is |
| --- | --- |
| [ADR-0001-DOCUMENTATION-FRAMEWORK.md](ADR-0001-DOCUMENTATION-FRAMEWORK.md) | Decision record: why Astro Starlight. |
| [DOCUMENTATION-PLATFORM-PROPOSAL.md](DOCUMENTATION-PLATFORM-PROPOSAL.md) | Architecture proposal for the documentation platform. |
| [DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md](DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md) | The site's design system: tokens and components. |
| [DOCUMENTATION-IMPLEMENTATION-PLAN.md](DOCUMENTATION-IMPLEMENTATION-PLAN.md) | The roadmap that turned the proposals into phases. |
| [PHASE-1-BOOTSTRAP-PLAN.md](PHASE-1-BOOTSTRAP-PLAN.md) | Phase 1 of the documentation programme: bootstrapping the site. |
