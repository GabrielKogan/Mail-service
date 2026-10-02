BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mail_log] ADD [sistema_id] INT;

-- CreateTable
CREATE TABLE [dbo].[mail_sistema] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(120) NOT NULL,
    [origen] NVARCHAR(120) NOT NULL,
    [clasificacion] VARCHAR(20) NOT NULL,
    [permite_raw_html] BIT NOT NULL CONSTRAINT [mail_sistema_permite_raw_html_df] DEFAULT 1,
    [cors_origins] NVARCHAR(1000),
    [activo] BIT NOT NULL CONSTRAINT [mail_sistema_activo_df] DEFAULT 1,
    [fecha_alta] DATETIME2 NOT NULL CONSTRAINT [mail_sistema_fecha_alta_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [mail_sistema_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_mail_sistema_origen] UNIQUE NONCLUSTERED ([origen])
);

-- CreateTable
CREATE TABLE [dbo].[mail_api_key] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sistema_id] INT NOT NULL,
    [prefijo] VARCHAR(16) NOT NULL,
    [hash] CHAR(64) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [mail_api_key_activo_df] DEFAULT 1,
    [fecha_alta] DATETIME2 NOT NULL CONSTRAINT [mail_api_key_fecha_alta_df] DEFAULT CURRENT_TIMESTAMP,
    [ultimo_uso] DATETIME2,
    [revocada_en] DATETIME2,
    CONSTRAINT [mail_api_key_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_mail_api_key_prefijo] UNIQUE NONCLUSTERED ([prefijo])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_api_key_sistema] ON [dbo].[mail_api_key]([sistema_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_log_sistema] ON [dbo].[mail_log]([sistema_id]);

-- AddForeignKey
ALTER TABLE [dbo].[mail_log] ADD CONSTRAINT [FK_mail_log_sistema] FOREIGN KEY ([sistema_id]) REFERENCES [dbo].[mail_sistema]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mail_api_key] ADD CONSTRAINT [FK_api_key_sistema] FOREIGN KEY ([sistema_id]) REFERENCES [dbo].[mail_sistema]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Seed: sistema usado por los envíos de prueba desde la interfaz (/enviar).
INSERT INTO [dbo].[mail_sistema] ([nombre], [origen], [clasificacion])
VALUES (N'Panel interno', N'panel', 'transactional');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
