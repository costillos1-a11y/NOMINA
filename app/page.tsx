"use client";

import { Download, FileSpreadsheet, LockKeyhole, MapPin, Plus, Save } from "lucide-react";
import { useMemo, useState } from "react";

type Employee = { id: number; name: string; salary: number; days: number; unpaid: number; sick12: number; sick3: number; overtime: number; other: number };
// Employee data belongs in the protected database, never in the browser bundle.
const seed: Employee[] = [];

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const asNumber = (value: string) => Math.max(0, Number(value) || 0);

function calculate(row: Employee) {
  const worked = Math.max(0, row.days - row.unpaid - row.sick12 - row.sick3);
  const salaryAndExtras = Math.round(row.salary / 30 * worked + row.overtime * row.salary / 210 * 1.25);
  const sickPay = Math.round((row.sick12 + row.sick3) * Math.max(row.salary / 30 * 2 / 3, 1750905 / 30));
  const transport = row.salary <= 3501810 ? Math.round(249095 / 30 * worked) : 0;
  const health = Math.round((salaryAndExtras + sickPay) * .04);
  const pension = Math.round((salaryAndExtras + sickPay) * .04);
  return { salaryAndExtras, sickPay, transport, health, pension, net: salaryAndExtras + sickPay + transport - health - pension - row.other };
}

export default function Home() {
  const [branch, setBranch] = useState<"MANIZALES" | "ARMENIA">("MANIZALES");
  const [rows, setRows] = useState(seed);
  const update = (id: number, key: keyof Employee, raw: string) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: key === "name" ? raw : asNumber(raw) } : row));
  const total = useMemo(() => rows.reduce((sum, row) => sum + calculate(row).net, 0), [rows]);
  const exportCsv = () => {
    const headers = ["Colaborador", "Salario mensual", "Días", "Permisos", "Incapacidad 1-2", "Incapacidad día 3+", "Horas extra", "Otros descuentos", "Neto a pagar"];
    const data = rows.map(r => { const c = calculate(r); return [r.name, r.salary, r.days, r.unpaid, r.sick12, r.sick3, r.overtime, r.other, c.net]; });
    const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); link.download = `nomina-${branch.toLowerCase()}-2026-10.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <main>
    <aside>
      <div className="brand"><span className="mark">N</span><div><strong>Neumovida</strong><small>Centro especializado</small></div></div>
      <nav><a className="active">Nómina mensual</a><a>Colaboradores</a><a>Honorarios</a><a>Costos del empleador</a><a>Reportes</a><a>Configuración</a></nav>
      <div className="security"><LockKeyhole size={17} /> Acceso por sede y auditoría</div>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">CONTROL INTERNO · OCTUBRE 2026</p><h1>Nómina mensual</h1><p className="sub">Registra novedades en una tabla familiar y revisa los cálculos antes de cerrar.</p></div><div className="user"><span>GM</span><div><b>Gerente Manizales</b><small>Acceso global</small></div></div></header>
      <div className="toolbar"><label><MapPin size={17} /> Sede <select value={branch} onChange={e => setBranch(e.target.value as typeof branch)}><option>MANIZALES</option><option>ARMENIA</option></select></label><span className="notice">{branch === "MANIZALES" ? "Datos iniciales importados del archivo compartido" : "Sede nueva: agrega colaboradores para comenzar"}</span><button onClick={exportCsv}><Download size={17} /> Descargar relación</button><button className="primary"><Save size={17} /> Guardar borrador</button></div>
      <div className="summary"><article><small>Colaboradores</small><b>{rows.length}</b></article><article><small>Neto estimado</small><b>{money.format(total)}</b></article><article><small>Estado del período</small><b className="draft">Borrador</b></article><article><small>Revisión requerida</small><b>Contable</b></article></div>
      <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Liquidación laboral <span>Edite las celdas blancas; los valores calculados se actualizan al instante.</span><button className="add"><Plus size={16} /> Colaborador</button></div><div className="scroll"><table><thead><tr><th>Colaborador</th><th>Salario mensual</th><th>Días</th><th>Permisos sin pago</th><th>Incapacidad 1–2</th><th>Incapacidad día 3+</th><th>Horas extra</th><th>Otros descuentos</th><th>Neto a pagar</th></tr></thead><tbody>{rows.map(row => { const c = calculate(row); return <tr key={row.id}><td><input value={row.name} onChange={e => update(row.id, "name", e.target.value)} /></td>{(["salary", "days", "unpaid", "sick12", "sick3", "overtime", "other"] as const).map(key => <td key={key}><input type="number" min="0" value={row[key]} onChange={e => update(row.id, key, e.target.value)} /></td>)}<td className="result">{money.format(c.net)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={8}>TOTAL NÓMINA</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>
      <p className="legal">Este módulo es una herramienta de control interno. Antes del pago, la información debe ser validada por el área contable, especialmente retenciones, PILA e incapacidades particulares.</p>
    </section>
  </main>;
}
