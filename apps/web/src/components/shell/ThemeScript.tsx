/**
 * Applique le thème avant le premier rendu (pas de flash). Script statique, sans donnée utilisateur,
 * autorisé par le nonce CSP de la requête.
 * Préférence : "auto" (défaut de l'espace : sombre pour le cockpit et la console territoriale), "light", "dark".
 */
const SCRIPT = "(function(){try{var p=localStorage.getItem('beile-theme')||'auto';var l=location.pathname;var s=['/cockpit','/territoire','/ask','/simulation'].some(function(x){return l.indexOf(x)===0});var d=p==='dark'||(p==='auto'&&s);document.documentElement.classList.toggle('dark',d);}catch(e){}})();";

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
