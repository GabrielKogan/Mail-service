BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mail_log] ADD [idempotency_key] NVARCHAR(200),
[request_hash] CHAR(64);

-- Índice filtrado (Prisma no los modela). Filtra también sistema_id porque en un
-- índice único SQL Server trata los NULL como iguales. Va por EXEC para que se
-- compile después de agregar las columnas.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [UX_mail_log_idempotencia]
  ON [dbo].[mail_log] ([sistema_id], [idempotency_key])
  WHERE [idempotency_key] IS NOT NULL AND [sistema_id] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
