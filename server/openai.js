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
  // This budget calculation is specific to GPT-5.6 Luna ($0.20/M input, $1.20/M output,
  // post 2026-07-30 pricing). Reasoning is disabled so no hidden reasoning tokens are billed.
  const model = "gpt-5.6-luna-2026-07-09";
  return {
    model,
    async call({ user, system, messages, schema, kind, date = null }) {
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
      // Readings return eleven short fields (mental state + daily fortune), so they
      // get a larger completion window than the old four-field reflection.
      const outputLimit = kind === "handwriting" ? 1600 : 1400;
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
        (bytes + (kind === "handwriting" ? 4096 : 1024)) * 0.2 +
          outputLimit * 1.2,
      );
      // A reading counts against its dream's date (one per dream on every
      // plan); handwriting stays a monthly, paid-only allowance.
      await access.consume(
        user.uid,
        kind === "handwriting" ? "handwriting" : "reflections",
        1,
        true,
        costMicros,
        Number(env.AI_GLOBAL_MONTHLY_USD || 20) * 1000000,
        kind === "handwriting" ? null : date,
      );
      let result;
      try {
        result = await client.chat.completions.create({
          model,
          store: false,
          reasoning_effort: "none",
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
