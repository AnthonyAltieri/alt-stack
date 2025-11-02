# Troubleshooting

## MIME Type Error

If you see the error:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".
```

This usually means the build cache is corrupted. Try these steps:

1. **Stop the dev server** (Ctrl+C)

2. **Clear the cache:**
   ```bash
   pnpm clear
   ```

3. **Remove build artifacts:**
   ```bash
   rm -rf .docusaurus build
   ```

4. **Restart the dev server:**
   ```bash
   pnpm start
   ```

If the issue persists:

- Check that Node.js version is >= 18
- Ensure all dependencies are installed: `pnpm install`
- Try a fresh install: `rm -rf node_modules && pnpm install`

