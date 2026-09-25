import type { MetadataRoute } from "next";

/** Plateforme de données éducatives : aucune indexation par les moteurs de recherche. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
