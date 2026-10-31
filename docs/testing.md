# Test evidence

Tests execute against the actual local Next.js server, PostgreSQL 17 and authenticated MongoDB 8. Logs in this folder are execution evidence, not simulated results. Temporary test records are clearly identified and cleaned up.

## Executed checks

| Check | Evidence |
| --- | --- |
| PostgreSQL connection, applied migrations and 9 core tables | setup-verification.log; integration-test.log |
| MongoDB ping, actual documents and unique indexes | setup-verification.log; integration-test.log |
| Original six menu prices and ₹880 bill | integration-test.log; browser checkout/bill test |
| All 8 original SQL queries | Actual result sets in integration-test.log |
| Total trigger INSERT → 880, UPDATE → 1100, DELETE → 940 | integration-test.log |
| Capacity, overlap, concurrent booking and adjacency | integration-test.log; one concurrent success and one 409 |
| All authentication roles, registration hashing, server roles/ownership/Origin | integration-test.log |
| Menu/category/staff/table CRUD | integration-test.log; admin browser scenario |
| Distinct customizations for the same dish | integration-test.log |
| Server bill calculation, price immutability and duplicate checkout protection | integration-test.log |
| Workflow transitions, payment verification, concurrent duplicate payment prevention | integration-test.log |
| Review create/edit/read/ownership/average and preferences persistence | integration-test.log |
| Durable instruction recovery with actual MongoDB shutdown | failure-recovery.log |
| SQL and MongoDB persistence after stopping/restarting both native processes | persistence-test.log |
| Browser customer/staff/admin workflows and responsive layout | e2e-test.log and screenshots/ |
| Runtime assets work with non-loopback requests blocked | First browser test; zero external browser requests |
| ESLint, TypeScript, production build, dependency audit | quality-checks.log; production-build.log |

The Node runner reports **27 passed**: 26 scenario subtests plus the parent suite test. Playwright runs **7 browser scenarios**. Separate native outage/recovery and database restart tests check behavior that mocked tests cannot establish.

The final production server is also restarted independently from development; a production health check and stored sample bill verify the same persistent data. See final-verification.log for process and HTTP evidence.

## Browser coverage

1. All categories, vegetarian filtering, search, customization, quantity changes, basket persistence, image loading and local-only assets.
2. Register a customer, reproduce the submitted ₹880 order, pay via simulated UPI, read persisted instructions, and leave a per-dish review.
3. Book and cancel a table; update and reload dietary/allergen preferences.
4. Sign in as chef, waiter and cashier to prepare → ready → served → completed, with instructions visible.
5. Manager views SQL reports, creates/edits/deletes a category and opens payment records.
6. Mobile 390×844 viewport: no horizontal overflow, usable menu and modal basket.

Desktop (1440px), mobile, reservation, bill/review, kitchen and manager screenshots are retained. They may include disposable browser-test records captured before cleanup; current data is read from the databases.

## Defects found and corrected

- Deep macOS Unix socket paths prevented PostgreSQL startup: replaced with a short checkout-specific socket path.
- Concurrent conflicting reservations were rejected by SQL but surfaced as generic 503: recognize PostgreSQL conflict errors and return actionable HTTP 409.
- Model auto-creation with buffering disabled raced the initial MongoDB connection on repeat seed: disable automatic creation/indexing and explicitly initialize collections/indexes after connection.
- Cached resolved Mongoose connection prevented reuse after explicit disconnection in the restart test: only cache in-flight connection promises and reconnect when disconnected.
- Staff line-serving permission was broader than chef order-serving permission: enforce front-of-house serving on both endpoints and hide the action for chefs.

## Reproduction and limits

Run `npm run db:start`, start the app, then run the commands in README.md sequentially. Recovery and persistence tests intentionally stop **only project-owned native database processes**; do not run them against externally managed/shared servers. Install Playwright's browser once during initial setup.

Windows and physical second-laptop execution have not been performed. Offline verification blocks external browser requests and confirms all runtime assets/connections are local; it does not claim an OS-level Wi-Fi-off test. Payment is simulated. Manual table occupancy is a staff responsibility. MongoDB synchronization is retried by order reads, CLI or manager action, not a background daemon. The project is an educational local application, with no real payment gateway or external deployment.

## 24/7 and demo-login update

The added integration scenario books 23:30–01:00, rejects a conflicting reservation at 00:15 the next day, and accepts the adjacent 01:00 slot. The reservation browser scenario uses 00:30, verifying that the form accepts overnight bookings. Demo authentication uses the numbered addresses and `password@123`; credentials remain scrypt hashes in SQL.

## One-click assignment verification

The added integration scenario checks customer/chef authorization, occupied-table rejection without partial check-in, concurrent idempotent assignment, owner-only dine-in eligibility and orders, active-order completion protection, release after completion, and rejection of future/closed bookings. A browser test opens a customer's basket before staff assignment, clicks Assign table once from the staff reservation page, verifies exactly one request and automatic customer dine-in visibility, then completes the reservation and verifies release. Screenshots: staff-assign-table.png and customer-assigned-table.png.
