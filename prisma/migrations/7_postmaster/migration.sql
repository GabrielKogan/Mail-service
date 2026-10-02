BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mail_google_conexion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [email] NVARCHAR(320) NOT NULL,
    [refresh_token_enc] NVARCHAR(2000) NOT NULL,
    [scopes] NVARCHAR(500) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [mail_google_conexion_estado_df] DEFAULT 'activa',
    [conectado_en] DATETIME2 NOT NULL CONSTRAINT [mail_google_conexion_conectado_en_df] DEFAULT CURRENT_TIMESTAMP,
    [ultima_sync] DATETIME2,
    [ultimo_error] NVARCHAR(1000),
    [alertado_vencida] DATETIME2,
    CONSTRAINT [mail_google_conexion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[mail_postmaster_diario] (
    [id] INT NOT NULL IDENTITY(1,1),
    [dominio] NVARCHAR(255) NOT NULL,
    [fecha] DATE NOT NULL,
    [spam_rate] FLOAT(53),
    [reputacion_dominio] VARCHAR(20),
    [spf_ok] FLOAT(53),
    [dkim_ok] FLOAT(53),
    [dmarc_ok] FLOAT(53),
    [tls_ok] FLOAT(53),
    [errores_entrega] NVARCHAR(max),
    [raw] NVARCHAR(max) NOT NULL,
    [alertado_en] DATETIME2,
    [alertado_reputacion] DATETIME2,
    [alertado_auth] DATETIME2,
    CONSTRAINT [mail_postmaster_diario_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [UQ_postmaster_dominio_fecha] ON [dbo].[mail_postmaster_diario]([dominio], [fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_postmaster_dominio_fecha] ON [dbo].[mail_postmaster_diario]([dominio], [fecha] DESC);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
