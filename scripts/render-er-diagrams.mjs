import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs/diagrams");
fs.mkdirSync(out, { recursive: true });
const prisma = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const foreign = {
  MenuItem: ["category_id"],
  Reservation: ["customer_id", "table_id"],
  Orders: ["customer_id", "table_id", "staff_id"],
  OrderItem: ["order_id", "item_id"],
  Payment: ["order_id"],
  Session: ["customer_id", "staff_id"],
  Outbox: ["order_id"],
};
const scalar = new Set([
  "Int",
  "String",
  "Boolean",
  "Decimal",
  "DateTime",
  "Json",
]);
const models = {};
for (const [, name, body] of prisma.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
  const table = body.match(/@@map\("([^"]+)"\)/)[1];
  const fields = [];
  for (const line of body.split("\n")) {
    const m = line.trim().match(/^(\w+)\s+(\w+)(\?)?\s*(.*)$/);
    if (!m || !scalar.has(m[2])) continue;
    const [, field, kind, nullable, attrs] = m;
    const db = attrs.match(/@db\.(\w+)(?:\(([^)]+)\))?/);
    const types = {
      Int: "integer",
      String: "text",
      Boolean: "boolean",
      Decimal: "numeric",
      DateTime: "timestamp",
      Json: "jsonb",
    };
    let type = db
      ? db[1].toLowerCase() + (db[2] ? `(${db[2]})` : "")
      : types[kind];
    if (type.startsWith("decimal")) type = type.replace("decimal", "numeric");
    const keys = [];
    if (attrs.includes("@id")) keys.push("PK");
    if (foreign[name]?.includes(field)) keys.push("FK");
    if (attrs.includes("@unique")) keys.push("UQ");
    const generated = ["subtotal", "starts_at", "ends_at"].includes(field);
    fields.push({ name: field, type, keys, nullable: !!nullable, generated });
  }
  models[name] = { name: table, fields };
}
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const W = 440,
  ROW = 30,
  HEAD = 54;
const height = (e) => HEAD + ROW * e.fields.length + 12;
const text = (x, y, value, extra = "") =>
  `<text x="${x}" y="${y}" ${extra}>${esc(value)}</text>`;
const cards = [],
  edges = [],
  labels = [];
function card(model, x, y, mode = "sql", width = W) {
  const e = typeof model === "string" ? models[model] : model;
  const h = height(e),
    color =
      mode === "mongo" ? "#28685d" : mode === "anchor" ? "#64736d" : "#254c42";
  cards.push(
    `<g><rect x="${x}" y="${y}" width="${width}" height="${h}" rx="8" fill="white" stroke="#b8c9c0" stroke-width="2"/><path d="M${x + 8},${y} H${x + width - 8} Q${x + width},${y} ${x + width},${y + 8} V${y + HEAD} H${x} V${y + 8} Q${x},${y} ${x + 8},${y}" fill="${color}"/>${text(x + 18, y + 35, e.name, 'class="entity"')}${e.fields
      .map((f, i) => {
        const fy = y + HEAD + i * ROW + 23;
        return (
          (i % 2 === 0
            ? `<rect x="${x + 1}" y="${y + HEAD + i * ROW}" width="${width - 2}" height="${ROW}" fill="#f4f7f5"/>`
            : "") +
          text(x + 14, fy, f.keys.join(","), 'class="key"') +
          text(
            x + 82,
            fy,
            f.name + (f.nullable ? " ?" : "") + (f.generated ? " *" : ""),
            'class="field"',
          ) +
          text(x + width - 14, fy, f.type, 'class="dtype" text-anchor="end"')
        );
      })
      .join("")}</g>`,
  );
  return { x, y, w: width, h, model: e };
}
function endpoint(p, next, kind) {
  const dx = next[0] - p[0],
    dy = next[1] - p[1],
    len = Math.hypot(dx, dy),
    ux = dx / len,
    uy = dy / len;
  const point = (d, n = 0) => [p[0] + ux * d - uy * n, p[1] + uy * d + ux * n];
  const line = (a, b) =>
    `<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" fill="none" stroke="#52685e" stroke-width="2"/>`;
  let s = "";
  if (kind.endsWith("*"))
    for (const n of [-9, 0, 9]) s += line(point(3, n), point(19));
  else s += line(point(8, -9), point(8, 9));
  if (kind.startsWith("0")) {
    const c = point(28);
    s += `<circle cx="${c[0]}" cy="${c[1]}" r="6" fill="white" stroke="#52685e" stroke-width="2"/>`;
  } else s += line(point(27, -9), point(27, 9));
  return s;
}
function edge(points, start, end, label, lx, ly, dashed = false) {
  edges.push(
    `<path d="M${points.map((p) => p.join(",")).join(" L")}" fill="none" stroke="#52685e" stroke-width="2" ${dashed ? 'stroke-dasharray="8 6"' : ""}/>` +
      endpoint(points[0], points[1], start) +
      endpoint(points.at(-1), points.at(-2), end),
  );
  labels.push(text(lx, ly, label, 'class="relation" text-anchor="middle"'));
}
function reset() {
  cards.length = 0;
  edges.length = 0;
  labels.length = 0;
}
async function save(name, title, subtitle, width, h, notes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle + " " + notes.join(" "))}</desc><style>text{font-family:Arial,Helvetica,sans-serif;fill:#253d32;font-size:20px}.entity{fill:white;font-size:24px;font-weight:700}.key{font-size:15px;font-weight:700;fill:#7b5d28}.field{font-size:18px}.dtype{font-size:15px;fill:#66776d}.relation{font-size:19px;paint-order:stroke;stroke:#fbfcfa;stroke-width:8px;stroke-linejoin:round}.subtitle{fill:#66776d;font-size:21px}.note{fill:#53685c;font-size:19px}</style><rect width="100%" height="100%" fill="#fbfcfa"/>${text(60, 65, title, 'style="font-size:34px;font-weight:700"')}${text(60, 105, subtitle, 'class="subtitle"')}${edges.join("")}${cards.join("")}${labels.join("")}${notes.map((n, i) => text(60, h - 90 + i * 28, n, 'class="note"')).join("")}</svg>`;
  fs.writeFileSync(path.join(out, name + ".svg"), svg);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(out, name + ".png"));
}

reset();
const c = card("Customer", 60, 180),
  r = card("Reservation", 60, 630),
  t = card("RestaurantTable", 60, 1200);
const o = card("Orders", 780, 620);
card("Staff", 780, 1200);
card("Category", 780, 180);
const m = card("MenuItem", 1500, 180),
  oi = card("OrderItem", 1500, 650);
card("Payment", 1500, 1200);
edge(
  [
    [280, c.y + c.h],
    [280, r.y],
  ],
  "1",
  "0..*",
  "books",
  345,
  535,
);
edge(
  [
    [280, t.y],
    [280, r.y + r.h],
  ],
  "1",
  "0..*",
  "receives",
  350,
  1115,
);
edge(
  [
    [500, 300],
    [640, 300],
    [640, 700],
    [780, 700],
  ],
  "1",
  "0..*",
  "places",
  645,
  480,
);
edge(
  [
    [500, 1280],
    [620, 1280],
    [620, 870],
    [780, 870],
  ],
  "0..1",
  "0..*",
  "seats (optional)",
  625,
  1030,
);
edge(
  [
    [1000, 1200],
    [1000, o.y + o.h],
  ],
  "0..1",
  "0..*",
  "handles (optional)",
  1100,
  1080,
);
edge(
  [
    [1220, 240],
    [1500, 240],
  ],
  "1",
  "0..*",
  "classifies",
  1360,
  219,
);
edge(
  [
    [1220, 730],
    [1500, 730],
  ],
  "1",
  "0..*",
  "contains",
  1360,
  708,
);
edge(
  [
    [1720, m.y + m.h],
    [1720, oi.y],
  ],
  "1",
  "0..*",
  "appears in",
  1815,
  575,
);
edge(
  [
    [1220, 890],
    [1360, 890],
    [1360, 1290],
    [1500, 1290],
  ],
  "1",
  "0..1",
  "has payment",
  1360,
  1090,
);
await save(
  "restaurant-core-er",
  "Restaurant management — core ER schema",
  "PostgreSQL · 9 entities · Crow’s-foot notation · Physical schema",
  2000,
  1630,
  [
    "PK primary key   FK foreign key   UQ unique   ? nullable   * generated column",
    "Endpoint symbols: bar = one, circle = zero, crow’s foot = many. SQL permits 0..many order lines; checkout requires at least one.",
    "Menu price = Regular. Large = 1.5 × Regular; order_item.unit_price preserves the charged price. Payment is optional and unique per order.",
  ],
);

reset();
const anchor = (n) => ({
  name: models[n].name + " (core)",
  fields: models[n].fields.filter((f) => f.keys.includes("PK")),
});
card(anchor("Customer"), 60, 220, "anchor");
card(anchor("Staff"), 60, 530, "anchor");
card("Session", 760, 300);
card(anchor("Orders"), 1460, 220, "anchor");
card("Outbox", 1460, 580);
card("LoginAttempt", 760, 780);
edge(
  [
    [500, 260],
    [620, 260],
    [620, 390],
    [760, 390],
  ],
  "0..1",
  "0..*",
  "customer sessions",
  640,
  230,
);
edge(
  [
    [500, 570],
    [650, 570],
    [650, 455],
    [760, 455],
  ],
  "0..1",
  "0..*",
  "staff sessions",
  640,
  605,
);
edge(
  [
    [1680, 316],
    [1680, 580],
  ],
  "1",
  "0..1",
  "queues instructions",
  1810,
  450,
);
await save(
  "restaurant-support-er",
  "Restaurant management — support schema",
  "PostgreSQL · Authentication, synchronization and login throttling",
  1960,
  1130,
  [
    "PK primary key   FK foreign key   UQ unique   ? nullable. Grey entities repeat core keys for context.",
    "Session CHECK: exactly one of customer_id and staff_id is non-null. login_attempt.key is a hashed identity, not a foreign key.",
    "outbox.order_id is a real SQL foreign key with UNIQUE, even though Prisma does not declare a relation field for it.",
  ],
);

reset();
const f = (name, type, keys = [], nullable = false) => ({
  name,
  type,
  keys,
  nullable,
});
const reviews = {
  name: "reviews",
  fields: [
    f("_id", "ObjectId", ["PK"]),
    f("customer_id", "number", ["REF"]),
    f("order_id", "number", ["REF", "UQ"]),
    f("rating", "number 1–5"),
    f("comment", "string"),
    f("items_reviewed[]", "embedded array"),
    f("  item_id", "number", ["REF"]),
    f("  rating", "number 1–5"),
    f("created_at", "date"),
    f("updated_at", "date"),
  ],
};
const prefs = {
  name: "customer_preferences",
  fields: [
    f("_id", "ObjectId", ["PK"]),
    f("customer_id", "number", ["REF", "UQ"]),
    f("dietary_preferences", "string[]"),
    f("preferred_cuisines", "string[]"),
    f("spice_level", "enum"),
    f("allergens", "string[]"),
  ],
};
const custom = {
  name: "order_customizations",
  fields: [
    f("_id", "ObjectId", ["PK"]),
    f("order_id", "number", ["REF"]),
    f("order_item_id", "number", ["REF", "UQ"]),
    f("item_id", "number", ["REF"]),
    f("customizations", "embedded object"),
    f("  size", "Regular | Large"),
    f("  remove", "string[]"),
    f("  add", "string[]"),
    f("  special_instruction", "string"),
  ],
};
function refAnchor(n, x, y) {
  return card(anchor(n), x, y, "anchor");
}
card(reviews, 880, 180, "mongo", 570);
refAnchor("Customer", 60, 180);
refAnchor("Orders", 60, 365);
refAnchor("MenuItem", 60, 550);
edge(
  [
    [500, 230],
    [650, 230],
    [650, 260],
    [880, 260],
  ],
  "1",
  "0..*",
  "writes",
  680,
  209,
  true,
);
edge(
  [
    [500, 415],
    [720, 415],
    [720, 330],
    [880, 330],
  ],
  "1",
  "0..1",
  "review per order",
  690,
  445,
  true,
);
edge(
  [
    [500, 600],
    [780, 600],
    [780, 420],
    [880, 420],
  ],
  "0..*",
  "0..*",
  "rates via items_reviewed[]",
  650,
  632,
  true,
);
card(prefs, 880, 780, "mongo", 570);
refAnchor("Customer", 60, 820);
edge(
  [
    [500, 870],
    [880, 870],
  ],
  "1",
  "0..1",
  "has preferences",
  690,
  849,
  true,
);
card(custom, 880, 1150, "mongo", 570);
refAnchor("Orders", 60, 1120);
refAnchor("OrderItem", 60, 1310);
refAnchor("MenuItem", 60, 1500);
edge(
  [
    [500, 1170],
    [650, 1170],
    [650, 1220],
    [880, 1220],
  ],
  "1",
  "0..*",
  "order_id",
  690,
  1147,
  true,
);
edge(
  [
    [500, 1360],
    [720, 1360],
    [720, 1300],
    [880, 1300],
  ],
  "1",
  "0..1",
  "order_item_id",
  680,
  1390,
  true,
);
edge(
  [
    [500, 1550],
    [780, 1550],
    [780, 1370],
    [880, 1370],
  ],
  "1",
  "0..*",
  "item_id",
  650,
  1582,
  true,
);
await save(
  "restaurant-mongodb-er",
  "Restaurant management — MongoDB document schema",
  "3 collections · Dashed links are application-validated SQL references, not database foreign keys",
  1530,
  1760,
  [
    "REF logical SQL reference   UQ unique index   PK MongoDB _id. Grey entities repeat PostgreSQL keys for context.",
    "Cardinality is the application relationship; MongoDB cannot enforce a cross-database foreign key. Nested rows are embedded fields.",
    "Review writes require order ownership and completed payment. A customization document may be pending while the SQL outbox synchronizes.",
  ],
);

function mermaid(names, relations) {
  return (
    "erDiagram\n" +
    relations.map((r) => "  " + r).join("\n") +
    "\n" +
    names
      .map((n) => {
        const e = models[n];
        return (
          "  " +
          e.name.toUpperCase() +
          " {\n" +
          e.fields
            .map((f) => {
              const type = f.type.startsWith("numeric")
                ? "decimal"
                : f.type.startsWith("varchar")
                  ? "string"
                  : f.type.startsWith("timestamp")
                    ? "timestamp"
                    : f.type;
              const keys = f.keys.map((k) => (k === "UQ" ? "UK" : k)).join(",");
              const note = [
                f.nullable ? "nullable" : "",
                f.generated ? "generated" : "",
              ]
                .filter(Boolean)
                .join("; ");
              return `    ${type} ${f.name}${keys ? " " + keys : ""}${note ? ' "' + note + '"' : ""}`;
            })
            .join("\n") +
          "\n  }"
        );
      })
      .join("\n") +
    "\n"
  );
}
fs.writeFileSync(
  path.join(out, "restaurant-core-er.mmd"),
  mermaid(
    [
      "Customer",
      "Staff",
      "RestaurantTable",
      "Category",
      "MenuItem",
      "Reservation",
      "Orders",
      "OrderItem",
      "Payment",
    ],
    [
      "CUSTOMER ||--o{ RESERVATION : books",
      "RESTAURANT_TABLE ||--o{ RESERVATION : receives",
      "CUSTOMER ||--o{ ORDERS : places",
      "RESTAURANT_TABLE o|--o{ ORDERS : seats",
      "STAFF o|--o{ ORDERS : handles",
      "CATEGORY ||--o{ MENU_ITEM : classifies",
      "ORDERS ||--o{ ORDER_ITEM : contains",
      "MENU_ITEM ||--o{ ORDER_ITEM : appears_in",
      "ORDERS ||--o| PAYMENT : has",
    ],
  ),
);
fs.writeFileSync(
  path.join(out, "restaurant-support-er.mmd"),
  mermaid(
    ["Session", "Outbox", "LoginAttempt"],
    [
      "CUSTOMER o|--o{ SESSION : authenticates",
      "STAFF o|--o{ SESSION : authenticates",
      "ORDERS ||--o| OUTBOX : queues_instructions",
    ],
  ),
);
fs.writeFileSync(
  path.join(out, "restaurant-mongodb-er.mmd"),
  `erDiagram
  CUSTOMER ||..o{ REVIEWS : writes
  ORDERS ||..o| REVIEWS : has_review
  MENU_ITEM }o..o{ REVIEWS : rated_in_embedded_array
  CUSTOMER ||..o| CUSTOMER_PREFERENCES : has
  ORDERS ||..o{ ORDER_CUSTOMIZATIONS : customizes
  ORDER_ITEM ||..o| ORDER_CUSTOMIZATIONS : has
  MENU_ITEM ||..o{ ORDER_CUSTOMIZATIONS : refers_to
${[reviews, prefs, custom].map((e) => "  " + e.name.toUpperCase() + " {\n" + e.fields.map((f) => "    " + (f.type === "ObjectId" ? "ObjectId" : f.type.startsWith("number") ? "number" : f.type === "date" ? "date" : f.type.startsWith("embedded") ? "json" : f.type.endsWith("[]") ? "string[]" : "string") + " " + (f.name.startsWith(" ") ? (e.name === "reviews" ? "items_reviewed_" : "customizations_") : "") + f.name.trim().replace("[]", "") + (f.keys.includes("PK") ? " PK" : f.keys.includes("UQ") ? " UK" : "") + (f.keys.includes("REF") ? ' "Logical SQL reference"' : "")).join("\n") + "\n  }").join("\n")}
`,
);
console.log("Rendered 3 SVG diagrams, 3 PNG diagrams and 3 Mermaid sources.");
