import { writeFileSync } from "fs";
import { generateOpenAPISpec } from "@alt-stack/server-hono";
import { authRouter } from "./index.js";

const spec = generateOpenAPISpec({ api: authRouter }, { title: "Auth API", version: "1.0.0" });

writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
console.log("Generated openapi.json");

