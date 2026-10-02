BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mail_log] ADD [plantilla_version] INT,
[texto] NVARCHAR(max),
[tipo] VARCHAR(60);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_log_tipo] ON [dbo].[mail_log]([tipo]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
