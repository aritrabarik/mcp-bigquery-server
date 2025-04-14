import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from "@google-cloud/bigquery";

const DummyTransport = () => ({
    connect: () => Promise.resolve(),
    start: () => Promise.resolve(),
    close: () => Promise.resolve(),
    onRequest: () => {},
    send: () => Promise.resolve(),
});

const app = express();
app.use(bodyParser.json());

const projectId = process.env.GOOGLE_PROJECT_ID!;
const location = process.env.BIGQUERY_LOCATION || "US";
const credentialsJson = JSON.parse(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!
);
const bigquery = new BigQuery({
    projectId,
    credentials: credentialsJson,
});

// Init MCP Server
const server = new Server(
    {
        name: "mcp-server/bigquery",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {
                query: {
                    description: "Run a read-only BigQuery SQL query",
                    inputSchema: {
                        type: "object",
                        properties: {
                            sql: { type: "string" },
                            maximumBytesBilled: {
                                type: "string",
                                optional: true,
                            },
                        },
                    },
                },
            },
            resources: {},
        },
    }
);

// Tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "query") {
        throw new Error(`Unsupported tool: ${request.params.name}`);
    }

    const sql = request.params.arguments?.sql;
    if (!sql || typeof sql !== "string") {
        throw new Error("Missing or invalid 'sql' argument");
    }

    const maxBytes =
        request.params.arguments?.maximumBytesBilled || "1000000000";

    const queryOptions = {
        query: sql,
        location,
        maximumBytesBilled: typeof maxBytes === "string" ? maxBytes : undefined,
    };

    const [job] = await bigquery.createQueryJob(queryOptions);
    const [rows] = await job.getQueryResults();

    return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        isError: false,
    };
});

// HTTP handler
app.post("/execute", async (req: Request, res: Response) => {
    try {
        const parsed = CallToolRequestSchema.parse(req.body);
        const result = await server.request(parsed, CallToolRequestSchema, {
            timeout: 300_000, // 5 minutes (in ms)
        });

        res.json(result);
    } catch (e) {
        console.error("Execution error:", e);
        res.status(500).json({
            error: "Failed to execute query",
            details: String(e),
        });
    }
});

// Start server with dummy transport
const port = process.env.PORT || 8080;
server
    .connect(DummyTransport())
    .then(() => {
        app.listen(port, () => {
            console.log(
                `MCP BigQuery wrapper running at http://localhost:${port}`
            );
        });
    })
    .catch((err) => {
        console.error("Failed to connect MCP server:", err);
        process.exit(1);
    });
