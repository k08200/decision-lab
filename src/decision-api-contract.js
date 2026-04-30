export function buildOpenApiSpec({
  title = "Decision Lab API",
  version = "2.63.0",
  serverUrl = "http://127.0.0.1:8787"
} = {}) {
  return {
    openapi: "3.1.0",
    info: {
      title,
      version,
      description: "Local-first decision operating API for records, reports, memos, and audit logs."
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      "/healthz": {
        get: {
          summary: "Health check",
          security: [],
          responses: { 200: jsonResponse("Health status") }
        }
      },
      "/api/decisions": {
        get: {
          summary: "List decision rows",
          responses: { 200: jsonResponse("Decision list payload") }
        },
        post: {
          summary: "Create a draft decision",
          requestBody: jsonBody({
            type: "object",
            properties: {
              question: { type: "string" },
              type: { type: "string", enum: ["general", "investment", "business", "finance"] },
              owner: { type: "string" }
            },
            required: ["question"]
          }),
          responses: { 201: jsonResponse("Created decision") }
        }
      },
      "/api/decision": {
        get: {
          summary: "Read one decision",
          parameters: [fileParameter()],
          responses: { 200: jsonResponse("Decision with validation and memo") }
        },
        put: {
          summary: "Validate and save one decision",
          parameters: [fileParameter()],
          requestBody: jsonBody({
            type: "object",
            description: "Decision record or object containing a decision property."
          }),
          responses: { 200: jsonResponse("Save result") }
        }
      },
      "/api/reports": {
        get: {
          summary: "List available reports",
          responses: { 200: jsonResponse("Report catalog") }
        }
      },
      "/api/report/{id}": {
        get: {
          summary: "Render a Markdown report",
          parameters: [{
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }],
          responses: { 200: textResponse("Markdown report") }
        }
      },
      "/api/memo": {
        get: {
          summary: "Render a decision memo",
          parameters: [fileParameter()],
          responses: { 200: textResponse("Markdown memo") }
        }
      },
      "/api/audit-log": {
        get: {
          summary: "Read append-only audit events",
          responses: { 200: jsonResponse("Audit event list") }
        }
      },
      "/api/openapi.json": {
        get: {
          summary: "OpenAPI contract",
          security: [],
          responses: { 200: jsonResponse("OpenAPI document") }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key"
        }
      }
    }
  };
}

function fileParameter() {
  return {
    name: "file",
    in: "query",
    required: true,
    schema: { type: "string" }
  };
}

function jsonBody(schema) {
  return {
    required: true,
    content: {
      "application/json": { schema }
    }
  };
}

function jsonResponse(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: { type: "object" }
      }
    }
  };
}

function textResponse(description) {
  return {
    description,
    content: {
      "text/plain": {
        schema: { type: "string" }
      }
    }
  };
}
