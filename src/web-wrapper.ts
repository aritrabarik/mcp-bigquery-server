import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { BigQuery } from "@google-cloud/bigquery";

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

app.post("/execute", async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = req.body;

        if (req.body.method === "tools/list") {
            res.json({
                tools: [
                    {
                        name: "query",
                        description: "Run a read-only BigQuery SQL query",
                        inputSchema: {
                            type: "object",
                            properties: {
                                sql: { type: "string" },
                                maximumBytesBilled: {
                                    type: "string",
                                    description: "Optional query billing cap",
                                },
                            },
                        },
                    },
                ],
            });
            return;
        }

        // Basic MCP format validation
        if (
            payload.method !== "tools/call" ||
            !payload.params?.name ||
            !payload.params?.arguments?.sql
        ) {
            res.status(400).json({ error: "Invalid MCP payload format." });
            return;
        }

        const sql = payload.params.arguments.sql;
        const maxBytes =
            payload.params.arguments.maximumBytesBilled || "1000000000";

        const queryOptions = {
            query: sql,
            location,
            maximumBytesBilled:
                typeof maxBytes === "string" ? maxBytes : undefined,
        };

        const [job] = await bigquery.createQueryJob(queryOptions);
        const [rows] = await job.getQueryResults();

        res.json({
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
            isError: false,
        });
    } catch (e) {
        console.error("Execution error:", e);
        res.status(500).json({
            error: "Failed to execute query",
            details: String(e),
        });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`MCP BigQuery wrapper running at http://localhost:${port}`);
});
