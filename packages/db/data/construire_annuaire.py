"""Construit packages/db/data/referentiel-etablissements.csv : l'annuaire réel, prêt à charger.

Règles : aucune valeur inventée. Les points OpenStreetMap sans nom sont écartés (inutiles dans un
annuaire) ; un type inconnu reste « à préciser » ; une ligne officielle sans coordonnées n'a pas de
position ; une université présente à la fois dans les listes officielles et dans OSM garde sa ligne
officielle (l'OSM est écarté quand son nom recouvre un nom ou un sigle officiel de la même commune).
"""
import csv, io, json, os, re, unicodedata, hashlib

# Sources consolidées dans data/sources/ (listes officielles des ministères ; OpenStreetMap © contributeurs,
# licence ODbL). Relancer :  python packages/db/data/construire_annuaire.py
ICI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(ICI, "sources")
SORTIE = os.path.join(ICI, "referentiel-etablissements.csv")

def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

communes = json.load(io.open(os.path.join(D, "communes.json"), encoding="utf-8"))
PAR_NOM = {norm(c["nom"]): c["id"] for c in communes}
ALIAS = {"seme kpodji": "seme-podji", "seme podji": "seme-podji", "so ava": "so-ava", "dassa": "dassa-zoume"}

def commune_id(texte):
    """« Cotonou (Akpakpa) | Abomey-Calavi » → cotonou ; autres sites renvoyés pour la remarque."""
    if not texte: return None, []
    sites = [s.strip() for s in texte.split("|") if s.strip()]
    ids = []
    for s in sites:
        base = norm(re.sub(r"\(.*?\)", "", s))
        cid = PAR_NOM.get(base) or ALIAS.get(base)
        if not cid:
            cid = next((v for k, v in PAR_NOM.items() if k and (base.startswith(k + " ") or base == k)), None)
        if cid: ids.append(cid)
    return (ids[0] if ids else None), sites[1:]

# Types : code stable, libellé lisible, niveaux couverts.
TYPES_OSM = {
    "ecole_maternelle": ("ecole_maternelle", "École maternelle", ["maternelle"]),
    "isced_0": ("ecole_maternelle", "École maternelle", ["maternelle"]),
    "ecole_primaire": ("ecole_primaire", "École primaire", ["primaire"]),
    "isced_1": ("ecole_primaire", "École primaire", ["primaire"]),
    "complexe_scolaire": ("complexe_scolaire", "Complexe scolaire", ["maternelle", "primaire"]),
    "ceg": ("college", "Collège d'enseignement général (CEG)", ["secondaire"]),
    "college": ("college", "Collège", ["secondaire"]),
    "lycee": ("lycee_general", "Lycée", ["secondaire"]),
    "lycee_technique": ("lycee_technique", "Lycée technique", ["technique"]),
    "centre_formation": ("centre_formation_professionnelle", "Centre de formation professionnelle", ["technique"]),
    "universite": ("universite", "Université", ["superieur"]),
    "enseignement_superieur": ("ecole_superieure", "Établissement d'enseignement supérieur", ["superieur"]),
    "enseignement_superieur_ou_formation": ("superieur_ou_formation", "Enseignement supérieur ou formation", ["superieur", "technique"]),
    "indetermine": ("a_preciser", "Établissement scolaire (type à préciser)", []),
}
def type_officiel(ordre, categorie):
    c = norm(categorie)
    if ordre == "superieur":
        if "universite" in c: return ("universite", "Université", ["superieur"])
        if "prive d enseignement superieur" in c or "epes" in c: return ("epes", "Établissement privé d'enseignement supérieur", ["superieur"])
        if "doctorale" in c: return ("ecole_doctorale", "École doctorale", ["superieur"])
        if "normale superieure" in c: return ("ecole_normale_superieure", "École normale supérieure", ["superieur"])
        if "faculte" in c: return ("faculte", "Faculté", ["superieur"])
        if "institut" in c: return ("institut", "Institut", ["superieur"])
        if "site" in c: return ("site_universitaire", "Site universitaire", ["superieur"])
        if "chaire" in c: return ("chaire", "Chaire", ["superieur"])
        if "nationale" in c: return ("ecole_nationale", "École nationale", ["superieur"])
        if "centre" in c: return ("centre_universitaire", "Centre universitaire", ["superieur"])
        return ("ecole_superieure", "École supérieure", ["superieur"])
    if "agricole" in c: return ("lycee_technique_agricole", "Lycée technique agricole", ["technique"])
    if "lycee technique" in c: return ("lycee_technique", "Lycée technique et professionnel", ["technique"])
    if "normale d instituteurs" in c: return ("ecole_normale_instituteurs", "École normale d'instituteurs", ["technique"])
    if "normale superieure" in c: return ("ecole_normale_superieure", "École normale supérieure", ["superieur"])
    if "medico" in c: return ("ecole_formation_professionnelle", "École de formation professionnelle", ["technique"])
    if "centre de formation" in c: return ("centre_formation_professionnelle", "Centre de formation professionnelle", ["technique"])
    if "enseignement superieur" in c: return ("institut", "Institut d'enseignement supérieur professionnel", ["superieur", "technique"])
    return ("institut_formation", "Institut de formation", ["technique"])

STATUTS = {"public", "prive", "confessionnel", "communautaire"}
lignes = list(csv.DictReader(io.open(os.path.join(D, "REFERENTIEL_BENIN.csv"), encoding="utf-8-sig"), delimiter=";"))
sortie, officiels = [], []
for x in lignes:
    osm = x["preuve"].startswith("carto")
    if osm and (not x["nom"] or x["nom"] == "(sans nom)"): continue
    if osm:
        t = TYPES_OSM.get(x["categorie"], TYPES_OSM["indetermine"])
        cid, autres = commune_id(x["commune"])
        osm_id = x["source"].rstrip("/").split("openstreetmap.org/")[-1].replace("/", "-")
        ident = f"REF-OSM-{osm_id}"
        preuve = "cartographie_collaborative"
        sigle, rattachement = "", x["rattachement"] if x["rattachement"] else ""
        lat, lng = x["latitude"], x["longitude"]
    else:
        t = type_officiel(x["ordre"], x["categorie"])
        cid, autres = commune_id(x["commune"])
        ident = "REF-" + hashlib.sha1(f"{x['nom']}|{x['sigle']}|{x['rattachement']}".encode()).hexdigest()[:12].upper()
        preuve = "officielle" if x["preuve"] == "officielle" else "recoupee"
        sigle, rattachement = x["sigle"], x["rattachement"]
        lat = lng = ""
    statut = x["statut"] if x["statut"] in STATUTS else "non_indique"
    remarque = x["remarque"]
    if osm:
        # La remarque OSM est la règle de classement interne : on la dit en clair, sans jargon.
        remarque = ("Type à préciser : aucun indice fiable dans OpenStreetMap." if t[0] == "a_preciser"
                    else "Type déduit du nom de l'établissement." if remarque.startswith("nom")
                    else "Type déduit des attributs OpenStreetMap.")
    if autres: remarque = (f"Autres sites : {', '.join(autres)}. " + remarque).strip()
    ligne = {
        "id": ident, "nom": x["nom"].strip(), "sigle": sigle, "type": t[0], "type_libelle": t[1], "niveaux": "|".join(t[2]),
        "statut": statut, "commune_id": cid or "", "rattachement": rattachement, "latitude": lat, "longitude": lng,
        "source": x["source"], "preuve": preuve, "remarque": remarque[:600],
    }
    (sortie if osm else officiels).append(ligne)

# Dédoublonnage : un point OSM dont le nom recouvre un nom ou un sigle officiel de la même commune est écarté.
cles_off = {}
for o in officiels:
    for n in filter(None, [norm(o["nom"]), norm(o["sigle"])]):
        cles_off.setdefault(o["commune_id"], set()).add(n)
def doublon(l):
    n = norm(l["nom"])
    return any(k and (k == n or (len(k) >= 4 and (f" {k} " in f" {n} "))) for k in cles_off.get(l["commune_id"], set()) if l["type"] in ("universite", "ecole_superieure", "superieur_ou_formation", "lycee_technique", "centre_formation_professionnelle"))
# Nettoyage OSM : noms génériques sans nom propre, objets qui ne sont pas des établissements.
SIGLES_SEULS = {"ceg", "epp", "ep", "em", "emp", "ecole", "ecole primaire", "ecole maternelle", "lycee", "college", "school", "complexe scolaire", "cs", "ceg 1", "ceg 2", "ceg 3", "epp a", "epp b"}
NON_ETAB = re.compile(r"^(amphi|amphitheatre|batiment|bloc|salle|hall|bibliotheque|cantine|terrain|stade|foyer|bureau|administration|startup|incubateur)\b|startup|valley|incubat")
def utile(l):
    n = norm(l["nom"])
    return len(n) >= 4 and n not in SIGLES_SEULS and not NON_ETAB.search(n)
# Noms officiels, toutes communes : un point OSM qui reprend exactement un nom officiel est un doublon.
noms_officiels = {norm(o["nom"]) for o in officiels} | {norm(o["sigle"]) for o in officiels if len(o["sigle"] or "") >= 4}
def cle_proche(l):
    # Même nom normalisé (sans les mots « ecole », « primaire », « publique »…) à ~300 m près : un seul point.
    n = re.sub(r"\b(ecole|epp|ep|primaire|publique|public|prive|privee|de|du|la|le|les)\b", " ", norm(l["nom"]))
    n = re.sub(r"\s+", " ", n).strip()
    try: return (n, round(float(l["latitude"]) / 0.003), round(float(l["longitude"]) / 0.003))
    except ValueError: return (n, l["commune_id"], None)
vus, osm_gardes = set(), []
for l in sortie:
    if not utile(l) or doublon(l) or norm(l["nom"]) in noms_officiels: continue
    k = cle_proche(l)
    if k in vus: continue
    vus.add(k); osm_gardes.append(l)
ids = set()
final = []
for l in officiels + osm_gardes:
    if l["id"] in ids: continue
    ids.add(l["id"]); final.append(l)

os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
with io.open(SORTIE, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(final[0].keys()), delimiter=";")
    w.writeheader(); w.writerows(final)
import collections
print("officiels", len(officiels), "· OSM nommés", len(sortie), "· doublons OSM écartés", len(sortie) - len(osm_gardes), "· total", len(final))
print("sans commune", sum(1 for l in final if not l["commune_id"]), "· avec position", sum(1 for l in final if l["latitude"]))
print(collections.Counter(l["type_libelle"] for l in final).most_common(30))
