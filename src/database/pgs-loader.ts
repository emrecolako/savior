import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { PgsScoringFile } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_PGS_DIR = resolve(__dirname, "../../data/pgs");

// ─── Zod schemas ────────────────────────────────────────────────

const validBase = z.enum(["A", "T", "C", "G"]);

const PgsVariantWeightSchema = z.object({
  rsid: z.string().startsWith("rs"),
  effectAllele: validBase,
  otherAllele: validBase,
  effectWeight: z.number().finite(),
  chr: z.string(),
  pos: z.number().int().nonnegative(),
});

const PopulationParamsSchema = z.object({
  source: z.string().min(1),
  ancestry: z.string().min(1),
  mean: z.number().finite(),
  sd: z.number().positive(),
  sampleSize: z.number().int().positive(),
});

const PgsScoringFileSchema = z.object({
  pgsId: z.string().min(1),
  traitName: z.string().min(1),
  traitId: z.string().min(1),
  publicationPmid: z.string().optional(),
  genomeBuild: z.string().min(1),
  totalVariantsOriginal: z.number().int().positive(),
  totalVariantsCurated: z.number().int().positive(),
  populationParams: PopulationParamsSchema,
  variants: z.array(PgsVariantWeightSchema).min(1),
});

const PgsIndexSchema = z.object({
  version: z.string(),
  lastUpdated: z.string(),
  traits: z.array(
    z.object({
      traitId: z.string(),
      traitName: z.string(),
      fileName: z.string(),
      pgsId: z.string(),
    }),
  ),
});

type PgsIndex = z.infer<typeof PgsIndexSchema>;

// ─── Loaders ────────────────────────────────────────────────────

export function loadPgsIndex(dataPath?: string): PgsIndex {
  const dir = dataPath ?? DEFAULT_PGS_DIR;
  const indexPath = join(dir, "index.json");
  const raw = JSON.parse(readFileSync(indexPath, "utf-8"));
  return PgsIndexSchema.parse(raw);
}

export function loadPgsScoringFile(traitId: string, dataPath?: string): PgsScoringFile {
  const dir = dataPath ?? DEFAULT_PGS_DIR;
  const index = loadPgsIndex(dir);
  const entry = index.traits.find((t) => t.traitId === traitId);
  if (!entry) {
    throw new Error(`PGS trait '${traitId}' not found in index. Available: ${index.traits.map((t) => t.traitId).join(", ")}`);
  }

  const filePath = join(dir, entry.fileName);
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  return PgsScoringFileSchema.parse(raw);
}

export function loadAllPgsScoringFiles(traits?: string[], dataPath?: string): PgsScoringFile[] {
  const index = loadPgsIndex(dataPath);

  const traitIds = traits ?? index.traits.map((t) => t.traitId);
  return traitIds.map((id) => loadPgsScoringFile(id, dataPath));
}
