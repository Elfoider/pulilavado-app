import { createHash, timingSafeEqual } from "node:crypto";
import { CashCorrectionError, parseCashCorrection } from "@/lib/operations/cash-correction";
import { saveCashCorrection } from "@/lib/server/cash-correction-store";

export const runtime = "nodejs";
const reply = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function POST(request: Request) {
  const secret = process.env.CASH_CORRECTION_SECRET;
  if (!secret || !/^[0-9a-f]{48}$/.test(secret)) return reply(503, { message: "La corrección de Caja todavía no está habilitada." });
  const header = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [0-9a-f]{48}$/.test(header) || !timingSafeEqual(digest(header.slice(7)), digest(secret))) return reply(403, { message: "Clave de Caja incorrecta." });
  let input: unknown;
  try {
    if (Number(request.headers.get("Content-Length")) > 4096) return reply(413, { message: "Solicitud demasiado larga." });
    const body = await request.text();
    if (body.length > 4096) return reply(413, { message: "Solicitud demasiado larga." });
    input = JSON.parse(body);
  } catch {
    return reply(400, { message: "Solicitud inválida." });
  }
  try {
    return reply(200, await saveCashCorrection(parseCashCorrection(input)));
  } catch (error) {
    if (error instanceof CashCorrectionError) return reply(409, { message: error.message });
    return reply(500, { message: "No se pudo confirmar la corrección. Consulte el historial antes de volver a intentarlo." });
  }
}
