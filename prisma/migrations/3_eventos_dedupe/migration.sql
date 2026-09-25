BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mail_log_eventos] ADD [origen_evento_id] VARCHAR(100);

-- Índice filtrado (Prisma no los modela): un evento de SNS se registra una sola vez,
-- aunque llegue por el webhook y por la cola. Va por EXEC para que se compile
-- después de agregar la columna.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [UX_eventos_origen]
  ON [dbo].[mail_log_eventos] ([origen_evento_id])
  WHERE [origen_evento_id] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
