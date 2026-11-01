# Move the football platform to an external database

## Goal
Keep the app working online and in Lovable preview while moving its shared database away from Lovable Cloud database usage. Preserve football history, immutable predictions, accounts, favourites, security and every automatic update task. This does not eliminate separate AI or app-hosting costs, and external free tiers have limits.

## Verified now
- Zdravko's Neon connection is linked and responds successfully. The destination contains no application tables.
- The current Lovable Cloud database is paused. Its data cannot be exported or its live schedules inspected until it is resumed.
- The app depends on integrated account authentication and protected database access, not only PostgreSQL storage. A database connection alone is not a completed migration.
- Source inspection found 17 automatic hook tasks, 68 server functions and approximately 445 database-query references.

## Work to complete
1. **Recover access and safeguard data.** The owner must resume the current database so its schema, records and account dependencies can be inventoried and backed up. Do not remove Cloud or change existing jobs during this step.
2. **Prepare Neon.** Reconcile both existing migration histories with the live schema. Preserve identifiers, prediction timestamps, constraints and indexes. Measure database size against Neon's current free-tier limits before importing. Import into the empty destination and validate row counts and relationships.
3. **Preserve accounts and security.** Set up external authentication compatible with online and preview access, preserving user-ID ownership or documenting any unavoidable account recovery. Replace integrated token checks and database policies with equivalent server-side authorization. Never expose the Neon owner's privileges to ordinary app users.
4. **Move app reads and writes.** Introduce a server-only external database access layer, migrate feature groups in stages, and keep the old configuration intact until all migrated flows read and write correctly. Never use browser storage as the shared database.
5. **Move every automatic task.** Inventory live schedules after the source is resumed and preserve their exact frequency, authentication, idempotency and retry behavior. Use an external scheduler that can wake Neon; do not rely on a sleeping database to trigger its own jobs. Retain news queues and leases, pick caching, grading and weekly model competition.
6. **Verify and cut over.** Test sign-in, favourites, match/team pages, prediction read-back and each automatic task against Neon. Check both Lovable preview and online operation. Only propose retiring the old database after verified backups and an explicit deletion decision.

## Technical approach
- Keep TanStack Start and existing presentation unchanged.
- Use Neon's linked SQL connector through the server-side gateway with parameterized queries, bounded reads and transactional write batches; do not use a local database file or direct browser database credentials.
- Replace the existing integrated data/auth boundary deliberately rather than editing generated Cloud integration files.
- Select an external authentication and scheduler setup only after verifying that they support the required flows; creating a Neon database does not provision either service.
- Keep source-dependent SQL, authentication migration and scheduler setup blocked until the live inventory is available. Do not guess a replacement schema from the intentionally blank Drizzle schema file.

## What needs the owner's action
- Resume the existing Lovable Cloud database to enable export and live-job inspection. Resuming can restart Cloud usage during the migration.
- Complete any required external account or scheduler authorization when its connection/setup is requested. No subscription purchase or paid provisioning is included without approval.

## Completion criteria
- All source data reconciles with the destination, with no fabricated replacements.
- Accounts and private favourites remain isolated by user.
- All 17 hook tasks have validated schedules and successful useful runs.
- The central flows work in preview and online without depending on the old Cloud database.
- README and roadmap state verified results and any remaining blockers; AI charges remain explicitly separate.