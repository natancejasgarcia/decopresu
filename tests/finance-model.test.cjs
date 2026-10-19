const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-ts.cjs");

async function withProvider(run) {
  const previousFetch = global.fetch;
  const names = [
    "OPENAI_API_KEY",
    "OPENAI_FINANCE_MODEL",
    "OPENAI_MODEL",
    "OPENAI_FINANCE_FALLBACK_MODEL",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  for (const name of names) delete process.env[name];
  process.env.OPENAI_API_KEY = "test-not-a-real-key";
  try {
    await run(load("lib/openAiFinance.ts"));
  } finally {
    global.fetch = previousFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}
const success = (model) => ({
  ok: true,
  json: async () => ({
    model,
    status: "completed",
    output: [
      { type: "message", content: [{ type: "output_text", text: "OK" }] },
    ],
  }),
});

test("finance uses GPT-6 Astra with explicit low reasoning, encrypted replay and bounded output", async () =>
  withProvider(async ({ financeAI }) => {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-6-astra");
      assert.deepEqual(body.reasoning, { effort: "low" });
      assert.ok(body.include.includes("reasoning.encrypted_content"));
      assert.equal(body.max_output_tokens, 8192);
      assert.equal(body.store, false);
      assert.deepEqual(body.text, { format: { type: "json_schema" } });
      return success("gpt-6-astra");
    };
    const result = await financeAI({
      input: "invoice",
      text: { format: { type: "json_schema" } },
    });
    assert.equal(result.model, "gpt-6-astra");
    assert.equal(result.notice, undefined);
  }));

test("model access denial retries original GPT-4o contract and returns a visible notice", async () =>
  withProvider(async ({ financeAI }) => {
    const calls = [];
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1)
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: "model_not_found" } }),
        };
      assert.equal(body.reasoning, undefined);
      assert.equal(body.include, undefined);
      assert.equal(body.max_output_tokens, 2400);
      return success("gpt-4o");
    };
    const result = await financeAI({
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: "f.pdf",
              file_data: "data:application/pdf;base64,cGRm",
            },
          ],
        },
      ],
    });
    assert.deepEqual(
      calls.map((c) => c.model),
      ["gpt-6-astra", "gpt-4o"],
    );
    assert.deepEqual(calls[0].input, calls[1].input);
    assert.equal(result.model, "gpt-4o");
    assert.match(result.notice, /respaldo/);
  }));

test("quota, credentials and invalid inputs never trigger extra paid requests", async () =>
  withProvider(async ({ financeAI }) => {
    for (const [status, code] of [
      [429, "insufficient_quota"],
      [401, "invalid_api_key"],
      [400, "invalid_request_error"],
      [503, "server_error"],
    ]) {
      let calls = 0;
      global.fetch = async () => {
        calls++;
        return { ok: false, status, json: async () => ({ error: { code } }) };
      };
      await assert.rejects(financeAI({ input: "test" }));
      assert.equal(calls, 1);
    }
  }));

test("explicit legacy models retain request compatibility and unavailable identical fallbacks do not loop", async () =>
  withProvider(async ({ financeAI }) => {
    process.env.OPENAI_FINANCE_MODEL = "gpt-4o";
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-4o");
      assert.equal(body.reasoning, undefined);
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { code: "model_access_denied" } }),
      };
    };
    await assert.rejects(financeAI({ input: "test" }), /acceso/);
    assert.equal(calls, 1);
  }));

test("incomplete reasoning responses remain recoverable, never silently retried", async () =>
  withProvider(async ({ financeAI }) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({ status: "incomplete", output: [] }),
      };
    };
    await assert.rejects(financeAI({ input: "test" }), /incompleta/);
    assert.equal(calls, 1);
  }));

test("assistant preserves encrypted reasoning when continuing its read-only tool call", async () => {
  let rounds = 0;
  const reasoning = { type: "reasoning", id: "r", encrypted_content: "opaque" };
  const actions = load("actions/financeAssistantActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        supabase: {},
        profile: { permissions_ready: true },
      }),
    },
    "@/lib/financeAssistantData": {
      queryTool: { type: "function", name: "consultar_datos" },
      readFinanceDataset: async () => ({
        dataset: "payments",
        count: 1,
        complete: true,
      }),
    },
    "@/lib/openAiFinance": {
      financeAI: async (body) => {
        rounds++;
        if (rounds === 1)
          return {
            model: "gpt-6-astra",
            output: [
              reasoning,
              {
                type: "function_call",
                name: "consultar_datos",
                call_id: "c",
                arguments: "{}",
              },
            ],
          };
        assert.ok(
          body.input.some((item) => item.encrypted_content === "opaque"),
        );
        assert.ok(
          body.input.some(
            (item) =>
              item.type === "function_call_output" && item.call_id === "c",
          ),
        );
        return { model: "gpt-6-astra", output: [] };
      },
      aiText: () => "Cobrado: 477 EUR.",
    },
  });
  const result = await actions.askFinanceAssistant([
    { role: "user", content: "Cuanto hemos cobrado?" },
  ]);
  assert.equal(result.model, "gpt-6-astra");
  assert.match(result.answer, /477/);
  assert.equal(rounds, 2);
});

test("legacy fallback drops encrypted reasoning while retaining tool call linkage", async () =>
  withProvider(async ({ financeAI }) => {
    let count = 0;
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      count++;
      if (count === 1)
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: "model_not_found" } }),
        };
      assert.equal(
        body.input.some((item) => item.type === "reasoning"),
        false,
      );
      assert.equal(body.input[0].call_id, "c");
      assert.equal(body.input[1].call_id, "c");
      return success("gpt-4o");
    };
    await financeAI({
      input: [
        { type: "reasoning", encrypted_content: "opaque" },
        {
          type: "function_call",
          call_id: "c",
          name: "consultar_datos",
          arguments: "{}",
        },
        { type: "function_call_output", call_id: "c", output: "{}" },
      ],
    });
    assert.equal(count, 2);
  }));
