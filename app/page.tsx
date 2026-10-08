"use client";

import { Download, FileSpreadsheet, LockKeyhole, MapPin, Plus, Save } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = { id: string; name: string; salary: number; days: number; unpaid: number; sick12: number; sick3: number; overtime: number; other: number };
type Profile = { display_name: string; role: "MANAGER_MANIZALES" | "MANAGER_ARMENIA" };
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
  const [view, setView] = useState<"payroll" | "staff" | "fees" | "costs" | "reports" | "settings">("payroll");
  const [rows, setRows] = useState(seed);
  const [ready, setReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createBrowserClient(url, key) : null;
  }, []);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSessionEmail(data.session?.user.email ?? null); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSessionEmail(next?.user.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !sessionEmail) { setProfile(null); return; }
    supabase.from("profiles").select("display_name, role").single().then(({ data }) => setProfile(data as Profile | null));
  }, [supabase, sessionEmail]);

  useEffect(() => {
    if (!supabase || !sessionEmail) return;
    supabase.from("employees").select("id, full_name, monthly_salary").eq("branch", branch).eq("active", true).order("full_name")
      .then(({ data }) => setRows((data ?? []).map(employee => ({ id: employee.id, name: employee.full_name, salary: Number(employee.monthly_salary), days: 30, unpaid: 0, sick12: 0, sick3: 0, overtime: 0, other: 0 }))));
  }, [supabase, sessionEmail, branch]);

  const update = (id: string, key: keyof Employee, raw: string) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: key === "name" ? raw : asNumber(raw) } : row));
  const addEmployee = () => setRows(current => [...current, { id: crypto.randomUUID(), name: "", salary: 0, days: 30, unpaid: 0, sick12: 0, sick3: 0, overtime: 0, other: 0 }]);
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setAuthError("");
    if (!supabase) { setAuthError("Falta la configuración segura de Supabase."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("Correo o contraseña no válidos.");
  };
  const signOut = async () => { await supabase?.auth.signOut(); setProfile(null); setRows([]); };
  const saveEmployees = async () => {
    if (!supabase) return;
    const valid = rows.filter(row => row.name.trim() && row.salary > 0);
    if (!valid.length) { setMessage("Agrega al menos un colaborador con salario."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.from("employees").upsert(valid.map(row => ({ branch, full_name: row.name.trim(), monthly_salary: row.salary, active: true })), { onConflict: "branch,full_name" });
    setSaving(false); setMessage(error ? "No fue posible guardar. Revisa tus permisos." : "Colaboradores guardados de forma segura.");
  };
  const total = useMemo(() => rows.reduce((sum, row) => sum + calculate(row).net, 0), [rows]);
  const exportWorkbook = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Neumovida";
    const sheet = workbook.addWorksheet("Nómina mensual", { views: [{ state: "frozen", ySplit: 7 }] });
    sheet.mergeCells("A1:N1"); sheet.getCell("A1").value = `NÓMINA MENSUAL · NEUMOVIDA · ${branch}`;
    sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF07498E" } };
    sheet.getCell("A1").alignment = { vertical: "middle" };
    sheet.getRow(1).height = 28;
    const logoResponse = await fetch("/neumovida-logo-report.png");
    const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
    let logoBase64 = ""; logoBytes.forEach(byte => { logoBase64 += String.fromCharCode(byte); });
    const logoId = workbook.addImage({ base64: `data:image/png;base64,${btoa(logoBase64)}`, extension: "png" });
    sheet.addImage(logoId, { tl: { col: 0, row: 1 }, ext: { width: 145, height: 145 } });
    sheet.mergeCells("C3:N3"); sheet.getCell("C3").value = "Relación de colaboradores y liquidación de control interno";
    sheet.getCell("C3").font = { italic: true, color: { argb: "FF68798E" } };
    const headers = ["Colaborador", "Salario mensual", "Días", "Permisos", "Incap. 1–2", "Incap. 3+", "H. extra", "Salario y extras", "Pago incapacidad", "Auxilio transporte", "Salud 4%", "Pensión 4%", "Otros descuentos", "Neto a pagar"];
    const header = sheet.addRow([]); header.values = headers; header.height = 28;
    header.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07498E" } }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
    rows.forEach(row => { const c = calculate(row); sheet.addRow([row.name, row.salary, row.days, row.unpaid, row.sick12, row.sick3, row.overtime, c.salaryAndExtras, c.sickPay, c.transport, c.health, c.pension, row.other, c.net]); });
    const totalRow = sheet.addRow(["TOTAL NÓMINA", "", "", "", "", "", "", "", "", "", "", "", "", total]);
    totalRow.eachCell(cell => { cell.font = { bold: true, color: { argb: "FF405F13" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3DF" } }; });
    sheet.columns = [ { width: 34 }, { width: 16 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 } ];
    sheet.getColumn(1).alignment = { vertical: "middle" };
    for (let column = 2; column <= 14; column += 1) { sheet.getColumn(column).numFmt = '[$$-es-CO]#,##0;[Red]-[$$-es-CO]#,##0'; }
    for (let rowNumber = 8; rowNumber <= sheet.rowCount; rowNumber += 1) { sheet.getRow(rowNumber).height = 21; }
    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); link.download = `nomina-${branch.toLowerCase()}-2026-10.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  };
  if (!ready) return <main className="login-page"><p>Iniciando Neumovida Nómina…</p></main>;
  if (!sessionEmail) return <main className="login-page"><form className="login-card" onSubmit={signIn}><div className="brand"><span className="mark">N</span><div><strong>Neumovida</strong><small>Nómina segura</small></div></div><h1>Ingresar</h1><p>Usa el correo y la contraseña asignados por Neumovida.</p><label>Correo electrónico<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <p className="error">{authError}</p>}<button className="primary" type="submit"><LockKeyhole size={17} /> Ingresar</button></form></main>;
  const permittedBranches = profile?.role === "MANAGER_ARMENIA" ? ["ARMENIA"] : ["MANIZALES", "ARMENIA"];
  const viewTitle = { payroll: "Nómina mensual", staff: "Colaboradores", fees: "Honorarios y apoyos", costs: "Costos del empleador", reports: "Reportes", settings: "Configuración" }[view];
  return <main>
    <aside>
      <div className="brand"><img className="brand-logo" src="/neumovida-logo.png" alt="Neumovida Centro Especializado en Enfermedades Respiratorias" /></div>
      <nav>{([['payroll','Nómina mensual'],['staff','Colaboradores'],['fees','Honorarios y apoyos'],['costs','Costos del empleador'],['reports','Reportes'],['settings','Configuración']] as const).map(([key,label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
      <div className="security"><LockKeyhole size={17} /> Acceso por sede y auditoría</div>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">CONTROL INTERNO · OCTUBRE 2026</p><h1>{viewTitle}</h1><p className="sub">Registra novedades, consulta costos y prepara los reportes mensuales desde un solo lugar.</p></div><div className="user"><span>GM</span><div><b>{profile?.display_name ?? sessionEmail}</b><small>{profile?.role === "MANAGER_MANIZALES" ? "Acceso Manizales y Armenia" : "Acceso Armenia"}</small></div><button onClick={signOut}>Salir</button></div></header>
      {view === "payroll" ? <><div className="toolbar"><label><MapPin size={17} /> Sede <select value={branch} onChange={e => setBranch(e.target.value as typeof branch)}>{permittedBranches.map(item => <option key={item}>{item}</option>)}</select></label><span className="notice">{rows.length ? "Datos cargados de la sede seleccionada" : "Aún no hay colaboradores cargados en esta sede"}</span><button onClick={exportWorkbook}><Download size={17} /> Descargar Excel</button><button className="primary" onClick={saveEmployees} disabled={saving}><Save size={17} /> {saving ? "Guardando…" : "Guardar colaboradores"}</button></div>
      <div className="summary"><article><small>Colaboradores</small><b>{rows.length}</b></article><article><small>Neto estimado</small><b>{money.format(total)}</b></article><article><small>Estado del período</small><b className="draft">Borrador</b></article><article><small>Revisión requerida</small><b>Contable</b></article></div>
      <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Liquidación laboral <span>Edite las celdas blancas; salud, pensión y neto se calculan automáticamente.</span><button className="add" onClick={addEmployee}><Plus size={16} /> Colaborador</button></div><div className="scroll"><table><thead><tr><th>Colaborador</th><th>Salario mensual</th><th title="Días del período">Días</th><th title="Permisos sin pago">Permisos</th><th title="Incapacidad días 1 y 2">Incap. 1–2</th><th title="Incapacidad desde el día 3">Incap. 3+</th><th title="Horas extra diurnas">H. extra</th><th>Salario y extras</th><th>Pago incapacidad</th><th>Auxilio transporte</th><th>Salud 4%</th><th>Pensión 4%</th><th>Otros descuentos</th><th>Neto a pagar</th></tr></thead><tbody>{rows.map(row => { const c = calculate(row); return <tr key={row.id}><td><input value={row.name} onChange={e => update(row.id, "name", e.target.value)} /></td>{(["salary", "days", "unpaid", "sick12", "sick3", "overtime"] as const).map(key => <td key={key}><input className={key === "salary" ? "salary-input" : "quantity-input"} type="number" min="0" value={row[key]} onChange={e => update(row.id, key, e.target.value)} /></td>)}<td className="result">{money.format(c.salaryAndExtras)}</td><td className="result">{money.format(c.sickPay)}</td><td className="result">{money.format(c.transport)}</td><td className="deduction">-{money.format(c.health)}</td><td className="deduction">-{money.format(c.pension)}</td><td><input className="salary-input" type="number" min="0" value={row.other} onChange={e => update(row.id, "other", e.target.value)} /></td><td className="result">{money.format(c.net)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={13}>TOTAL NÓMINA</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>
      {message && <p className="status">{message}</p>}
      <p className="legal">Este módulo es una herramienta de control interno. Antes del pago, la información debe ser validada por el área contable, especialmente retenciones, PILA e incapacidades particulares.</p></> : <section className="module-panel"><p className="eyebrow">MÓDULO EN PREPARACIÓN</p><h2>{viewTitle}</h2><p>{view === "staff" ? "Administra la información contractual y salarial de cada colaborador por sede." : view === "fees" ? "Gestiona médicos, prestadores por honorarios y apoyos de otra sede sin mezclarlos con la nómina laboral." : view === "costs" ? "Consulta aportes, provisiones y costo empresarial separado de los honorarios." : view === "reports" ? "Genera la relación mensual y los archivos de control por sede." : "Configura parámetros de liquidación, sedes y reglas de acceso."}</p>{view === "staff" && <button className="primary" onClick={() => { setView("payroll"); addEmployee(); }}><Plus size={17} /> Agregar colaborador</button>}{view === "reports" && <button className="primary" onClick={exportWorkbook}><Download size={17} /> Descargar Excel</button>}</section>}
    </section>
  </main>;
}
