"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Download, FileSpreadsheet, LockKeyhole, MapPin, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Branch = "MANIZALES" | "ARMENIA";
type View = "payroll" | "staff" | "fees" | "supports" | "costs" | "reports" | "settings";
type Category = "LABORAL" | "HONORARIOS" | "APOYO_OTRA_SEDE";
type Profile = { display_name: string; role: "MANAGER_MANIZALES" | "MANAGER_ARMENIA" };
type Worker = { id: string; full_name: string; monthly_salary: number; transport_allowance: number; category: Category; payment_mode: "MENSUAL" | "PROCEDIMIENTO" | "HORA" | "REFERENCIA"; role_title: string | null; notes: string | null };
type PayrollRow = { id: string; name: string; salary: number; transportAllowance: number; days: number; unpaid: number; sick12: number; sick3: number; overtime: number; other: number };

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const asNumber = (value: string) => Math.max(0, Number(value) || 0);
const title: Record<View, string> = { payroll: "Nómina mensual", staff: "Colaboradores", fees: "Honorarios", supports: "Apoyos de otra sede", costs: "Costos del empleador", reports: "Reportes", settings: "Configuración" };

function calculate(row: PayrollRow) {
  const worked = Math.max(0, row.days - row.unpaid - row.sick12 - row.sick3);
  const salaryAndExtras = Math.round(row.salary / 30 * worked + row.overtime * row.salary / 210 * 1.25);
  const sickPay = Math.round((row.sick12 + row.sick3) * Math.max(row.salary / 30 * 2 / 3, 1750905 / 30));
  const transport = row.salary <= 3501810 ? Math.round(row.transportAllowance / 30 * worked) : 0;
  const health = Math.round((salaryAndExtras + sickPay) * .04);
  const pension = Math.round((salaryAndExtras + sickPay) * .04);
  return { salaryAndExtras, sickPay, transport, health, pension, net: salaryAndExtras + sickPay + transport - health - pension - row.other };
}

export default function Home() {
  const [view, setView] = useState<View>("payroll");
  const [branch, setBranch] = useState<Branch>("MANIZALES");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState(""); const [authError, setAuthError] = useState("");
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createBrowserClient(url, key) : null;
  }, []);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSessionEmail(data.session?.user.email ?? null); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSessionEmail(next?.user.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);
  useEffect(() => { if (supabase && sessionEmail) supabase.from("profiles").select("display_name, role").single().then(({ data }) => setProfile(data as Profile | null)); }, [supabase, sessionEmail]);
  const loadWorkers = async () => {
    if (!supabase || !sessionEmail) return;
    const { data, error } = await supabase.from("employees").select("id, full_name, monthly_salary, transport_allowance, category, payment_mode, role_title, notes").eq("branch", branch).eq("active", true).order("full_name");
    if (error) { setMessage("Falta aplicar la actualización de clasificación de personal en la base de datos."); return; }
    const next = (data ?? []).map(item => ({ ...item, monthly_salary: Number(item.monthly_salary), transport_allowance: Number(item.transport_allowance) })) as Worker[];
    setWorkers(next); setRows(next.filter(item => item.category === "LABORAL").map(item => ({ id: item.id, name: item.full_name, salary: item.monthly_salary, transportAllowance: item.transport_allowance, days: 30, unpaid: 0, sick12: 0, sick3: 0, overtime: 0, other: 0 })));
  };
  useEffect(() => { void loadWorkers(); }, [sessionEmail, branch]);

  const signIn = async (event: FormEvent) => { event.preventDefault(); setAuthError(""); if (!supabase) return; const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setAuthError("Correo o contraseña no válidos."); };
  const signOut = async () => { await supabase?.auth.signOut(); setWorkers([]); setRows([]); setProfile(null); };
  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || profile?.role !== "MANAGER_MANIZALES") return;
    setImporting(true); setMessage("");
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data = (name: string) => {
        const sheet = book.Sheets[name];
        return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) : [];
      };
      const numeric = (value: unknown) => Number(String(value).replace(/[^0-9,-]/g, "").replace(",", ".")) || 0;
      const text = (value: unknown) => String(value ?? "").trim();
      const rows: Array<Record<string, unknown>> = [];
      data("NOMINA LABORAL").slice(5).forEach(row => {
        const name = text(row[0]); const salary = numeric(row[1]);
        if (name && salary) rows.push({ branch: "MANIZALES", full_name: name, monthly_salary: salary, transport_allowance: salary <= 3501810 ? 249095 : 0, category: "LABORAL", payment_mode: "MENSUAL", active: true });
      });
      data("HONORARIOS MEDICOS").slice(5).forEach(row => {
        const name = text(row[0]); const label = text(row[1]).toUpperCase(); const rate = numeric(row[2]);
        if (name && rate) rows.push({ branch: "MANIZALES", full_name: name, monthly_salary: rate, transport_allowance: 0, category: "HONORARIOS", payment_mode: label.includes("PROCED") ? "PROCEDIMIENTO" : label.includes("HORA") ? "HORA" : "MENSUAL", role_title: text(row[3]) || null, active: true });
      });
      data("APOYOS OTRA SEDE").slice(5).forEach(row => {
        const name = text(row[0]);
        if (name) rows.push({ branch: "MANIZALES", full_name: name, monthly_salary: numeric(row[1]), transport_allowance: 0, category: "APOYO_OTRA_SEDE", payment_mode: "REFERENCIA", role_title: text(row[2]) || null, notes: text(row[3]) || "Apoyo de otra sede; no genera pago automático", active: true });
      });
      if (!rows.length) throw new Error("No encontré las hojas esperadas ni registros válidos en el archivo.");
      const { error } = await supabase.from("employees").upsert(rows, { onConflict: "branch,full_name" });
      if (error) throw error;
      await loadWorkers();
      setMessage(`Excel importado: ${rows.length} personas clasificadas en Manizales.`);
    } catch (error) { setMessage(error instanceof Error ? `No se pudo importar: ${error.message}` : "No se pudo importar el archivo."); }
    finally { setImporting(false); }
  };
  const updateRow = (id: string, key: keyof PayrollRow, raw: string) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: key === "name" ? raw : asNumber(raw) } : row));
  const labor = rows; const fees = workers.filter(item => item.category === "HONORARIOS"); const supports = workers.filter(item => item.category === "APOYO_OTRA_SEDE");
  const payrollTotal = labor.reduce((sum, row) => sum + calculate(row).net, 0);
  const feeTotal = fees.reduce((sum, item) => sum + item.monthly_salary * (quantities[item.id] ?? (item.payment_mode === "MENSUAL" ? 1 : 0)), 0);
  const employerCost = labor.reduce((sum, row) => { const c = calculate(row); const base = c.salaryAndExtras + c.sickPay; return sum + base + c.transport + base * .12 + base * .00522 + base * .04 + (base + c.transport) * .1766666667 + base * .0416666667; }, 0);
  const permittedBranches: Branch[] = profile?.role === "MANAGER_ARMENIA" ? ["ARMENIA"] : ["MANIZALES", "ARMENIA"];
  const exportWorkbook = async () => {
    const ExcelJS = await import("exceljs"); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Nómina mensual");
    sheet.mergeCells("A1:N1"); sheet.getCell("A1").value = `NÓMINA MENSUAL · NEUMOVIDA · ${branch}`; sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF07498E" } }; sheet.getRow(1).height = 28;
    const logo = new Uint8Array(await (await fetch("/neumovida-logo-report.png")).arrayBuffer()); let raw = ""; logo.forEach(byte => { raw += String.fromCharCode(byte); }); sheet.addImage(workbook.addImage({ base64: `data:image/png;base64,${btoa(raw)}`, extension: "png" }), { tl: { col: 0, row: 1 }, ext: { width: 130, height: 130 } });
    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
    const headers = ["Colaborador", "Salario mensual", "Días", "Permisos", "Incap. 1–2", "Incap. 3+", "H. extra", "Salario y extras", "Pago incapacidad", "Auxilio transporte", "Salud 4%", "Pensión 4%", "Otros descuentos", "Neto a pagar"];
    const header = sheet.addRow(headers); header.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07498E" } }; cell.alignment = { wrapText: true, vertical: "middle" }; });
    labor.forEach(row => { const c = calculate(row); sheet.addRow([row.name,row.salary,row.days,row.unpaid,row.sick12,row.sick3,row.overtime,c.salaryAndExtras,c.sickPay,c.transport,c.health,c.pension,row.other,c.net]); });
    const totalRow = sheet.addRow(["TOTAL NÓMINA", "", "", "", "", "", "", "", "", "", "", "", "", payrollTotal]); totalRow.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3DF" } }; });
    sheet.columns = [{ width: 34 },{ width: 16 },{ width: 8 },{ width: 10 },{ width: 11 },{ width: 11 },{ width: 10 },{ width: 16 },{ width: 16 },{ width: 18 },{ width: 14 },{ width: 14 },{ width: 16 },{ width: 16 }]; for (let i = 2; i <= 14; i += 1) sheet.getColumn(i).numFmt = '[$$-es-CO]#,##0;[Red]-[$$-es-CO]#,##0';
    const addTable = (name: string, headers: string[], values: Array<Array<string | number>>, widths: number[]) => {
      const page = workbook.addWorksheet(name); const heading = page.addRow(headers);
      heading.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07498E" } }; });
      values.forEach(value => page.addRow(value)); page.columns = widths.map(width => ({ width }));
      for (let index = 2; index <= headers.length; index += 1) page.getColumn(index).numFmt = '[$$-es-CO]#,##0;[Red]-[$$-es-CO]#,##0';
    };
    addTable("Honorarios", ["Profesional / proveedor", "Modalidad", "Tarifa", "Cantidad", "Total"], fees.map(item => { const quantity = quantities[item.id] ?? (item.payment_mode === "MENSUAL" ? 1 : 0); return [item.full_name, item.payment_mode, item.monthly_salary, quantity, item.monthly_salary * quantity]; }), [38, 18, 16, 12, 17]);
    addTable("Apoyos otra sede", ["Apoyo", "Rol", "Valor informado", "Observación"], supports.map(item => [item.full_name, item.role_title ?? "Apoyo de otra sede", item.monthly_salary, item.notes ?? ""]), [34, 28, 18, 45]);
    addTable("Costos empleador", ["Colaborador", "Base", "Pensión emp.", "ARL", "Caja", "Provisiones", "Costo aproximado"], labor.map(row => { const calc = calculate(row); const base = calc.salaryAndExtras + calc.sickPay; const provisions = (base + calc.transport) * .1766666667 + base * .0416666667; return [row.name, base, base * .12, base * .00522, base * .04, provisions, base + calc.transport + base * .12 + base * .00522 + base * .04 + provisions]; }), [34, 16, 16, 14, 14, 16, 20]);
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); link.download = `nomina-${branch.toLowerCase()}-2026-10.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  };

  if (!ready) return <main className="login-page"><p>Iniciando Neumovida Nómina…</p></main>;
  if (!sessionEmail) return <main className="login-page"><form className="login-card" onSubmit={signIn}><img className="login-logo" src="/neumovida-logo.png" alt="Neumovida" /><h1>Ingresar</h1><p>Usa el correo y la contraseña asignados por Neumovida.</p><label>Correo electrónico<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <p className="error">{authError}</p>}<button className="primary" type="submit"><LockKeyhole size={17} /> Ingresar</button></form></main>;
  const nav: [View, string][] = [["payroll","Nómina mensual"],["staff","Colaboradores"],["fees","Honorarios"],["supports","Apoyos otra sede"],["costs","Costos del empleador"],["reports","Reportes"],["settings","Configuración"]];
  return <main><aside><div className="brand"><img className="brand-logo" src="/neumovida-logo.png" alt="Neumovida" /></div><nav>{nav.map(([key,label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav><div className="security"><LockKeyhole size={17} /> Acceso por sede y auditoría</div></aside><section className="content"><header><div><p className="eyebrow">CONTROL INTERNO · OCTUBRE 2026</p><h1>{title[view]}</h1><p className="sub">{view === "payroll" ? "Liquida y revisa novedades antes de cerrar el período." : "Información separada por tipo de vínculo y sede."}</p></div><div className="user"><span>GM</span><div><b>{profile?.display_name ?? sessionEmail}</b><small>{profile?.role === "MANAGER_MANIZALES" ? "Acceso Manizales y Armenia" : "Acceso Armenia"}</small></div><button onClick={signOut}>Salir</button></div></header><div className="toolbar"><label><MapPin size={17} /> Sede <select value={branch} onChange={e => setBranch(e.target.value as Branch)}>{permittedBranches.map(item => <option key={item}>{item}</option>)}</select></label><span className="notice">{workers.length ? `${workers.length} personas clasificadas en ${branch}` : "Aún no hay personal cargado en esta sede"}</span>{profile?.role === "MANAGER_MANIZALES" && <><input ref={importInput} className="file-input" type="file" accept=".xlsx,.xls" onChange={importExcel} /><button onClick={() => importInput.current?.click()} disabled={importing}><Upload size={17} /> {importing ? "Importando…" : "Importar Excel"}</button></>}{view === "payroll" && <button onClick={exportWorkbook}><Download size={17} /> Descargar Excel</button>}</div>{message && <p className="status">{message}</p>}
  {view === "payroll" && <><div className="summary"><article><small>Colaboradores</small><b>{labor.length}</b></article><article><small>Neto estimado</small><b>{money.format(payrollTotal)}</b></article><article><small>Estado del período</small><b className="draft">Borrador</b></article><article><small>Revisión requerida</small><b>Contable</b></article></div><PayrollTable rows={labor} total={payrollTotal} onUpdate={updateRow} /></>}
  {view === "staff" && <Directory rows={workers.filter(item => item.category === "LABORAL")} empty="No hay colaboradores laborales registrados." />}
  {view === "fees" && <FeesTable rows={fees} quantities={quantities} total={feeTotal} onQuantity={(id,value) => setQuantities(current => ({ ...current, [id]: asNumber(value) }))} />}
  {view === "supports" && <SupportsTable rows={supports} />}
  {view === "costs" && <CostsTable rows={labor} total={employerCost} />}
  {view === "reports" && <section className="module-panel"><h2>Relación mensual</h2><p>Descarga la nómina laboral de la sede seleccionada en Excel, con logo y valores calculados.</p><button className="primary" onClick={exportWorkbook}><Download size={17} /> Descargar Excel de nómina</button></section>}
  {view === "settings" && <section className="module-panel"><h2>Parámetros de control</h2><div className="settings-grid"><span>Salud trabajador <b>4%</b></span><span>Pensión trabajador <b>4%</b></span><span>Pensión empleador <b>12%</b></span><span>ARL referencial <b>0,522%</b></span><span>Caja compensación <b>4%</b></span><span>Hora extra diurna <b>125%</b></span></div><p>Los parámetros normativos deben ser revisados por el área contable antes de cada período.</p></section>}
  <p className="legal">Herramienta de control interno. Antes del pago, valide retenciones, PILA e incapacidades especiales.</p></section></main>;
}

function PayrollTable({ rows, total, onUpdate }: { rows: PayrollRow[]; total: number; onUpdate: (id: string, key: keyof PayrollRow, value: string) => void }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Liquidación laboral <span>Edite novedades; salud, pensión y neto se calculan automáticamente.</span></div><div className="scroll"><table><thead><tr><th>Colaborador</th><th>Salario</th><th>Días</th><th>Permisos</th><th>Incap. 1–2</th><th>Incap. 3+</th><th>H. extra</th><th>Salario/extras</th><th>Incapacidad</th><th>Transporte</th><th>Salud 4%</th><th>Pensión 4%</th><th>Otros</th><th>Neto</th></tr></thead><tbody>{rows.map(row => { const c = calculate(row); return <tr key={row.id}><td>{row.name}</td><td>{money.format(row.salary)}</td>{(["days","unpaid","sick12","sick3","overtime"] as const).map(key => <td key={key}><input className="quantity-input" type="number" min="0" value={row[key]} onChange={event => onUpdate(row.id,key,event.target.value)} /></td>)}<td className="result">{money.format(c.salaryAndExtras)}</td><td className="result">{money.format(c.sickPay)}</td><td className="result">{money.format(c.transport)}</td><td className="deduction">-{money.format(c.health)}</td><td className="deduction">-{money.format(c.pension)}</td><td><input className="salary-input" type="number" min="0" value={row.other} onChange={event => onUpdate(row.id,"other",event.target.value)} /></td><td className="result">{money.format(c.net)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={13}>TOTAL NÓMINA</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>; }
function Directory({ rows, empty }: { rows: Worker[]; empty: string }) { return <section className="module-panel"><h2>Personal laboral</h2>{rows.length ? <SimpleTable rows={rows} /> : <p>{empty}</p>}</section>; }
function FeesTable({ rows, quantities, total, onQuantity }: { rows: Worker[]; quantities: Record<string,number>; total: number; onQuantity: (id:string,value:string)=>void }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Prestadores por honorarios <span>No se incluyen en descuentos laborales.</span></div><div className="scroll"><table><thead><tr><th>Profesional / proveedor</th><th>Modalidad</th><th>Tarifa</th><th>Cantidad</th><th>Total honorarios</th></tr></thead><tbody>{rows.map(row => { const qty = quantities[row.id] ?? (row.payment_mode === "MENSUAL" ? 1 : 0); return <tr key={row.id}><td>{row.full_name}</td><td>{row.payment_mode}</td><td>{money.format(row.monthly_salary)}</td><td><input className="quantity-input" type="number" min="0" value={qty} onChange={event => onQuantity(row.id,event.target.value)} /></td><td className="result">{money.format(row.monthly_salary * qty)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={4}>TOTAL HONORARIOS</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>; }
function SupportsTable({ rows }: { rows: Worker[] }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Apoyos de otra sede <span>Referencia: no genera pago automático ni aportes en Manizales.</span></div><div className="scroll"><table><thead><tr><th>Apoyo</th><th>Rol</th><th>Valor informado</th><th>Observación</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.full_name}</td><td>{row.role_title ?? "Apoyo de otra sede"}</td><td>{row.monthly_salary ? money.format(row.monthly_salary) : "Por definir"}</td><td>{row.notes}</td></tr>)}</tbody></table></div></div>; }
function CostsTable({ rows, total }: { rows: PayrollRow[]; total: number }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Costo empresa aproximado <span>Solo personal laboral; no incluye prestadores por honorarios.</span></div><div className="scroll"><table><thead><tr><th>Colaborador</th><th>Salario base</th><th>Pensión emp.</th><th>ARL ref.</th><th>Caja</th><th>Provisiones</th><th>Costo aprox.</th></tr></thead><tbody>{rows.map(row => { const c = calculate(row); const base = c.salaryAndExtras + c.sickPay; const provisions = (base+c.transport)*.1766666667 + base*.0416666667; const cost = base+c.transport+base*.12+base*.00522+base*.04+provisions; return <tr key={row.id}><td>{row.name}</td><td>{money.format(base)}</td><td>{money.format(base*.12)}</td><td>{money.format(base*.00522)}</td><td>{money.format(base*.04)}</td><td>{money.format(provisions)}</td><td className="result">{money.format(cost)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={6}>TOTAL COSTO EMPLEADOR</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>; }
function SimpleTable({ rows }: { rows: Worker[] }) { return <div className="scroll"><table><thead><tr><th>Colaborador</th><th>Rol</th><th>Salario base</th><th>Auxilio transporte</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.full_name}</td><td>{row.role_title ?? "—"}</td><td>{money.format(row.monthly_salary)}</td><td>{money.format(row.transport_allowance)}</td></tr>)}</tbody></table></div>; }
