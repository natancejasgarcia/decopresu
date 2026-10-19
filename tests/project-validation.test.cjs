const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-ts.cjs");
const projectId = "d22939cf-9556-4cd5-86f5-1546ec74b150";
const requestId = "e22939cf-9556-4cd5-86f5-1546ec74b150";
const input = { project_id: projectId, request_id: requestId };

function fixture(options = {}) {
  const rows = structuredClone(options.rows ?? []);
  const uploaded = [],
    removed = [],
    updates = [],
    refreshed = [];
  let builds = 0;
  const storage = {
    async upload(path, bytes, metadata) {
      uploaded.push({ path, bytes, metadata });
      return { error: options.uploadError };
    },
    async remove(paths) {
      removed.push(...paths);
      return { error: null };
    },
  };
  const supabase = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "project-files");
        return storage;
      },
    },
    from(table) {
      assert.equal(table, "budget_validations");
      const filters = [];
      let operation, fields;
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        update(value) {
          operation = "update";
          fields = value;
          return query;
        },
        insert(value) {
          operation = "insert";
          fields = value;
          return query;
        },
        maybeSingle() {
          return execute();
        },
        single() {
          return execute();
        },
      };
      async function execute() {
        const matches = (row) =>
          filters.every(([key, value]) => row[key] === value);
        if (operation) {
          if (options.saveError)
            return { data: null, error: { code: "42501" } };
          if (operation === "update") {
            updates.push({ fields, filters });
            if (options.approvedConcurrently)
              return { data: null, error: { code: "PGRST116" } };
            const row = rows.find(matches);
            assert.ok(row);
            Object.assign(row, fields);
            return { data: { id: row.id }, error: null };
          }
          rows.push(fields);
          return { data: { id: fields.id }, error: null };
        }
        return {
          data: structuredClone(rows.find(matches) ?? null),
          error: options.lookupError,
        };
      }
      return query;
    },
  };
  const { sendProjectBudgetToValidation: send } = load(
    "actions/budgetValidationActions.ts",
    {
      "next/cache": {
        revalidatePath(path) {
          refreshed.push(path);
        },
      },
      "@/lib/auth": {
        async requireUserProfile(access) {
          assert.equal(
            access,
            undefined,
            "must require workspace access, not reviewer access",
          );
          if (options.authError) throw new Error("unauthorized");
          return {
            supabase,
            user: { id: "owner" },
            profile: { permissions_ready: options.ready !== false },
          };
        },
      },
      "@/lib/projectBudgetData": {
        async loadProjectBudget() {
          return options.budgetError
            ? { error: "No se pudo leer" }
            : {
                project: { id: projectId, name: "Calle Ruleta 42" },
                items: options.empty ? [] : [{ total: 100 }],
                rooms: [],
              };
        },
      },
      "@/lib/budgetPdf": {
        async buildBudgetPdf() {
          builds++;
          if (options.pdfError) throw new Error("PDF failure");
          return {
            bytes: Buffer.from("%PDF-1.7"),
            filename: "Presupuesto.pdf",
          };
        },
      },
    },
  );
  return {
    send,
    rows,
    uploaded,
    removed,
    updates,
    refreshed,
    get builds() {
      return builds;
    },
  };
}

test("direct send generates a private PDF and queues an unapproved validation", async () => {
  const f = fixture();
  assert.equal((await f.send(input)).ok, true);
  assert.equal(f.rows[0].id, requestId);
  assert.equal(f.rows[0].project_id, projectId);
  assert.equal(f.rows[0].is_validated, false);
  assert.equal(f.rows[0].created_by, "owner");
  assert.match(f.uploaded[0].path, /^validations\/owner\/.*\.pdf$/);
  assert.equal(f.uploaded[0].metadata.contentType, "application/pdf");
  assert.equal(f.rows[0].file_url, f.uploaded[0].path);
  assert.deepEqual(f.refreshed, ["/validations", "/projects", "/dashboard"]);
  assert.equal(f.removed.length, 0);
});

test("repeat request does not upload or queue the same PDF twice", async () => {
  const f = fixture();
  await f.send(input);
  await f.send(input);
  assert.equal(f.uploaded.length, 1);
  assert.equal(f.rows.length, 1);
  assert.equal(f.builds, 1);
});

test("replaces only a pending PDF, preserving notes and approved history", async () => {
  const f = fixture({
    rows: [
      {
        id: "approved",
        project_id: projectId,
        is_validated: true,
        file_url: "approved.pdf",
      },
      {
        id: "pending",
        project_id: projectId,
        is_validated: false,
        file_url: "old.pdf",
        validation_notes: "Revisar precio",
      },
    ],
  });
  assert.equal((await f.send(input)).id, "pending");
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].file_url, "approved.pdf");
  assert.equal(f.rows[1].validation_notes, "Revisar precio");
  assert.deepEqual(f.removed, ["old.pdf"]);
  assert.ok(
    f.updates[0].filters.some(
      ([key, value]) => key === "is_validated" && value === false,
    ),
  );
});

test("approved history gets a separate new pending submission", async () => {
  const f = fixture({
    rows: [
      {
        id: "approved",
        project_id: projectId,
        is_validated: true,
        file_url: "approved.pdf",
      },
    ],
  });
  assert.equal((await f.send(input)).ok, true);
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].is_validated, true);
  assert.equal(f.removed.length, 0);
});

test("invalid IDs, missing permissions, empty budgets and query failures do not upload", async () => {
  for (const options of [
    { ready: false },
    { empty: true },
    { budgetError: true },
    { lookupError: { code: "42501" } },
  ]) {
    const f = fixture(options);
    assert.ok((await f.send(input)).error);
    assert.equal(f.uploaded.length, 0);
  }
  const f = fixture();
  assert.ok((await f.send({ ...input, project_id: "invalid" })).error);
  assert.equal(f.uploaded.length, 0);
  await assert.rejects(
    fixture({ authError: true }).send(input),
    /unauthorized/,
  );
});

test("upload failure never creates a validation", async () => {
  const f = fixture({ uploadError: { message: "offline" } });
  assert.ok((await f.send(input)).error);
  assert.equal(f.rows.length, 0);
  assert.equal(f.removed.length, 0);
});

test("database failure or concurrent approval removes only the new upload", async () => {
  for (const options of [{ saveError: true }, { approvedConcurrently: true }]) {
    const f = fixture({
      ...options,
      rows: [
        {
          id: "pending",
          project_id: projectId,
          is_validated: false,
          file_url: "old.pdf",
        },
      ],
    });
    assert.ok((await f.send(input)).error);
    assert.deepEqual(f.removed, [f.uploaded[0].path]);
    assert.equal(f.rows[0].file_url, "old.pdf");
  }
});

test("PDF errors are reported without uploading or queuing", async () => {
  const f = fixture({ pdfError: true });
  assert.ok((await f.send(input)).error);
  assert.equal(f.rows.length, 0);
  assert.equal(f.uploaded.length, 0);
});
