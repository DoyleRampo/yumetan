import OpenAI from "openai";
import { z } from "zod/v4";
import { fault } from "./access.js";
export function createAI({
  access,
  env = process.env,
  client = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 })
    : null,
}) {
  // This budget calculation is specific to GPT-4.1 mini ($0.40/M input, $1.60/M output).
  const model = "gpt-4.1-mini-2025-04-14";
  return {
    model,
    async call({ user, system, messages, schema, kind }) {
      if (!client) throw fault(503, "aiUnavailable");
      const jsonSchema = z.toJSONSchema(schema);
      const input = messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((c) =>
              c.type === "image"
                ? {
                    type: "image_url",
                    image_url: {
                      url: `data:${c.source.media_type};base64,${c.source.data}`,
                      detail: "low",
                    },
                  }
                : { type: "text", text: c.text },
            )
          : m.content,
      }));
      const outputLimit = kind === "handwriting" ? 1600 : 800;
      const text = JSON.stringify({
        system,
        schema: jsonSchema,
        messages: messages.map((m) => ({
          ...m,
          content: Array.isArray(m.content)
            ? m.content.filter((c) => c.type === "text")
            : m.content,
        })),
      });
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > 30000) throw fault(400, "aiTextTooLong");
      // UTF-8 bytes upper-bound text tokens; add image + request envelope reserve.
      const costMicros = Math.ceil(
        (bytes + (kind === "handwriting" ? 4096 : 1024)) * 0.4 +
          outputLimit * 1.6,
      );
      await access.consume(
        user.uid,
        kind === "handwriting" ? "handwriting" : "reflections",
        1,
        true,
        costMicros,
        Number(env.AI_GLOBAL_MONTHLY_USD || 20) * 1000000,
      );
      let result;
      try {
        result = await client.chat.completions.create({
          model,
          store: false,
          max_completion_tokens: outputLimit,
          messages: [
            { role: "system", content: system.map((s) => s.text).join("\n") },
            ...input,
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "dream_response",
              strict: true,
              schema: jsonSchema,
            },
          },
        });
      } catch {
        throw fault(502, "aiFailed");
      }
      const choice = result.choices?.[0];
      if (choice?.finish_reason !== "stop" || choice.message.refusal)
        throw fault(502, "aiFailed");
      try {
        return schema.parse(JSON.parse(choice.message.content));
      } catch {
        throw fault(502, "aiFailed");
      }
    },
    async moderate(text) {
      // Social content is sent only when the user explicitly publishes/comments.
      if (!client) throw fault(503, "moderationUnavailable");
      const r = await client.moderations.create({
        model: "omni-moderation-latest",
        input: text,
      });
      if (r.results.some((x) => x.flagged)) throw fault(422, "contentRejected");
    },
  };
}
