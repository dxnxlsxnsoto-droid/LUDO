# Security Specification — CONTA CONTA.

## 1. Data Invariants
1. **Zero-Balance Initialization**: Every newly registered student account MUST initialize with `balanceUnits == 0`, `potUnits == 0`, `streak == 0`, `totalSpins == 0`, and `role == 'student'`.
2. **Verified Identity**: All write operations require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Admin Exclusivity**: Only the bootstrapped verified admin (`dxnxlsxnsoto@gmail.com` with `email_verified == true`) or a UID present in `/admins/{uid}` may read the full student list, modify `/config/game`, or assign/adjust points (`balanceUnits`) for another user.
4. **PII Isolation**: User documents contain `email` and are strictly readable only by `isOwner(userId)` or `isAdmin()`. Blanket `isSignedIn()` reads on `/users` are forbidden.
5. **Immutable Audit Trail**: Movement entries under `/users/{userId}/movements/{movementId}` cannot be updated or deleted once created. Students can only log gameplay movements (`spin_win`, `spin_loss`, `cashout`) on their own path; only admins can log `admin_grant` or `admin_adjust`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.

## 2. "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: User with `email == 'dxnxlsxnsoto@gmail.com'` and `email_verified == false` attempts to update `/config/game`.
2. **Student Self-Promotion**: Student creates `/users/{uid}` with `role: 'admin'`.
3. **Student Starting Balance Injection**: Student creates `/users/{uid}` with `balanceUnits: 10000`.
4. **Student Ghost Field Update**: Student updates `/users/{uid}` adding `isVip: true`.
5. **Cross-User PII Read**: Student A attempts `get` or `list` on `/users/{studentB}` or `/users`.
6. **Cross-User Point Theft**: Student A attempts to update `/users/{studentB}` `balanceUnits`.
7. **Student Config Tampering**: Student attempts to update `/config/game` `minBetWinPct: 99`.
8. **Student Fake Admin Grant Movement**: Student creates `/users/{uid}/movements/{id}` with `type: 'admin_grant'`.
9. **Ledger Tampering**: Student attempts `update` or `delete` on `/users/{uid}/movements/{id}`.
10. **ID Poisoning**: Write to `/users/{uid}/movements/{1500_char_id}` exceeding 128 chars or containing invalid symbols.
11. **Timestamp Forgery**: Create `/users/{uid}` with `createdAt` set to a client-chosen past date instead of `request.time`.
12. **Admin Registry Self-Registration**: Student attempts to create `/admins/{uid}` to escalate privileges.
