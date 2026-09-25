BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mail_supresion_historial] (
    [id] INT NOT NULL IDENTITY(1,1),
    [supresion_id] INT NOT NULL,
    [accion] VARCHAR(20) NOT NULL,
    [motivo] VARCHAR(20) NOT NULL,
    [origen_accion] VARCHAR(20) NOT NULL,
    [responsable] NVARCHAR(120),
    [nota] NVARCHAR(1000),
    [ses_resultado] VARCHAR(30),
    [fecha] DATETIME2 NOT NULL CONSTRAINT [mail_supresion_historial_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [mail_supresion_historial_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_historial_supresion] ON [dbo].[mail_supresion_historial]([supresion_id], [fecha] DESC);

-- AddForeignKey
ALTER TABLE [dbo].[mail_supresion_historial] ADD CONSTRAINT [FK_historial_supresion] FOREIGN KEY ([supresion_id]) REFERENCES [dbo].[mail_supresion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
