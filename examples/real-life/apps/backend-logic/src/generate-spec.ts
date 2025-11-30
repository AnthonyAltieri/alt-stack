import { writeFileSync } from "fs";
import { generateOpenAPISpec } from "@alt-stack/server-hono";
import { taskRouter } from "./index.js";

const spec = generateOpenAPISpec({ api: taskRouter }, { title: "Tasks API", version: "1.0.0" });

writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
console.log("Generated openapi.json");

