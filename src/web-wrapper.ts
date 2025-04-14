// src/web-wrapper.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
import bodyParser from "body-parser";
import type { Request, Response } from "express";

const app = express();
app.use(bodyParser.json());

app.post("/execute", (req: Request, res: Response) => {
    const mcpProcess = spawn("node", ["dist/index.js"], {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    mcpProcess.stdout.on("data", (data) => {
        output += data.toString();
    });

    mcpProcess.stderr.on("data", (data) => {
        error += data.toString();
        console.error("STDERR:", data.toString());
    });

    mcpProcess.stdin.write(JSON.stringify(req.body) + "\n");

    mcpProcess.stdout.on("end", () => {
        try {
            const parsed = JSON.parse(output);
            res.json(parsed);
        } catch (e) {
            console.error("Failed to parse MCP response:", output);
            res.status(500).send({
                error: "Invalid response from MCP server",
                raw: output,
            });
        }
    });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`MCP BigQuery wrapper running at http://localhost:${port}`);
});
