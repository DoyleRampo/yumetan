import OpenAI from "openai";
import { z } from "zod/v4";
import { fault } from "./access.js";
// GPT-5.6 Luna: $0.20/M input, $1.20/M output (2026-07-30 pricing), structured
// outputs, image input, reasoning_effort "none". The alias is used instead of a
// dated snapshot so the deployment does not break when a snapshot is retired;
// OPENAI_MODEL pins one explicitly. OPENAI_FALLBACK_MODEL (default Terra) is tried
// once when the primary model is unknown to the project; "" disables it.
export const DEFAULT_MODEL = "gpt-5.6-luna";
export const DEFAULT_FALLBACK_MODEL = "gpt-5.6-terra";
export const READING_OUTPUT_TOKENS = 1600;
export const HANDWRITING_OUTPUT_TOKENS = 2000;
// The whole request (system prompt + JSON payload) in UTF-8 bytes. Bytes over-count
// tokens for every language, so this is a safe cost bound, not a token limit.
export const MAX_INPUT_BYTES = 80000;
const STATUS_TTL = 10 * 60 * 1000;
// Cost reservation: ASCII runs about 3.5-4 bytes per token, CJK about 1.5-3 bytes
// per token, so bytes/3.5 and bytes/2 both over-count and keep the budget safe.
export function estimateTokens(text) {
  let ascii = 0,
    other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
    else other += Buffer.byteLength(ch, "utf8");
  }
  return Math.ceil(ascii / 3.5 + other / 2);
}

const describe = (error) => ({
  status: error?.status ?? null,
  code: error?.code || error?.error?.code || null,
  type: error?.type || error?.error?.type || null,
  message: String(error?.message || "").slice(0, 300),
});
const text = (error) =>
  `${describe(error).code || ""} ${describe(error).message}`;
// The project cannot use this model at all (unknown id, no access): try the fallback.
const modelProblem = (error) =>
  error?.status === 404 ||
  /model_not_found|does not exist|not have access to|unsupported model|invalid model/i.test(
    text(error),
  );
// The model rejects a request parameter (typically reasoning_effort): retry without it.
const paramProblem = (error) =>
  error?.status === 400 &&
  /reasoning|unsupported_parameter|unsupported_value|not supported with this model/i.test(
    text(error),
  );
// The key or the account is the problem; retrying cannot help.
const accountProblem = (error) =>
  error?.status === 401 ||
  error?.status === 403 ||
  /insufficient_quota|billing_hard_limit|invalid_api_key|account_deactivated/i.test(
    text(error),
  );

export function createAI({
  access,
  env = process.env,
  client = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 })
    : null,
  log = console,
}) {
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const fallback =
    env.OPENAI_FALLBACK_MODEL === undefined
      ? DEFAULT_FALLBACK_MODEL
      : env.OPENAI_FALLBACK_MODEL;
  let status = null;
  async function complete(request) {
    const result = await client.chat.completions.create(request);
    const choice = result.choices?.[0];
    if (!choice || choice.message?.refusal)
      throw Object.assign(new Error("refused"), { refused: true });
    if (choice.finish_reason !== "stop")
      throw Object.assign(new Error(`finish_reason ${choice.finish_reason}`), {
        truncated: true,
      });
    return choice.message.content;
  }
  return {
    model,
    fallback,
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
      const outputLimit =
        kind === "handwriting"
          ? HANDWRITING_OUTPUT_TOKENS
          : READING_OUTPUT_TOKENS;
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
      if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES)
        throw fault(400, "aiTextTooLong");
      // Reserve the upper-bound cost in micro-dollars at Luna prices (input $0.20/M,
      // output $1.20/M); add an image + request envelope reserve.
      const costMicros = Math.ceil(
        (estimateTokens(text) + (kind === "handwriting" ? 1600 : 256)) * 0.2 +
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
      const request = {
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
      };
      let content;
      try {
        content = await complete(request);
      } catch (error) {
        const info = describe(error);
        log.error("OpenAI request failed", { kind, model, ...info });
        if (error.refused || error.truncated) throw fault(502, "aiFailed");
        if (accountProblem(error)) throw fault(503, "aiUnavailable");
        // One corrective retry: drop the rejected parameter, or use the fallback model.
        let retry = null;
        if (paramProblem(error)) {
          const { reasoning_effort, ...rest } = request;
          retry = rest;
        } else if (modelProblem(error) && fallback && fallback !== model)
          retry = { ...request, model: fallback };
        if (!retry) throw fault(502, "aiFailed");
        log.warn("OpenAI retrying", { kind, model: retry.model });
        try {
          content = await complete(retry);
        } catch (again) {
          log.error("OpenAI retry failed", {
            kind,
            model: retry.model,
            ...describe(again),
          });
          throw fault(
            accountProblem(again) ? 503 : 502,
            accountProblem(again) ? "aiUnavailable" : "aiFailed",
          );
        }
      }
      try {
        return schema.parse(JSON.parse(content));
      } catch (error) {
        log.error("OpenAI response did not match the schema", {
          kind,
          message: String(error?.message || "").slice(0, 200),
        });
        throw fault(502, "aiFailed");
      }
    },
    // Whether the configured key can see the configured model. Cached; never
    // includes secrets. `models.retrieve` is free, so /api/health can show it.
    async status(now = Date.now()) {
      if (!client)
        return { configured: false, model, available: false, error: "noKey" };
      if (status && now - status.at < STATUS_TTL) return status.value;
      let value;
      if (!client.models?.retrieve)
        value = { configured: true, model, available: null, error: null };
      else
        try {
          await client.models.retrieve(model);
          value = { configured: true, model, available: true, error: null };
        } catch (error) {
          const info = describe(error);
          log.warn("OpenAI model check failed", { model, ...info });
          value = {
            configured: true,
            model,
            available: false,
            error: modelProblem(error)
              ? "modelNotFound"
              : accountProblem(error)
                ? "keyRejected"
                : "unreachable",
            fallback: fallback || null,
          };
        }
      status = { at: now, value };
      return value;
    },
  };
}
