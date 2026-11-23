import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const positiveId = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id: positiveId });

export const createIncidentSchema = z.object({
  titulo: trimmed(5, 120),
  descripcion: trimmed(10, 2000),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']),
  responsableId: positiveId,
  servicioIds: z.array(positiveId).min(1, 'Selecciona al menos un servicio afectado').max(50),
  esSimulacro: z.boolean().optional().default(false),
});

export const listIncidentsQuerySchema = z.object({
  estado: z.enum(['abierto', 'cerrado']).optional(),
});

export const advanceSchema = z.object({
  leccionesAprendidas: z.string().trim().max(4000).optional(),
});

export const decisionSchema = z.object({
  codigo: z.enum(['D1', 'D2', 'D3', 'D4']).optional(),
  respuesta: z.boolean(),
  justificacion: trimmed(5, 1000),
});

export const createActionSchema = z.object({
  descripcion: trimmed(5, 500),
  responsableId: positiveId,
});

export const updateActionSchema = z.object({
  estado: z.enum(['en_progreso', 'completada', 'fallida']),
  resultado: z.string().trim().max(1000).optional(),
});

export const serviceStatusSchema = z.object({
  estado: z.enum(['operativo', 'afectado', 'en_recuperacion']),
  nota: z.string().trim().max(300).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(120),
  clave: z.string().min(1, 'Ingresa la contraseña').max(128),
});

export const mfaLoginSchema = z.object({
  desafio: z.string().min(20).max(1000),
  codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
});

export const mfaCodeSchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
});

export const disableMfaSchema = z.object({
  clave: z.string().min(1).max(128),
  codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
});

export const changePasswordSchema = z.object({
  actual: z.string().min(1).max(128),
  nueva: z.string().min(1).max(128),
});

export const uploadEvidenceSchema = z.object({
  descripcion: z.string().trim().max(500).optional().transform((v) => v || undefined),
  accionId: z.coerce.number().int().positive().optional(),
});

export const evidenceLibraryQuerySchema = z.object({
  categoria: z.enum(['imagen', 'documento', 'video', 'audio', 'registro']).optional(),
  incidenteId: z.coerce.number().int().positive().optional(),
  incluirAnuladas: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

export const voidEvidenceSchema = z.object({
  motivo: z.string().trim().min(10, 'Explica el motivo en al menos 10 caracteres').max(300),
});

export const contentQuerySchema = z.object({
  descargar: z.enum(['1', '0']).optional(),
});

export const isolateAssetSchema = z.object({
  motivo: z.string().trim().min(10, 'Explica el motivo en al menos 10 caracteres').max(300),
});

export const releaseAssetSchema = z.object({
  nota: z.string().trim().max(300).optional().transform((v) => v || undefined),
});

export const startRoundSchema = z
  .object({
    alcance: z.enum(['aislados', 'linea', 'servicio']),
    valor: z.string().trim().toUpperCase().max(16).optional().transform((v) => v || undefined),
    incidenteId: positiveId.optional(),
  })
  .superRefine((data, ctx) => {
    const formats = { linea: /^(L[1-4]|LAT)$/, servicio: /^(TI|OT)-[A-Z0-9]+$/ };
    if (data.alcance === 'aislados') {
      if (data.valor) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'La ronda de aislados no lleva valor' });
      return;
    }
    if (!data.valor || !formats[data.alcance].test(data.valor)) {
      ctx.addIssue({ code: 'custom', path: ['valor'], message: data.alcance === 'linea' ? 'Indica la línea: L1, L2, L3, L4 o LAT' : 'Indica el servicio, por ejemplo TI-VPN' });
    }
  });

export const roundItemParamsSchema = z.object({ id: positiveId, activoId: positiveId });

export const recordCheckSchema = z
  .object({
    resultado: z.enum(['ok', 'observado', 'falla']),
    nota: z.string().trim().max(500).optional().transform((v) => v || undefined),
    confirmados: z.array(z.number().int().min(0).max(19)).max(20).optional().default([]),
  })
  .refine((data) => data.resultado === 'ok' || (data.nota?.length ?? 0) >= 5, {
    path: ['nota'],
    message: 'Describe lo observado o la falla (mínimo 5 caracteres)',
  });

export const ledgerQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).optional().default(15),
});

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      campo: issue.path.join('.') || '(cuerpo)',
      mensaje: issue.message,
    }));
    throw new ValidationError('Datos inválidos', details);
  }
  return result.data;
}
