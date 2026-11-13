/** Affiche les messages ?ok= / ?err= transmis après une action serveur. */
export default function Flash({ ok, err }: { ok?: string | string[]; err?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(err) ? err[0] : err;
  return (
    <>
      {o && <div className="alert ok" role="status">{o}</div>}
      {e && <div className="alert err" role="alert">{e}</div>}
    </>
  );
}
