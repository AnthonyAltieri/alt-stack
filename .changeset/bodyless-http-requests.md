---
"@alt-stack/http-client-core": patch
"@alt-stack/http-client-fetch": patch
"@alt-stack/http-client-ky": patch
---

Allow HTTP operations without a request body to omit `body` in Fetch and Ky call options while rejecting payloads for those operations. Preserve required body checks and allow schemas accepting `undefined` to omit the body. Only add the default JSON `Content-Type` header when sending a body.
