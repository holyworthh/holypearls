# 3. Rotate R2 keys

**When:** the storage token leaked, or on schedule.

1. Cloudflare → R2 → Manage API tokens → create a token with **Object Read & Write**, limited to the same buckets as the old one, **including the backup bucket**.
2. Render → the api service → Environment → set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` → save. Render redeploys (the worker is in the same container on the free tier).
3. Test an upload and a download on that environment.
4. Delete the old token in Cloudflare.

Signed URLs already issued stop working within 15 minutes. If the token leaked, run runbook 5 (pause uploads) first and check the buckets for objects you don't recognise.
