import type { Account } from "@/lib/types";

type Props = {
  name?: string;
  accounts: Account[];
  sector: string;
  classes?: number[];
  value?: string;
  defaultValue?: string;
  required?: boolean;
  id?: string;
  onChange?: (code: string) => void;
  placeholder?: string;
};

/** Liste des comptes : ceux du secteur du site d'abord, puis les comptes communs, puis les autres. */
export default function AccountSelect({
  name, accounts, sector, classes, value, defaultValue, required, id, onChange, placeholder = "— Compte —",
}: Props) {
  const list = classes ? accounts.filter((a) => classes.includes(a.class)) : accounts;
  const sectorAcc = list.filter((a) => a.sectors.includes(sector));
  const common = list.filter((a) => a.sectors.length === 0);
  const others = list.filter((a) => a.sectors.length > 0 && !a.sectors.includes(sector));
  const opt = (a: Account) => <option key={a.code} value={a.code}>{a.code} – {a.label}</option>;
  const controlled = value !== undefined ? { value } : { defaultValue };
  return (
    <select
      id={id}
      name={name}
      required={required}
      {...controlled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      <option value="">{placeholder}</option>
      {sectorAcc.length > 0 && <optgroup label="Comptes du secteur">{sectorAcc.map(opt)}</optgroup>}
      <optgroup label="Comptes communs">{common.map(opt)}</optgroup>
      {others.length > 0 && <optgroup label="Autres secteurs">{others.map(opt)}</optgroup>}
    </select>
  );
}
