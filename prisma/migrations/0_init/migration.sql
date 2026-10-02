BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mail_log] (
    [id] INT NOT NULL IDENTITY(1,1),
    [message_id] NVARCHAR(1000) NOT NULL,
    [destinatario] NVARCHAR(1000) NOT NULL,
    [nombre_dest] NVARCHAR(1000),
    [remitente] NVARCHAR(1000) NOT NULL CONSTRAINT [mail_log_remitente_df] DEFAULT 'registro@lujandecuyo.gob.ar',
    [asunto] NVARCHAR(1000) NOT NULL,
    [cuerpo] NVARCHAR(max),
    [estado_actual] NVARCHAR(1000) NOT NULL CONSTRAINT [mail_log_estado_actual_df] DEFAULT 'enviado',
    [origen] NVARCHAR(1000),
    [fecha_envio] DATETIME2 NOT NULL CONSTRAINT [mail_log_fecha_envio_df] DEFAULT CURRENT_TIMESTAMP,
    [error_detalle] NVARCHAR(max),
    CONSTRAINT [mail_log_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [mail_log_message_id_key] UNIQUE NONCLUSTERED ([message_id])
);

-- CreateTable
CREATE TABLE [dbo].[mail_supresion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [email] NVARCHAR(320) NOT NULL,
    [origen] NVARCHAR(120) NOT NULL CONSTRAINT [mail_supresion_origen_df] DEFAULT '*',
    [motivo] VARCHAR(20) NOT NULL,
    [mail_log_id] INT,
    [activo] BIT NOT NULL CONSTRAINT [mail_supresion_activo_df] DEFAULT 1,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [mail_supresion_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [mail_supresion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_mail_supresion_email_origen] UNIQUE NONCLUSTERED ([email],[origen])
);

-- CreateTable
CREATE TABLE [dbo].[mail_log_eventos] (
    [id] INT NOT NULL IDENTITY(1,1),
    [mail_log_id] INT NOT NULL,
    [evento] VARCHAR(30) NOT NULL,
    [fecha_evento] DATETIME2 NOT NULL,
    [ip] VARCHAR(45),
    [user_agent] VARCHAR(500),
    [payload_raw] NVARCHAR(max),
    [fecha_registro] DATETIME2 NOT NULL CONSTRAINT [DF__mail_log___fecha__22AA2996] DEFAULT sysdatetime(),
    CONSTRAINT [PK__mail_log__3213E83F2A3B9D1C] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_log_destinatario] ON [dbo].[mail_log]([destinatario]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_log_estado] ON [dbo].[mail_log]([estado_actual]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_log_fecha_envio] ON [dbo].[mail_log]([fecha_envio] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_supresion_email] ON [dbo].[mail_supresion]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mail_supresion_activo] ON [dbo].[mail_supresion]([activo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_eventos_evento] ON [dbo].[mail_log_eventos]([evento]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_eventos_mail_log_id] ON [dbo].[mail_log_eventos]([mail_log_id]);

-- AddForeignKey
ALTER TABLE [dbo].[mail_supresion] ADD CONSTRAINT [FK_supresion_mail_log] FOREIGN KEY ([mail_log_id]) REFERENCES [dbo].[mail_log]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mail_log_eventos] ADD CONSTRAINT [FK_eventos_mail_log] FOREIGN KEY ([mail_log_id]) REFERENCES [dbo].[mail_log]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
