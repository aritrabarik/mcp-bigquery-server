import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { BigQuery } from "@google-cloud/bigquery";

const app = express();
app.use(bodyParser.json());

const projectId = process.env.GOOGLE_PROJECT_ID!;
const location = process.env.BIGQUERY_LOCATION || "US";
const dataset = process.env.BIGQUERY_DATASET || "zupeexg";
const credentialsJson = JSON.parse(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!
);
const bigquery = new BigQuery({
    projectId,
    credentials: credentialsJson,
});

function qualifyInformationSchema(
    sql: string,
    projectId: string,
    dataset: string
): string {
    const pattern = /FROM\s+INFORMATION_SCHEMA\.TABLES/gi;
    return sql.replace(
        pattern,
        `FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\``
    );
}

function formatAsMarkdownTable(rows: any[]): string {
    if (rows.length === 0) return "No data found.";

    const headers = Object.keys(rows[0]);
    const headerLine = `| ${headers.join(" | ")} |`;
    const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;

    const rowLines = rows.map(
        (row) => `| ${headers.map((key) => row[key] ?? "").join(" | ")} |`
    );

    return [headerLine, separatorLine, ...rowLines].join("\n");
}

app.post("/execute", async (req: Request, res: Response): Promise<void> => {
    const payload = req.body;

    if (payload.method === "tools/list") {
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

    if (
        payload.method !== "tools/call" ||
        !payload.params?.name ||
        !payload.params?.arguments?.sql
    ) {
        res.status(400).json({ error: "Invalid MCP payload format." });
        return;
    }

    try {
        const sql = payload.params.arguments.sql;
        const maxBytes =
            payload.params.arguments.maximumBytesBilled || "1000000000";

        const qualifiedSQL = qualifyInformationSchema(sql, projectId, dataset);

        const queryOptions = {
            query: qualifiedSQL,
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
                    text: formatAsMarkdownTable(rows),
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
