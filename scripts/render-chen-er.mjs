import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs/diagrams");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const width = 3300,
  height = 2820;
const entityWidth = 280,
  entityHeight = 84;
const foreignKeys = {
  Reservation: ["customer_id", "table_id"],
  Orders: ["customer_id", "table_id", "staff_id"],
  MenuItem: ["category_id"],
  OrderItem: ["order_id", "item_id"],
  Payment: ["order_id"],
};
const names = {
  Customer: "CUSTOMER",
  Staff: "STAFF",
  RestaurantTable: "RESTAURANT TABLE",
  Category: "CATEGORY",
  MenuItem: "MENU ITEM",
  Reservation: "RESERVATION",
  Orders: "ORDER",
  OrderItem: "ORDER ITEM",
  Payment: "PAYMENT",
};
const locations = {
  Customer: [550, 470],
  Category: [1650, 470],
  MenuItem: [2750, 470],
  Reservation: [550, 1370],
  Orders: [1650, 1370],
  OrderItem: [2750, 1370],
  RestaurantTable: [550, 2270],
  Staff: [1650, 2270],
  Payment: [2750, 2270],
};
const scalar = new Set([
  "Int",
  "String",
  "Boolean",
  "Decimal",
  "DateTime",
  "Json",
]);
const derived = new Set(["subtotal", "total_amount", "starts_at", "ends_at"]);
const entities = [];
for (const [model, center] of Object.entries(locations)) {
  const body = schema.match(
    new RegExp("model " + model + " \\{([\\s\\S]*?)\\n\\}"),
  )[1];
  const fields = [];
  for (const line of body.split("\n")) {
    const match = line.trim().match(/^(\w+)\s+(\w+)(\?)?\s*(.*)$/);
    if (
      !match ||
      !scalar.has(match[2]) ||
      foreignKeys[model]?.includes(match[1])
    )
      continue;
    fields.push({
      name: match[1],
      key: match[4].includes("@id"),
      derived: derived.has(match[1]),
    });
  }
  entities.push({ model, center, fields });
}
const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const text = (x, y, value, cls = "") =>
  `<text x="${x}" y="${y}" class="${cls}">${xml(value)}</text>`;
const relationshipLines = [],
  attributeLines = [],
  shapes = [],
  captions = [];
const route = (points) => `M${points.map((p) => p.join(",")).join(" L")}`;
function line(points, collection, cls = "connector") {
  collection.push(`<path d="${route(points)}" class="${cls}"/>`);
}
const attributeOffsets = [
  [-340, -190],
  [-180, -290],
  [180, -290],
  [350, -190],
  [-340, 190],
  [-180, 290],
  [180, 290],
  [350, 190],
  [-360, 0],
];
for (const entity of entities) {
  const [cx, cy] = entity.center;
  const boxWidth = entity.model === "RestaurantTable" ? 340 : entityWidth;
  shapes.push(
    `<g class="entity" data-model="${entity.model}"><rect x="${cx - boxWidth / 2}" y="${cy - entityHeight / 2}" width="${boxWidth}" height="${entityHeight}"/>${text(cx, cy + 10, names[entity.model], "entity-name")}</g>`,
  );
  entity.fields.forEach((field, i) => {
    let offset = attributeOffsets[i];
    // Keep sparse entities balanced around their rectangle.
    if (entity.fields.length === 2)
      offset = [
        [-230, -190],
        [230, -190],
      ][i];
    const [ax, ay] = [cx + offset[0], cy + offset[1]];
    const rx = Math.max(128, field.name.length * 8.5 + 25),
      ry = 43;
    line(
      [
        [cx, cy],
        [ax, ay],
      ],
      attributeLines,
      "attribute-connector",
    );
    shapes.push(
      `<g class="attribute" data-owner="${entity.model}" data-name="${field.name}"><ellipse cx="${ax}" cy="${ay}" rx="${rx}" ry="${ry}" ${field.derived ? 'stroke-dasharray="10 7"' : ""}/>${text(ax, ay + 8, field.name, field.key ? "key" : "attribute-name")}</g>`,
    );
  });
}
function relationship(
  name,
  diamond,
  pointsA,
  pointsB,
  cardA,
  cardB,
  labelA,
  labelB,
) {
  const [x, y] = diamond,
    rx = 112,
    ry = 66;
  line(pointsA, relationshipLines);
  line(pointsB, relationshipLines);
  shapes.push(
    `<g class="relationship" data-name="${name}"><polygon points="${x - rx},${y} ${x},${y - ry} ${x + rx},${y} ${x},${y + ry}"/>${text(x, y + 8, name, "relationship-name")}</g>`,
  );
  captions.push(
    text(labelA[0], labelA[1], cardA, "cardinality"),
    text(labelB[0], labelB[1], cardB, "cardinality"),
  );
}
relationship(
  "BOOKS",
  [550, 920],
  [
    [550, 512],
    [550, 854],
  ],
  [
    [550, 986],
    [550, 1328],
  ],
  "(0,N)",
  "(1,1)",
  [610, 560],
  [610, 1290],
);
relationship(
  "FOR",
  [550, 1820],
  [
    [550, 1412],
    [550, 1754],
  ],
  [
    [550, 1886],
    [550, 2228],
  ],
  "(1,1)",
  "(0,N)",
  [610, 1460],
  [610, 2190],
);
relationship(
  "PLACES",
  [1100, 470],
  [
    [690, 470],
    [988, 470],
  ],
  [
    [1100, 536],
    [1100, 1348],
    [1510, 1348],
  ],
  "(0,N)",
  "(1,1)",
  [765, 445],
  [1440, 1320],
);
relationship(
  "SEATS",
  [1100, 2270],
  [
    [720, 2270],
    [988, 2270],
  ],
  [
    [1100, 2204],
    [1100, 1392],
    [1510, 1392],
  ],
  "(0,N)",
  "(0,1)",
  [765, 2245],
  [1440, 1433],
);
relationship(
  "HANDLES",
  [1650, 1820],
  [
    [1650, 1412],
    [1650, 1754],
  ],
  [
    [1650, 1886],
    [1650, 2228],
  ],
  "(0,1)",
  "(0,N)",
  [1720, 1460],
  [1720, 2190],
);
relationship(
  "CONTAINS",
  [2200, 1370],
  [
    [1790, 1370],
    [2088, 1370],
  ],
  [
    [2312, 1370],
    [2610, 1370],
  ],
  "(1,N)",
  "(1,1)",
  [1870, 1345],
  [2535, 1345],
);
relationship(
  "CLASSIFIES",
  [2200, 470],
  [
    [1790, 470],
    [2088, 470],
  ],
  [
    [2312, 470],
    [2610, 470],
  ],
  "(0,N)",
  "(1,1)",
  [1870, 445],
  [2535, 445],
);
relationship(
  "REFERS TO",
  [2750, 920],
  [
    [2750, 512],
    [2750, 854],
  ],
  [
    [2750, 986],
    [2750, 1328],
  ],
  "(0,N)",
  "(1,1)",
  [2820, 560],
  [2820, 1290],
);
relationship(
  "HAS",
  [2200, 2270],
  [
    [1790, 1392],
    [1850, 1392],
    [1850, 1700],
    [2200, 1700],
    [2200, 2204],
  ],
  [
    [2312, 2270],
    [2610, 2270],
  ],
  "(0,1)",
  "(1,1)",
  [1870, 1434],
  [2535, 2245],
);
const notes = [
  "RECTANGLE = entity     DIAMOND = relationship     OVAL = attribute     UNDERLINED = primary key     DASHED OVAL = derived attribute",
  "(min,max) labels describe participation per instance: (1,1) exactly one; (0,1) optional one; (0,N) optional many; (1,N) one or more.",
  "Foreign keys are represented by relationships. ORDER ITEM has its own primary key and resolves the ORDER–MENU ITEM many-to-many relationship.",
  "ORDER contains one or more lines at checkout; SQL temporarily permits an empty parent. Derived values are stored/generated or trigger-maintained.",
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Restaurant management system — standard Chen ER diagram</title><desc id="desc">Nine core entities with relationship diamonds, attribute ovals, underlined primary keys and min-max participation. Application support tables and MongoDB document schemas are documented separately.</desc><style>text{font-family:Arial,Helvetica,sans-serif;text-anchor:middle;fill:#172b24;font-size:25px}.diagram-title{font-size:42px;font-weight:700}.connector{stroke:#566a60;stroke-width:2.4;fill:none}.attribute-connector{stroke:#88988f;stroke-width:1.8;fill:none}.entity rect{fill:#e7efea;stroke:#294c3e;stroke-width:3}.entity-name{font-size:29px;font-weight:700}.attribute ellipse{fill:white;stroke:#526b5d;stroke-width:2}.key{text-decoration:underline;font-weight:700}.relationship polygon{fill:#f7f0dd;stroke:#796a44;stroke-width:2.5}.relationship-name{font-size:23px;font-weight:700}.cardinality{font-size:25px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:8;stroke-linejoin:round}.note{font-size:23px;text-anchor:start;fill:#465e51}</style><rect width="100%" height="100%" fill="white"/>${text(width / 2, 65, "RESTAURANT MANAGEMENT SYSTEM", "diagram-title")}${text(width / 2, 108, "Standard Chen ER notation · Core conceptual model", "")}${relationshipLines.join("")}${attributeLines.join("")}${shapes.join("")}${captions.join("")}${notes.map((n, i) => text(70, 2660 + i * 35, n, "note")).join("")}</svg>`;
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "restaurant-standard-chen-er.svg"), svg);
await sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(output, "restaurant-standard-chen-er.png"));
fs.writeFileSync(
  path.join(output, "restaurant-standard-chen-er.json"),
  JSON.stringify(
    { notation: "Chen with min-max participation", entities },
    null,
    2,
  ) + "\n",
);
console.log(
  `Rendered Chen ER diagram: ${entities.length} entities, ${entities.reduce((n, e) => n + e.fields.length, 0)} attributes, 9 relationships.`,
);
