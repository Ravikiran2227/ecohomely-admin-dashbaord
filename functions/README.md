# Ecohomely Dashboard Firebase Functions

This folder belongs to the new dashboard project and can be reused by the old admin panel after deployment.

## Function

`cleanupUnusedStorageFiles`

Manual admin-triggered function for finding and deleting Firebase Storage files that are not referenced anywhere in Firestore.

## What It Does

1. Scans every Firestore root collection.
2. Recursively scans subcollections.
3. Collects Storage URLs and direct Storage paths from all document fields.
4. Lists files from Firebase Storage.
5. Deletes files that are not found in Firestore references.

## Safety

- HTTP POST only.
- Admin protected by Firebase Auth admin claims or `x-cleanup-secret`.
- `dryRun` defaults to `true`.
- `maxDelete` limits real deletions.
- Use this rarely, for example monthly, because it reads the full database and lists Storage files.

## Request Example

```bash
curl -X POST "https://REGION-PROJECT.cloudfunctions.net/cleanupUnusedStorageFiles" \
  -H "Content-Type: application/json" \
  -H "x-cleanup-secret: YOUR_SECRET" \
  -d '{ "dryRun": true, "maxDelete": 100, "prefix": "" }'
```

## Deploy Later

Do not deploy now. When ready:

```bash
cd "dashbord 1/dashbord/functions"
npm install
firebase functions:secrets:set STORAGE_CLEANUP_SECRET
cd ..
firebase deploy --only functions:cleanupUnusedStorageFiles
```
