---
"@alt-stack/server-express": minor
"@alt-stack/server-hono": minor
"@alt-stack/server-nestjs": minor
"@alt-stack/server-tanstack-start": minor
---

Add adapter-level CORS options that delegate to native Hono and Express facilities, including mount-scoped NestJS support. Remove Hono's generic app-level middleware option so cross-cutting application behavior uses Alt Stack procedure middleware. Document Bun and TanStack Start as unsupported where no native CORS option exists, and prevent the TanStack Start adapter from accepting a synthetic `server.cors` option.
