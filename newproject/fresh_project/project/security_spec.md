# Security Specification: Referral System & Coin Integrity

## 1. Data Invariants
- **Identity:** `uid` field must always match the document ID.
- **Relational Integrity:** `referredBy` can only be set during document creation.
- **Self-Referral Prevention:** `referredBy` cannot be the same as the user's `uid`.
- **Referral Reward Lock:** Referrers can only have their `referralCoins` and `totalReferrals` updated when a new user joins.
- **Immutability:** `createdAt` and `email` cannot be changed after creation.

## 2. The "Dirty Dozen" Payloads (Anti-Tests)
1. **The Spoof:** User A tries to create a profile for User B.
2. **The Double Dip:** User A tries to change their `referredBy` after signup.
3. **The Self-Referral:** User A tries to sign up with `referredBy: UserA`.
4. **The Coin Fountain:** User A tries to increment their own `coins` without a valid activity.
5. **The Referrer Hack:** User A tries to update User B's `coins` by 1,000,000.
6. **The Shadow Referral:** User A tries to update User B's `totalReferrals` without creating their own profile.
7. **The Identity Thief:** User A tries to change their `uid` field to User B's ID.
8. **The Admin Impersonator:** User A tries to update a withdrawal status to 'completed'.
9. **The Transaction Spammer:** User A tries to add a transaction for User B.
10. **The Negative Drain:** User A tries to set User B's `coins` to -10,000.
11. **The Large Payload:** User A tries to inject 1MB of metadata into a user document.
12. **The Unauthorized List:** A non-admin tries to list all withdrawal requests.

## 3. Test Runner Logic (Conceptual)
The `firestore.rules` will be designed to block all the above. Specifically:
- `allow update` on referrers will use `getAfter()` to check for the new user's profile creation.
- `affectedKeys()` will be used to whitelist only specific fields for specific actions.
