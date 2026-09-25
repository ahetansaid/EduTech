import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";

/**
 * Reconstruit les projections de lecture depuis le registre (source de vérité) :
 * - core.scolarites : le dernier événement de placement fixe la classe et le statut de chaque apprenant ;
 * - core.notes      : une ligne par évaluation, la correction la plus récente appliquée.
 * Idempotent : peut être relancé à tout moment (reprise après incident, changement de règle de calcul).
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
try {
  const debut = Date.now();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into core.scolarites (apprenant_id, classe_id, etablissement_id, statut, maj_le)
      select d.apprenant_id,
             case when d.type = 'ABANDON' then null else coalesce(d.donnees->>'classeId', d.donnees->>'versClasseId') end,
             case when d.type = 'ABANDON' then null else c.etablissement_id end,
             case when d.type = 'ABANDON' then 'abandon' else 'scolarise' end,
             now()
      from (
        select distinct on (apprenant_id) apprenant_id, type, donnees
        from ledger.evenements
        where type in ('INSCRIPTION', 'REPRISE', 'TRANSFERT', 'ABANDON') and apprenant_id is not null
        order by apprenant_id, survenu_le desc, enregistre_le desc
      ) d
      left join core.classes c on c.id = coalesce(d.donnees->>'classeId', d.donnees->>'versClasseId')
      on conflict (apprenant_id) do update set classe_id = excluded.classe_id, etablissement_id = excluded.etablissement_id, statut = excluded.statut, maj_le = now()`);

    await tx.execute(sql`
      insert into core.notes (evenement_id, apprenant_id, classe_id, matiere, trimestre, note, note_initiale, corrigee, survenu_le)
      select e.id, e.apprenant_id, e.donnees->>'classeId', e.donnees->>'matiere', (e.donnees->>'trimestre')::int,
             coalesce(c.note, (e.donnees->>'note')::float8), (e.donnees->>'note')::float8, c.note is not null, e.survenu_le
      from ledger.evenements e
      left join (
        select distinct on (donnees->>'evenementCorrigeId') donnees->>'evenementCorrigeId' as eid, (donnees->>'nouvelleNote')::float8 as note
        from ledger.evenements where type = 'CORRECTION_EVALUATION'
        order by donnees->>'evenementCorrigeId', survenu_le desc, enregistre_le desc
      ) c on c.eid = e.id
      where e.type = 'EVALUATION' and e.apprenant_id is not null
      on conflict (evenement_id) do update set note = excluded.note, corrigee = excluded.corrigee`);
  });
  const [r] = (await db.execute(sql`
    select (select count(*)::int from core.scolarites) n, (select count(*)::int from core.scolarites where statut = 'scolarise') scolarises,
           (select count(*)::int from core.notes) notes, (select count(*)::int from core.notes where corrigee) corrigees`)) as unknown as { n: number; scolarises: number; notes: number; corrigees: number }[];
  console.log(`Projections reconstruites en ${Date.now() - debut} ms : ${r?.n} apprenants (${r?.scolarises} scolarisés), ${r?.notes} notes (${r?.corrigees} corrigées).`);
} finally {
  await client.end();
}
