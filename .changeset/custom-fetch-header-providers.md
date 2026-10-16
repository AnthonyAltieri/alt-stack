---
"@alt-stack/http-client-core": minor
"@alt-stack/http-client-fetch": minor
"@alt-stack/http-client-ky": minor
---

Add an optional fetch implementation to the Fetch client and executor, and support synchronous or asynchronous client header providers in core and both adapters. Providers resolve once per attempt before request headers are applied, including core retries, and failures use a sanitized unexpected error.
