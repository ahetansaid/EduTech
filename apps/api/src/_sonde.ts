import { Session } from "./client-recette";
const t = async (s: Session, m: string, u: string, b?: unknown) => { const d = Date.now(); const r = await (m === "GET" ? s.get(u) : s.post(u, b)); const txt = await r.text(); console.log(r.status, `${Date.now()-d}ms`, m, u, txt.slice(0, 220).replace(/\s+/g," ")); return txt; };
const central = new Session(); await central.connexion("felicite.akakpo");
await t(central, "GET", "/pilotage/synthese");
await t(central, "GET", "/pilotage/carte?couche=maths");
const dep = new Session(); await dep.connexion("bertrand.chabi");
await t(dep, "GET", "/pilotage/territoire");
const dir = new Session(); await dir.connexion("hortense.guera");
const prof = JSON.parse(await t(dir, "GET", "/auth/session")).profil;
const etab = prof.habilitations[0].perimetre.etablissementId;
await t(dir, "GET", `/etablissements/${etab}/tableau`);
await t(dir, "GET", `/etablissements/${etab}/eleves`);
await t(dir, "GET", `/etablissements/${etab}/examens`);
await t(dep, "GET", `/etablissements/${etab}/tableau`); // contrôle : hors rôle → 403
const ins = new Session(); await ins.connexion("nestor.orou");
await t(ins, "GET", `/etablissements/${etab}/tableau`);
await t(ins, "POST", `/etablissements/${etab}/accompagnement`, { apprenantIds: ["APP-000001"], objet: "Test contrôle" }); // lecture seule → 403
