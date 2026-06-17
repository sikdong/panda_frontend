import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    oldHar: "",
    newJson: "",
    oldEndpoint: "/api/v1/listings"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--old-har") args.oldHar = argv[index + 1] ?? "";
    if (token === "--new-json") args.newJson = argv[index + 1] ?? "";
    if (token === "--old-endpoint") args.oldEndpoint = argv[index + 1] ?? args.oldEndpoint;
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/compare-upload-benchmark.mjs --old-har <old.har> --new-json <new.json> [--old-endpoint /api/v1/listings]",
    "",
    "Example:",
    "  node scripts/compare-upload-benchmark.mjs --old-har C:\\\\pandaworkspace\\\\old.har --new-json C:\\\\pandaworkspace\\\\new.json"
  ].join("\n");
}

function toMsList(records, key) {
  return records
    .map((item) => Number(item?.[key] ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
}

function quantile(sortedNumbers, ratio) {
  if (sortedNumbers.length === 0) return 0;
  const index = Math.min(
    sortedNumbers.length - 1,
    Math.max(0, Math.floor((sortedNumbers.length - 1) * ratio))
  );
  return sortedNumbers[index];
}

function average(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function summarizeMs(records, key) {
  const values = toMsList(records, key);
  return {
    count: values.length,
    avgMs: Math.round(average(values)),
    p50Ms: Math.round(quantile(values, 0.5)),
    p95Ms: Math.round(quantile(values, 0.95))
  };
}

function parseJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function isSuccessStatus(status) {
  const code = Number(status ?? 0);
  return code >= 200 && code < 300;
}

function isMultipartRequest(entry) {
  const mimeType = String(entry?.request?.postData?.mimeType ?? "").toLowerCase();
  if (mimeType.includes("multipart/form-data")) return true;
  const headers = Array.isArray(entry?.request?.headers) ? entry.request.headers : [];
  const contentType = headers.find((h) => String(h?.name ?? "").toLowerCase() === "content-type");
  return String(contentType?.value ?? "").toLowerCase().includes("multipart/form-data");
}

function parseOldHarEntries(harJson, oldEndpoint) {
  const entries = Array.isArray(harJson?.log?.entries) ? harJson.log.entries : [];
  const endpointMatched = entries.filter((entry) => {
    const method = String(entry?.request?.method ?? "").toUpperCase();
    const url = String(entry?.request?.url ?? "");
    return (method === "POST" || method === "PATCH") && url.includes(oldEndpoint);
  });

  const multipartMatched = endpointMatched.filter((entry) => isMultipartRequest(entry));
  const target = multipartMatched.length > 0 ? multipartMatched : endpointMatched;

  return target.map((entry) => ({
    url: String(entry?.request?.url ?? ""),
    method: String(entry?.request?.method ?? "").toUpperCase(),
    status: Number(entry?.response?.status ?? 0),
    timeMs: Number(entry?.time ?? 0),
    success: isSuccessStatus(entry?.response?.status)
  }));
}

function parseNewBenchmarks(jsonData) {
  const rows = Array.isArray(jsonData) ? jsonData : [];
  return rows
    .filter((row) => Number(row?.fileCount ?? 0) > 0)
    .map((row) => ({
      success: Boolean(row?.success),
      totalMs: Number(row?.totalMs ?? 0),
      uploadMs: Number(row?.uploadMs ?? 0),
      prepareMs: Number(row?.prepareMs ?? 0),
      presignMs: Number(row?.presignMs ?? 0)
    }));
}

function failRate(records, key = "success") {
  if (records.length === 0) return 0;
  const failed = records.filter((row) => !row[key]).length;
  return (failed / records.length) * 100;
}

function improvementPercent(oldValue, newValue) {
  if (!Number.isFinite(oldValue) || oldValue <= 0) return 0;
  return ((oldValue - newValue) / oldValue) * 100;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.oldHar || !args.newJson) {
    console.error(usage());
    process.exit(1);
  }

  const oldHarPath = path.resolve(args.oldHar);
  const newJsonPath = path.resolve(args.newJson);
  if (!fs.existsSync(oldHarPath)) {
    console.error(`old HAR not found: ${oldHarPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(newJsonPath)) {
    console.error(`new JSON not found: ${newJsonPath}`);
    process.exit(1);
  }

  const oldHarJson = parseJsonFile(oldHarPath);
  const newBenchJson = parseJsonFile(newJsonPath);

  const oldRows = parseOldHarEntries(oldHarJson, args.oldEndpoint);
  const newRows = parseNewBenchmarks(newBenchJson);

  if (oldRows.length === 0) {
    console.error(`No old upload requests matched. endpoint=${args.oldEndpoint}`);
    process.exit(1);
  }
  if (newRows.length === 0) {
    console.error("No new benchmark rows matched. Check new JSON format.");
    process.exit(1);
  }

  const oldTotal = summarizeMs(oldRows, "timeMs");
  const newTotal = summarizeMs(newRows, "totalMs");
  const newUpload = summarizeMs(newRows, "uploadMs");
  const newPrepare = summarizeMs(newRows, "prepareMs");
  const newPresign = summarizeMs(newRows, "presignMs");

  const oldFailRate = failRate(oldRows);
  const newFailRate = failRate(newRows);

  const summaryTable = [
    {
      metric: "total",
      oldP50Ms: oldTotal.p50Ms,
      oldP95Ms: oldTotal.p95Ms,
      newP50Ms: newTotal.p50Ms,
      newP95Ms: newTotal.p95Ms,
      p50ImprovePct: Number(improvementPercent(oldTotal.p50Ms, newTotal.p50Ms).toFixed(2)),
      p95ImprovePct: Number(improvementPercent(oldTotal.p95Ms, newTotal.p95Ms).toFixed(2))
    },
    {
      metric: "failRate",
      oldPct: Number(oldFailRate.toFixed(2)),
      newPct: Number(newFailRate.toFixed(2)),
      diffPctPoint: Number((oldFailRate - newFailRate).toFixed(2))
    }
  ];

  console.log("=== Input Summary ===");
  console.table([
    {
      oldHarPath,
      oldMatchedRequests: oldRows.length,
      newJsonPath,
      newMatchedRows: newRows.length,
      oldEndpoint: args.oldEndpoint
    }
  ]);

  console.log("=== Old(Server Upload) ===");
  console.table([oldTotal]);

  console.log("=== New(Client Upload) ===");
  console.table([
    { stage: "totalMs", ...newTotal },
    { stage: "uploadMs", ...newUpload },
    { stage: "prepareMs", ...newPrepare },
    { stage: "presignMs", ...newPresign }
  ]);

  console.log("=== Compare ===");
  console.table(summaryTable);
}

main();
