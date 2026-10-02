ALTER TABLE "core"."comptes" ADD COLUMN "demonstration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Les 13 comptes de test créés par « npm run comptes » (identifiants fixes) : comptes de démonstration.
UPDATE "core"."comptes" SET "demonstration" = true WHERE "identifiant" IN ('aicha.zannou','chantal.dossou','idrissou.sanni','hortense.guera','nestor.orou','bertrand.chabi','felicite.akakpo','landry.kouton','laure.zannou','prosper.ahouandjinou','sena.hounkpatin','etudiant.ifri','admin.beile');
