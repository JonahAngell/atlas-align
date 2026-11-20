import test from "node:test";
import assert from "node:assert/strict";
import {
  CodeInputError,
  codeLines,
  detectLanguage,
  ingestCode,
} from "../src/ai/code/ingest.js";
import {
  findSecrets,
  maskCode,
  secretMessage,
  unmask,
} from "../src/ai/code/scan.js";

const notebook = (cells) =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells });

test("notebook outputs, counts and attachments never survive ingest", () => {
  const text = notebook([
    { cell_type: "markdown", source: ["# Cast list\n", "Weekly check"] },
    {
      cell_type: "code",
      execution_count: 7,
      source: ["import pandas as pd\n", "df = pd.read_excel('cast.xlsx')"],
      outputs: [
        {
          output_type: "execute_result",
          data: { "text/plain": "PERNR 12345678 Jane Doe" },
        },
      ],
      attachments: { "a.png": { "image/png": "SECRETPIXELS" } },
    },
    { cell_type: "raw", source: "ignored" },
  ]);
  const result = ingestCode([{ name: "cast.ipynb", text }]);
  const json = JSON.stringify(result);
  for (const leaked of [
    "Jane Doe",
    "12345678",
    "SECRETPIXELS",
    "execution_count",
    "ignored",
  ])
    assert.ok(!json.includes(leaked), leaked);
  assert.equal(result.files[0].language, "python");
  assert.deepEqual(
    result.files[0].cells.map((c) => [c.index, c.kind]),
    [
      [1, "markdown"],
      [2, "code"],
    ],
  );
  assert.deepEqual(
    [...codeLines(result)].map((l) => `${l.cell}:${l.line}`),
    ["2:1", "2:2"],
  );
});

test("language comes from the extension, a declared language, or the text", () => {
  assert.equal(
    ingestCode([{ name: "a.sql", text: "x" }]).files[0].language,
    "sql",
  );
  assert.equal(
    ingestCode([{ name: "", text: "x = 1", language: "python" }]).files[0]
      .language,
    "python",
  );
  assert.equal(
    detectLanguage(
      "SELECT a FROM dbo.t t\nLEFT JOIN u ON u.id = t.id\nWHERE a = 1",
    ),
    "sql",
  );
  assert.equal(
    detectLanguage(
      "import pandas as pd\ndf = pd.read_csv('x.csv')\ndf = df.drop_duplicates()",
    ),
    "python",
  );
  assert.throws(
    () => ingestCode([{ name: "notes.txt", text: "hello there" }]),
    /couldn't tell/,
  );
});

test("limits and bad input give a clear error", () => {
  assert.throws(() => ingestCode([]), CodeInputError);
  assert.throws(
    () =>
      ingestCode(
        Array.from({ length: 6 }, (_, i) => ({ name: `${i}.sql`, text: "x" })),
      ),
    /up to 5/,
  );
  assert.throws(
    () => ingestCode([{ name: "big.sql", text: "x".repeat(600 * 1024) }]),
    /500 KB/,
  );
  assert.throws(
    () => ingestCode([{ name: "a.xlsx", text: "x" }]),
    /isn't a file type/,
  );
  assert.throws(
    () => ingestCode([{ name: "a.ipynb", text: "{oops" }]),
    /valid notebook/,
  );
  assert.throws(
    () => ingestCode([{ name: "a.sql", text: "a\u0000b" }]),
    /binary/,
  );
});

const one = (name, text) => ingestCode([{ name, text }]);

test("credentials are found and named by line", () => {
  const blocked = [
    "conn = 'Driver={SQL Server};Server=hr01;Database=hr;UID=svc;PWD=Hunter22;'",
    'password = "s3cr3t!"',
    "headers = {'Authorization': 'Bearer abcdefghijklmnop'}",
    "engine = create_engine('mssql+pyodbc://svc:Hunter22@hr01/hr')",
    "-----BEGIN RSA PRIVATE KEY-----",
    "key = 'AKIAABCDEFGHIJKLMNOP'",
    "api_key: 'live-1234abcd'",
  ];
  blocked.forEach((line) => {
    const findings = findSecrets(one("a.py", `x = 1\n${line}`));
    assert.equal(findings.length, 1, line);
    assert.equal(findings[0].line, 2);
  });
  const message = secretMessage(
    findSecrets(one("load.py", "x\npassword = 'abcd1234'")),
  );
  assert.match(message, /load\.py, line 2 looks like a password/);
});

test("column names and placeholders are not credentials", () => {
  const allowed = [
    "SELECT password_last_changed, token_count FROM dbo.users",
    "password = os.environ['DB_PASSWORD']",
    'password = ""',
    "conn = f'PWD={password};'",
    "token = '<your token>'",
    "df['Password Reset'] = df['pwd_flag'] == 'Y'",
  ];
  allowed.forEach((line) =>
    assert.deepEqual(findSecrets(one("a.py", line)), [], line),
  );
});

test("PII-like values are masked reversibly and ordinary literals are kept", () => {
  const code = [
    "df = df[df['PERNR'] != 10234567]",
    "df = df[df['email'] == 'jane.doe@example.com']",
    "path = '/Users/jdoe/Desktop/cast.xlsx'",
    "df = df[df['phone'] == '555-123-4567']",
    "df = df[df['BTRTL'].isin(['2450', '3357'])]",
    "df = df[df['STAT2'] == 'Withdrawn']",
    "again = 10234567",
  ].join("\n");
  const { ingested, values, counts } = maskCode(one("a.py", code));
  const masked = ingested.files[0].cells[0].lines;
  assert.match(masked[0], /!= ⟨L1⟩/);
  assert.match(masked[1], /== '⟨L2⟩'/);
  assert.match(masked[2], /'⟨L3⟩\/Desktop\/cast\.xlsx'/);
  assert.match(masked[3], /'⟨L4⟩'/);
  assert.equal(masked[4], "df = df[df['BTRTL'].isin(['2450', '3357'])]");
  assert.equal(masked[5], "df = df[df['STAT2'] == 'Withdrawn']");
  assert.equal(masked[6], "again = ⟨L1⟩");
  assert.deepEqual(counts, { email: 1, home_path: 1, phone: 1, number: 2 });
  const restored = unmask(
    { params: { compareValue: "⟨L1⟩", list: ["⟨L2⟩", "kept"] }, n: 3 },
    values,
  );
  assert.deepEqual(restored, {
    params: {
      compareValue: "10234567",
      list: ["jane.doe@example.com", "kept"],
    },
    n: 3,
  });
});
