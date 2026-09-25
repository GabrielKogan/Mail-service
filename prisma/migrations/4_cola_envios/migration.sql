BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mail_log] ADD [fecha_encolado] DATETIME2,
[fecha_intento] DATETIME2,
[intentos] INT NOT NULL CONSTRAINT [mail_log_intentos_df] DEFAULT 0;

-- CreateTable
CREATE TABLE [dbo].[mail_adjunto] (
    [id] INT NOT NULL IDENTITY(1,1),
    [mail_log_id] INT NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [mail_adjunto_orden_df] DEFAULT 0,
    [filename] NVARCHAR(200) NOT NULL,
    [content_type] VARCHAR(120) NOT NULL,
    [contenido] VARBINARY(max) NOT NULL,
    CONSTRAINT [mail_adjunto_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[mail_worker_heartbeat] (
    [worker] VARCHAR(100) NOT NULL,
    [iniciado] DATETIME2 NOT NULL,
    [ultimo_latido] DATETIME2 NOT NULL,
    CONSTRAINT [mail_worker_heartbeat_pkey] PRIMARY KEY CLUSTERED ([worker])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_adjunto_mail_log] ON [dbo].[mail_adjunto]([mail_log_id]);

-- AddForeignKey
ALTER TABLE [dbo].[mail_adjunto] ADD CONSTRAINT [FK_adjunto_mail_log] FOREIGN KEY ([mail_log_id]) REFERENCES [dbo].[mail_log]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
