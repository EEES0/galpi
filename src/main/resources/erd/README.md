# Persistence model

The active JPA entities are `User` (`users`) and `Page` (`pages`). Each page belongs to one user; a user may own multiple pages.

`pages.content` stores the editor JSON snapshot: `segments`, `translations`, `explanations`, `inputLanguage`, and `userLanguage`. These arrays are not separate relational tables. Page summaries and their language, source hash, and update time are stored in dedicated page columns. `Page.version` protects editor saves against concurrent changes.

The unused `Segment`, `Translation`, `TermExplanation`, and embeddable `ExplanationSelection` mappings have been removed. The API payload and existing JSON content remain compatible.

Existing databases may still contain `segments`, `translations`, `term_explanations`, and `explanation_selections`, since Hibernate `ddl-auto=update` does not remove old tables. No database cleanup is performed by this change. Before retiring those tables, check for legacy rows and foreign keys; retained legacy rows referencing pages can prevent deletion of those pages.

Run `render-erd.ps1` on Windows to regenerate `natjang-erd.png` from the documented model.
