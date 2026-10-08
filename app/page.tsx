"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Download, FileSpreadsheet, LockKeyhole, MapPin, Plus, Save, Upload, UserMinus } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Branch = "MANIZALES" | "ARMENIA";
type View = "payroll" | "staff" | "fees" | "supports" | "costs" | "reports" | "settings";
type Category = "LABORAL" | "HONORARIOS" | "APOYO_OTRA_SEDE";
type Profile = { display_name: string; role: "MANAGER_MANIZALES" | "MANAGER_ARMENIA" };
type Worker = { id: string; full_name: string; document_number: string | null; monthly_salary: number; transport_allowance: number; category: Category; payment_mode: "MENSUAL" | "PROCEDIMIENTO" | "HORA" | "REFERENCIA"; role_title: string | null; notes: string | null; start_date: string | null };
type PayrollRow = { id: string; name: string; documentNumber: string | null; salary: number; transportAllowance: number; startDate: string | null; days: number; unpaid: number; sick12: number; sick3: number; additional: number; overtime: number; holiday: number; otherIncome: number; other: number; note: string };
type WorkerDraft = { id?: string; full_name: string; document_number: string; role_title: string; monthly_salary: string; category: Category; payment_mode: "MENSUAL" | "PROCEDIMIENTO" | "HORA" | "REFERENCIA"; notes: string; start_date: string };

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const asNumber = (value: string) => Math.max(0, Number(value) || 0);
const title: Record<View, string> = { payroll: "Nómina mensual", staff: "Colaboradores", fees: "Honorarios", supports: "Apoyos de otra sede", costs: "Costos del empleador", reports: "Reportes", settings: "Configuración" };

function calculate(row: PayrollRow) {
  const worked = Math.max(0, row.days - row.unpaid - row.sick12 - row.sick3);
  const basePay = Math.round(row.salary / 30 * worked);
  // La operación conserva el criterio histórico de la plantilla de Neumovida: 168 horas/mes.
  const hourlyRate = row.salary / 168;
  const additionalPay = Math.round(row.additional * hourlyRate);
  const overtimePay = Math.round(row.overtime * hourlyRate * 1.25);
  const holidayPay = Math.round(row.holiday * hourlyRate * 2);
  const salaryAndExtras = basePay + additionalPay + overtimePay + holidayPay + row.otherIncome;
  const sickPay = Math.round((row.sick12 + row.sick3) * Math.max(row.salary / 30 * 2 / 3, 1750905 / 30));
  const transport = row.salary <= 3501810 ? Math.round(row.transportAllowance / 30 * worked) : 0;
  const health = Math.round((salaryAndExtras + sickPay) * .04);
  const pension = Math.round((salaryAndExtras + sickPay) * .04);
  return { basePay, hourlyRate, additionalPay, overtimePay, holidayPay, salaryAndExtras, sickPay, transport, health, pension, net: salaryAndExtras + sickPay + transport - health - pension - row.other };
}
function benefits(row: PayrollRow, period: string) {
  const [year, month] = period.split("-").map(Number); const start = row.startDate ? new Date(`${row.startDate}T12:00:00`) : new Date(year, 0, 1);
  const base = row.salary + (row.salary <= 3501810 ? row.transportAllowance : 0);
  const rangeDays = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - Math.max(from.getTime(), start.getTime())) / 86400000) + 1);
  if (month === 6 || month === 12) { const from = new Date(year, month === 6 ? 0 : 6, 1); const to = new Date(year, month, 0); const days = rangeDays(from, to); return { label: "Prima de servicios", days, amount: Math.round(base * days / 360) }; }
  if (month === 1) { const from = new Date(year - 1, 0, 1); const to = new Date(year - 1, 11, 31); const days = rangeDays(from, to); const severance = Math.round(base * days / 360); return { label: "Cesantías e intereses", days, amount: severance + Math.round(severance * .12 * days / 360) }; }
  return null;
}

export default function Home() {
  const [view, setView] = useState<View>("payroll");
  const [branch, setBranch] = useState<Branch>("MANIZALES");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [feeDetails, setFeeDetails] = useState<Record<string, { quantity: number; withholding: number; ica: number; other: number }>>({});
  const [period, setPeriod] = useState("2026-10");
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [newWorker, setNewWorker] = useState<WorkerDraft>({ full_name: "", document_number: "", role_title: "", monthly_salary: "", category: "LABORAL", payment_mode: "MENSUAL", notes: "", start_date: "" });
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState(""); const [authError, setAuthError] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [importing, setImporting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createBrowserClient(url, key) : null;
  }, []);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSessionEmail(data.session?.user.email ?? null); setUserId(data.session?.user.id ?? null); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSessionEmail(next?.user.email ?? null); setUserId(next?.user.id ?? null); });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);
  useEffect(() => { if (supabase && sessionEmail) supabase.from("profiles").select("display_name, role").single().then(({ data }) => setProfile(data as Profile | null)); }, [supabase, sessionEmail]);
  const loadWorkers = async () => {
    if (!supabase || !sessionEmail) return;
    const { data, error } = await supabase.from("employees").select("id, full_name, document_number, monthly_salary, transport_allowance, category, payment_mode, role_title, notes, start_date").eq("branch", branch).eq("active", true).order("full_name");
    if (error) { setMessage("Falta aplicar la actualización de clasificación de personal en la base de datos."); return; }
    const next = (data ?? []).map(item => ({ ...item, monthly_salary: Number(item.monthly_salary), transport_allowance: Number(item.transport_allowance) })) as Worker[];
    const { data: currentPeriod } = await supabase.from("payroll_periods").select("id").eq("branch", branch).eq("period", `${period}-01`).maybeSingle();
    setPeriodId(currentPeriod?.id ?? null);
    const { data: entries } = currentPeriod ? await supabase.from("payroll_entries").select("employee_id,days_in_period,unpaid_leave_days,sick_days_1_2,sick_days_3_plus,additional_hours,daytime_overtime_hours,sunday_holiday_hours,other_income,other_deductions,notes").eq("period_id", currentPeriod.id) : { data: [] };
    const { data: honorariumEntries } = currentPeriod ? await supabase.from("honorarium_entries").select("employee_id,quantity,withholding_rate,ica_rate,other_withholdings").eq("period_id", currentPeriod.id) : { data: [] };
    const byWorker = new Map((entries ?? []).map(entry => [entry.employee_id, entry]));
    const detailMap = Object.fromEntries((honorariumEntries ?? []).map(item => [item.employee_id, { quantity: Number(item.quantity), withholding: Number(item.withholding_rate), ica: Number(item.ica_rate), other: Number(item.other_withholdings) }]));
    setFeeDetails(detailMap); setWorkers(next); setRows(next.filter(item => item.category === "LABORAL").map(item => { const entry = byWorker.get(item.id); return { id: item.id, name: item.full_name, documentNumber: item.document_number, salary: item.monthly_salary, transportAllowance: item.transport_allowance, startDate: item.start_date, days: Number(entry?.days_in_period ?? 30), unpaid: Number(entry?.unpaid_leave_days ?? 0), sick12: Number(entry?.sick_days_1_2 ?? 0), sick3: Number(entry?.sick_days_3_plus ?? 0), additional: Number(entry?.additional_hours ?? 0), overtime: Number(entry?.daytime_overtime_hours ?? 0), holiday: Number(entry?.sunday_holiday_hours ?? 0), otherIncome: Number(entry?.other_income ?? 0), other: Number(entry?.other_deductions ?? 0), note: entry?.notes ?? "" }; }));
  };
  useEffect(() => { void loadWorkers(); }, [sessionEmail, branch, period]);

  const signIn = async (event: FormEvent) => { event.preventDefault(); setAuthError(""); if (!supabase) return; const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setAuthError("Correo o contraseña no válidos."); };
  const signOut = async () => { await supabase?.auth.signOut(); setWorkers([]); setRows([]); setProfile(null); setUserId(null); };
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
      // Flexible import for a simple Excel with columns such as Colaborador, Vinculación and Salario.
      if (!rows.length) Object.entries(book.Sheets).forEach(([sheetName, sheet]) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        const normalized = (value: unknown) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const headerRow = grid.findIndex(row => row.some(cell => ["colaborador", "nombre", "prestador", "profesional"].some(word => normalized(cell).includes(word))));
        if (headerRow < 0) return;
        const headers = grid[headerRow].map(normalized);
        const nameIndex = headers.findIndex(cell => ["colaborador", "nombre", "prestador", "profesional"].some(word => cell.includes(word)));
        const relationIndex = headers.findIndex(cell => cell.includes("vincul") || cell.includes("tipo") || cell.includes("categoria"));
        const salaryIndex = headers.findIndex(cell => cell.includes("salario") || cell.includes("valor") || cell.includes("tarifa") || cell.includes("pago"));
        grid.slice(headerRow + 1).forEach(line => {
          const name = text(line[nameIndex]); const relation = normalized(relationIndex >= 0 ? line[relationIndex] : sheetName); const salary = numeric(line[salaryIndex]);
          if (!name || normalized(name).includes("total") || (!salary && !relation.includes("confirm"))) return;
          const category: Category = relation.includes("nomina") || relation.includes("laboral") ? "LABORAL" : relation.includes("servic") || relation.includes("honorar") || relation.includes("medic") ? "HONORARIOS" : "APOYO_OTRA_SEDE";
          const role = category === "HONORARIOS" && /dr\.?|medic|neumo/i.test(name) ? "Prestador médico" : null;
          rows.push({ branch: "MANIZALES", full_name: name, monthly_salary: salary, transport_allowance: category === "LABORAL" && salary <= 3501810 ? 249095 : 0, category, payment_mode: category === "APOYO_OTRA_SEDE" ? "REFERENCIA" : "MENSUAL", role_title: role, notes: category === "APOYO_OTRA_SEDE" ? "Valor o vínculo por confirmar; no genera pago automático" : null, active: true });
        });
      });
      // Last-resort import: accepts files whose headers were altered, moved or omitted.
      if (!rows.length) Object.entries(book.Sheets).forEach(([sheetName, sheet]) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        const normalized = (value: unknown) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        grid.forEach(line => {
          const cells = line.map(text); const name = cells.find(cell => /[a-záéíóúñ]/i.test(cell) && !/(colaborador|nombre|vincul|salario|valor|total)/i.test(cell)) ?? "";
          const relation = cells.map(normalized).find(cell => cell.includes("nomina") || cell.includes("laboral") || cell.includes("servic") || cell.includes("honorar") || cell.includes("confirm")) ?? normalized(sheetName);
          const salary = cells.map(numeric).find(value => value >= 10000) ?? 0;
          if (!name || !salary) return;
          const category: Category = relation.includes("nomina") || relation.includes("laboral") ? "LABORAL" : relation.includes("servic") || relation.includes("honorar") ? "HONORARIOS" : "APOYO_OTRA_SEDE";
          rows.push({ branch: "MANIZALES", full_name: name, monthly_salary: salary, transport_allowance: category === "LABORAL" && salary <= 3501810 ? 249095 : 0, category, payment_mode: category === "APOYO_OTRA_SEDE" ? "REFERENCIA" : "MENSUAL", role_title: category === "HONORARIOS" ? "Prestador" : null, notes: category === "APOYO_OTRA_SEDE" ? "Valor o vínculo por confirmar; no genera pago automático" : null, active: true });
        });
      });
      if (!rows.length) throw new Error("No encontré las hojas esperadas ni registros válidos en el archivo.");
      const uniqueRows = Array.from(new Map(rows.map(row => [`${row.branch}-${row.full_name}`, row])).values());
      const { error } = await supabase.from("employees").upsert(uniqueRows, { onConflict: "branch,full_name" });
      if (error) throw error;
      await loadWorkers();
      setMessage(`Excel importado: ${uniqueRows.length} personas clasificadas en Manizales.`);
    } catch (error) { setMessage(error instanceof Error ? `No se pudo importar: ${error.message}` : "No se pudo importar el archivo."); }
    finally { setImporting(false); }
  };
  const updateRow = (id: string, key: keyof PayrollRow, raw: string) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: key === "name" || key === "note" ? raw : asNumber(raw) } : row));
  const addCollaborator = () => { setNewWorker({ full_name: "", document_number: "", role_title: "", monthly_salary: "", category: "LABORAL", payment_mode: "MENSUAL", notes: "", start_date: "" }); setShowWorkerForm(true); };
  const editWorker = (worker: Worker) => { setNewWorker({ id: worker.id, full_name: worker.full_name, document_number: worker.document_number ?? "", role_title: worker.role_title ?? "", monthly_salary: String(worker.monthly_salary), category: worker.category, payment_mode: worker.payment_mode, notes: worker.notes ?? "", start_date: worker.start_date ?? "" }); setShowWorkerForm(true); };
  const saveNewWorker = async (event: FormEvent) => {
    event.preventDefault(); const name = newWorker.full_name.trim(); const salary = asNumber(newWorker.monthly_salary);
    if (!name || !salary) { setMessage("Indica nombre y valor mensual válidos."); return; }
    if (!supabase) return;
    const record = { branch, full_name: name, document_number: newWorker.document_number.trim() || null, monthly_salary: salary, transport_allowance: newWorker.category === "LABORAL" && salary <= 3501810 ? 249095 : 0, category: newWorker.category, payment_mode: newWorker.category === "APOYO_OTRA_SEDE" ? "REFERENCIA" : newWorker.payment_mode, role_title: newWorker.role_title.trim() || null, notes: newWorker.notes.trim() || null, start_date: newWorker.start_date || null, active: true };
    const { error } = newWorker.id ? await supabase.from("employees").update(record).eq("id", newWorker.id) : await supabase.from("employees").upsert(record, { onConflict: "branch,full_name" });
    if (!error) setShowWorkerForm(false); setMessage(error ? "No fue posible agregar el registro." : "Registro agregado para las próximas nóminas."); await loadWorkers();
  };
  const removeCollaborator = async (worker: Worker) => {
    const reason = window.prompt(`Motivo del retiro de ${worker.full_name}:`)?.trim(); if (!reason || !supabase) return;
    const { error } = await supabase.from("employees").update({ active: false, inactive_reason: reason, inactive_at: new Date().toISOString() }).eq("id", worker.id);
    setMessage(error ? "No fue posible registrar el retiro." : "Retiro registrado. El historial de nómina se conserva."); await loadWorkers();
  };
  const savePeriod = async () => {
    if (!supabase || !userId) return; setSaving(true); setMessage("");
    let id = periodId;
    if (!id) { const { data, error } = await supabase.from("payroll_periods").upsert({ branch, period: `${period}-01`, created_by: userId }, { onConflict: "branch,period" }).select("id").single(); if (error) { setSaving(false); setMessage("No fue posible crear el período. Revisa la actualización de base de datos."); return; } id = data.id; setPeriodId(id); }
    const { error } = await supabase.from("payroll_entries").upsert(rows.map(row => ({ period_id: id, employee_id: row.id, days_in_period: row.days, unpaid_leave_days: row.unpaid, sick_days_1_2: row.sick12, sick_days_3_plus: row.sick3, additional_hours: row.additional, daytime_overtime_hours: row.overtime, sunday_holiday_hours: row.holiday, other_income: row.otherIncome, other_deductions: row.other, notes: row.note })), { onConflict: "period_id,employee_id" });
    if (!error) await supabase.from("honorarium_entries").upsert(fees.map(row => { const detail = feeDetails[row.id] ?? { quantity: row.payment_mode === "MENSUAL" ? 1 : 0, withholding: 0, ica: 0, other: 0 }; return { period_id: id, employee_id: row.id, quantity: detail.quantity, withholding_rate: detail.withholding, ica_rate: detail.ica, other_withholdings: detail.other }; }), { onConflict: "period_id,employee_id" });
    setSaving(false); setMessage(error ? "No se pudieron guardar las novedades." : `Novedades y notas guardadas para ${period}.`);
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !sessionEmail) return;
    if (newPassword.length < 8) { setMessage("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (newPassword !== confirmPassword) { setMessage("La confirmación de la nueva contraseña no coincide."); return; }
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: sessionEmail, password: currentPassword });
    if (verifyError) { setMessage("La contraseña actual no es correcta."); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setMessage("No fue posible actualizar la contraseña."); return; }
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Contraseña actualizada correctamente.");
  };
  const exampleMarker = "REGISTRO_DE_EJEMPLO_ARMENIA";
  const createArmeniaExample = async () => {
    if (!supabase) return; setDemoLoading(true); setMessage("");
    const examplePeople = [
      { full_name: "EJEMPLO · Laura Gómez", role_title: "Auxiliar administrativa (ejemplo)", monthly_salary: 1900000, transport_allowance: 249095, category: "LABORAL", payment_mode: "MENSUAL", start_date: "2026-01-15" },
      { full_name: "EJEMPLO · Carlos Díaz", role_title: "Coordinador de sede (ejemplo)", monthly_salary: 3200000, transport_allowance: 249095, category: "LABORAL", payment_mode: "MENSUAL", start_date: "2025-08-01" },
      { full_name: "EJEMPLO · Dra. Ana Torres", role_title: "Médica especialista (ejemplo)", monthly_salary: 300000, transport_allowance: 0, category: "HONORARIOS", payment_mode: "PROCEDIMIENTO", start_date: null },
      { full_name: "EJEMPLO · Dr. Felipe Ríos", role_title: "Médico por horas (ejemplo)", monthly_salary: 180000, transport_allowance: 0, category: "HONORARIOS", payment_mode: "HORA", start_date: null },
    ];
    const { error } = await supabase.from("employees").upsert(examplePeople.map(person => ({ ...person, branch: "ARMENIA", notes: exampleMarker, active: true })), { onConflict: "branch,full_name" });
    setDemoLoading(false); setMessage(error ? "No fue posible crear la nómina de ejemplo." : "Nómina de ejemplo Armenia creada: 2 colaboradores y 2 médicos ficticios."); await loadWorkers();
  };
  const removeArmeniaExample = async () => {
    if (!supabase || !window.confirm("¿Eliminar los cuatro registros ficticios de Armenia?")) return;
    setDemoLoading(true); const { error } = await supabase.from("employees").delete().eq("branch", "ARMENIA").eq("notes", exampleMarker);
    setDemoLoading(false); setMessage(error ? "No se pudo eliminar el ejemplo. Si ya guardaste un período con estos registros, retíralos desde Colaboradores." : "Nómina de ejemplo eliminada."); await loadWorkers();
  };
  const labor = rows; const fees = workers.filter(item => item.category === "HONORARIOS"); const supports = workers.filter(item => item.category === "APOYO_OTRA_SEDE");
  const payrollTotal = labor.reduce((sum, row) => sum + calculate(row).net, 0);
  const feeTotal = fees.reduce((sum, item) => { const detail = feeDetails[item.id] ?? { quantity: quantities[item.id] ?? (item.payment_mode === "MENSUAL" ? 1 : 0), withholding: 0, ica: 0, other: 0 }; const gross = item.monthly_salary * detail.quantity; return sum + gross - gross * detail.withholding / 100 - gross * detail.ica / 1000 - detail.other; }, 0);
  const employerCost = labor.reduce((sum, row) => { const c = calculate(row); const base = c.salaryAndExtras + c.sickPay; return sum + base + c.transport + base * .12 + base * .00522 + base * .04 + (base + c.transport) * .1766666667 + base * .0416666667; }, 0);
  const permittedBranches: Branch[] = profile?.role === "MANAGER_ARMENIA" ? ["ARMENIA"] : ["MANIZALES", "ARMENIA"];
  const exportWorkbook = async () => {
    const ExcelJS = await import("exceljs"); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Nómina mensual");
    sheet.mergeCells("A1:N1"); sheet.getCell("A1").value = `NÓMINA MENSUAL · NEUMOVIDA · ${branch} · ${period}`; sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF07498E" } }; sheet.getRow(1).height = 28;
    const logo = new Uint8Array(await (await fetch("/neumovida-logo-report.png")).arrayBuffer()); let raw = ""; logo.forEach(byte => { raw += String.fromCharCode(byte); }); sheet.addImage(workbook.addImage({ base64: `data:image/png;base64,${btoa(raw)}`, extension: "png" }), { tl: { col: 0, row: 1 }, ext: { width: 130, height: 130 } });
    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
    const headers = ["Colaborador", "Salario mensual", "Días", "Permisos", "Incap. 1–2", "Incap. 3+", "H. adicionales", "H. extra diurna", "H. dominical/festiva", "Otros ingresos", "Total devengado", "Pago incapacidad", "Auxilio transporte", "Salud 4%", "Pensión 4%", "Otros descuentos", "Neto a pagar", "Notas"];
    const header = sheet.addRow(headers); header.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07498E" } }; cell.alignment = { wrapText: true, vertical: "middle" }; });
    labor.forEach(row => { const c = calculate(row); sheet.addRow([row.name,row.salary,row.days,row.unpaid,row.sick12,row.sick3,row.additional,row.overtime,row.holiday,row.otherIncome,c.salaryAndExtras,c.sickPay,c.transport,c.health,c.pension,row.other,c.net,row.note]); });
    const totalRow = sheet.addRow(["TOTAL NÓMINA", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", payrollTotal, ""]); totalRow.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3DF" } }; });
    sheet.columns = [{ width: 34 },{ width: 16 },{ width: 8 },{ width: 10 },{ width: 11 },{ width: 11 },{ width: 13 },{ width: 14 },{ width: 17 },{ width: 16 },{ width: 18 },{ width: 16 },{ width: 18 },{ width: 14 },{ width: 14 },{ width: 16 },{ width: 16 },{ width: 42 }]; for (let i = 2; i <= 17; i += 1) sheet.getColumn(i).numFmt = '[$$-es-CO]#,##0;[Red]-[$$-es-CO]#,##0';
    const addTable = (name: string, headers: string[], values: Array<Array<string | number>>, widths: number[]) => {
      const page = workbook.addWorksheet(name); const heading = page.addRow(headers);
      heading.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07498E" } }; });
      values.forEach(value => page.addRow(value)); page.columns = widths.map(width => ({ width }));
      for (let index = 2; index <= headers.length; index += 1) page.getColumn(index).numFmt = '[$$-es-CO]#,##0;[Red]-[$$-es-CO]#,##0';
    };
    addTable("Honorarios", ["Profesional / proveedor", "Modalidad", "Tarifa", "Cantidad", "Bruto", "Rete fuente", "Rete ICA", "Otros", "Neto a pagar"], fees.map(item => { const detail = feeDetails[item.id] ?? { quantity: quantities[item.id] ?? (item.payment_mode === "MENSUAL" ? 1 : 0), withholding: 0, ica: 0, other: 0 }; const gross = item.monthly_salary * detail.quantity; const withholding = gross * detail.withholding / 100; const ica = gross * detail.ica / 1000; return [item.full_name, item.payment_mode, item.monthly_salary, detail.quantity, gross, withholding, ica, detail.other, gross - withholding - ica - detail.other]; }), [38, 18, 16, 12, 17, 16, 14, 14, 18]);
    addTable("Apoyos otra sede", ["Apoyo", "Rol", "Valor informado", "Observación"], supports.map(item => [item.full_name, item.role_title ?? "Apoyo de otra sede", item.monthly_salary, item.notes ?? ""]), [34, 28, 18, 45]);
    addTable("Costos empleador", ["Colaborador", "Base", "Pensión emp.", "ARL", "Caja", "Provisiones", "Costo aproximado"], labor.map(row => { const calc = calculate(row); const base = calc.salaryAndExtras + calc.sickPay; const provisions = (base + calc.transport) * .1766666667 + base * .0416666667; return [row.name, base, base * .12, base * .00522, base * .04, provisions, base + calc.transport + base * .12 + base * .00522 + base * .04 + provisions]; }), [34, 16, 16, 14, 14, 16, 20]);
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); link.download = `nomina-${branch.toLowerCase()}-${period}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  };

  if (!ready) return <main className="login-page"><p>Iniciando Neumovida Nómina…</p></main>;
  if (!sessionEmail) return <main className="login-page"><form className="login-card" onSubmit={signIn}><img className="login-logo" src="/neumovida-logo.png" alt="Neumovida" /><h1>Ingresar</h1><p>Usa el correo y la contraseña asignados por Neumovida.</p><label>Correo electrónico<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <p className="error">{authError}</p>}<button className="primary" type="submit"><LockKeyhole size={17} /> Ingresar</button></form></main>;
  const nav: [View, string][] = [["payroll","Nómina mensual"],["staff","Colaboradores"],["fees","Honorarios"],["supports","Apoyos otra sede"],["costs","Costos del empleador"],["reports","Reportes"],["settings","Configuración"]];
  return <main><aside><div className="brand"><img className="brand-logo" src="/neumovida-logo.png" alt="Neumovida" /></div><nav>{nav.map(([key,label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav><div className="security"><LockKeyhole size={17} /> Acceso por sede y auditoría</div></aside><section className="content"><header><div><p className="eyebrow">CONTROL INTERNO · {period}</p><h1>{title[view]}</h1><p className="sub">{view === "payroll" ? "Liquida y revisa novedades antes de cerrar el período." : "Información separada por tipo de vínculo y sede."}</p></div><div className="user"><span>GM</span><div><b>{profile?.display_name ?? sessionEmail}</b><small>{profile?.role === "MANAGER_MANIZALES" ? "Acceso Manizales y Armenia" : "Acceso Armenia"}</small></div><button onClick={signOut}>Salir</button></div></header><div className="toolbar"><label><MapPin size={17} /> Sede <select value={branch} onChange={e => setBranch(e.target.value as Branch)}>{permittedBranches.map(item => <option key={item}>{item}</option>)}</select></label><label>Período <input className="period-input" type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label><span className="notice">{workers.length ? `${workers.length} personas clasificadas en ${branch}` : "Aún no hay personal cargado en esta sede"}</span>{branch === "ARMENIA" && <><button onClick={createArmeniaExample} disabled={demoLoading}>Cargar ejemplo Armenia</button><button className="danger" onClick={removeArmeniaExample} disabled={demoLoading}>Borrar ejemplo</button></>}{profile?.role === "MANAGER_MANIZALES" && <><input ref={importInput} className="file-input" type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} /><button onClick={() => importInput.current?.click()} disabled={importing}><Upload size={17} /> {importing ? "Importando…" : "Importar Excel"}</button></>}{view === "payroll" && <><button onClick={exportWorkbook}><Download size={17} /> Descargar Excel</button><button className="primary" onClick={savePeriod} disabled={saving}><Save size={17} /> {saving ? "Guardando…" : "Guardar período"}</button></>}</div>{message && <p className="status">{message}</p>}
  {view === "payroll" && <><div className="summary"><article><small>Colaboradores</small><b>{labor.length}</b></article><article><small>Neto estimado</small><b>{money.format(payrollTotal)}</b></article><article><small>Estado del período</small><b className="draft">Borrador</b></article><article><small>Revisión requerida</small><b>Contable</b></article></div><PayrollTable rows={labor} total={payrollTotal} onUpdate={updateRow} onAdd={addCollaborator} />{[1,6,12].includes(Number(period.slice(5))) && <BenefitsPanel rows={labor} period={period} />}</>}
  {view === "staff" && <Directory rows={workers} empty="No hay personas registradas en esta sede." onAdd={addCollaborator} onEdit={editWorker} onRemove={removeCollaborator} />}
  {view === "fees" && <FeesTable rows={fees} details={feeDetails} total={feeTotal} onChange={(id, key, value) => setFeeDetails(current => ({ ...current, [id]: { ...(current[id] ?? { quantity: fees.find(item => item.id === id)?.payment_mode === "MENSUAL" ? 1 : 0, withholding: 0, ica: 0, other: 0 }), [key]: asNumber(value) } }))} />}
  {view === "supports" && <SupportsTable rows={supports} />}
  {view === "costs" && <CostsTable rows={labor} total={employerCost} />}
  {view === "reports" && <section className="module-panel"><h2>Relación mensual</h2><p>Descarga la nómina laboral de la sede seleccionada en Excel, con logo y valores calculados.</p><button className="primary" onClick={exportWorkbook}><Download size={17} /> Descargar Excel de nómina</button></section>}
  {view === "settings" && <section className="module-panel"><h2>Parámetros de control</h2><div className="settings-grid"><span>Divisor mensual de horas <b>168</b></span><span>Salud trabajador <b>4%</b></span><span>Pensión trabajador <b>4%</b></span><span>Pensión empleador <b>12%</b></span><span>ARL referencial <b>0,522%</b></span><span>Caja compensación <b>4%</b></span><span>Hora extra diurna <b>125%</b></span></div><p>Se conserva el criterio de la plantilla histórica para las horas: salario ÷ 168. Los parámetros deben ser validados por contabilidad antes de cada período.</p><form className="password-form" onSubmit={changePassword}><h2>Seguridad de mi cuenta</h2><p>Cambia solo la contraseña de la cuenta con la que iniciaste sesión.</p><label>Contraseña actual<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></label><label>Nueva contraseña<input type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></label><label>Confirmar nueva contraseña<input type="password" minLength={8} value={confirmPassword} onChange={e => setNewPassword(e.target.value)} required /></label><button className="primary" type="submit"><Save size={16} /> Cambiar contraseña</button></form></section>}
  {showWorkerForm && <WorkerForm draft={newWorker} onChange={setNewWorker} onCancel={() => setShowWorkerForm(false)} onSubmit={saveNewWorker} />}
  <p className="legal">Herramienta de control interno. Antes del pago, valide retenciones, PILA e incapacidades especiales.</p></section></main>;
}

function PayrollTable({ rows, total, onUpdate, onAdd }: { rows: PayrollRow[]; total: number; onUpdate: (id: string, key: keyof PayrollRow, value: string) => void; onAdd: () => void }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Liquidación laboral <span>Valores completos y novedades por colaborador.</span><button className="add" onClick={onAdd}><Plus size={15} /> Colaborador</button></div><div className="payroll-cards">{rows.map(row => { const c = calculate(row); const earned = c.salaryAndExtras + c.sickPay + c.transport; const discounts = c.health + c.pension + row.other; return <article className="payroll-card" key={row.id}><div className="person"><b>{row.name}</b><span>Documento: {row.documentNumber ? `CC ${row.documentNumber}` : "sin registrar"}</span><span>Salario {money.format(row.salary)}</span></div><div className="novelties">{([['days','Días'],['unpaid','Permisos'],['sick12','Incap. 1–2'],['sick3','Incap. 3+'],['additional','H. adicional'],['overtime','H. extra'],['holiday','H. domin./fest.'],['otherIncome','Otros ingresos'],['other','Otros desc.']] as const).map(([key,label]) => <label key={key}>{label}<input type="number" min="0" value={row[key]} onChange={event => onUpdate(row.id,key,event.target.value)} /></label>)}</div><div className="amounts"><div className="income-summary"><span>Base <b>{money.format(c.basePay)}</b></span><span>+ Transporte <b>{money.format(c.transport)}</b></span><span>+ H. adicionales <b>{money.format(c.additionalPay)}</b></span><span>+ H. extra <b>{money.format(c.overtimePay)}</b></span><span>+ H. dominical/fest. <b>{money.format(c.holidayPay)}</b></span><span>+ Incapacidades/otros <b>{money.format(c.sickPay + row.otherIncome)}</b></span><strong>Total devengado <b>{money.format(earned)}</b></strong></div><div className="discount-summary"><span>Salud 4% <b>-{money.format(c.health)}</b></span><span>Pensión 4% <b>-{money.format(c.pension)}</b></span><span>Otros <b>-{money.format(row.other)}</b></span><strong>Total descuentos <b>-{money.format(discounts)}</b></strong></div><div className="net-summary"><span>Neto a pagar</span><b>{money.format(c.net)}</b><small>Total devengado − descuentos</small></div></div><label className="card-note">Nota del período<input value={row.note} placeholder="Ej.: incapacidad soportada, ajuste autorizado…" onChange={event => onUpdate(row.id,"note",event.target.value)} /></label></article>; })}</div><div className="payroll-total"><b>TOTAL NÓMINA</b><b>{money.format(total)}</b></div></div>; }
function BenefitsPanel({ rows, period }: { rows: PayrollRow[]; period: string }) { const items = rows.map(row => ({ name: row.name, ...benefits(row, period) })).filter((item): item is { name: string; label: string; days: number; amount: number } => Boolean(item.label)); const total = items.reduce((sum, item) => sum + item.amount, 0); return <section className="benefits-panel"><h2>{items[0]?.label ?? "Prestaciones"}</h2><p>Estimación según fecha de ingreso. Debe validarse con contabilidad antes de pagar.</p>{items.map(item => <div key={item.name}><span>{item.name} · {item.days} días causados</span><b>{money.format(item.amount)}</b></div>)}<div className="benefits-total"><b>Total estimado</b><b>{money.format(total)}</b></div></section>; }
function Directory({ rows, empty, onAdd, onEdit, onRemove }: { rows: Worker[]; empty: string; onAdd: () => void; onEdit: (worker: Worker) => void; onRemove: (worker: Worker) => void }) { return <section className="module-panel"><div className="module-heading"><div><h2>Personal registrado</h2><p>Agrega personas con su cargo y vínculo, o retíralas conservando el motivo.</p></div><button className="primary" onClick={onAdd}><Plus size={17} /> Agregar persona</button></div>{rows.length ? <div className="directory-cards">{rows.map(row => <article className="directory-card" key={row.id}><div><b>{row.full_name}</b><span>{row.role_title ?? "Sin cargo registrado"}</span></div><span>{row.category === "LABORAL" ? "Nómina" : row.category === "HONORARIOS" ? "Prestación de servicios" : "Apoyo otra sede"}</span><span>{money.format(row.monthly_salary)}</span><span>Ingreso: {row.start_date || "Sin registrar"}</span><div><button onClick={() => onEdit(row)}>Editar</button><button className="danger" onClick={() => onRemove(row)}><UserMinus size={15} /> Retirar</button></div></article>)}</div> : <p>{empty}</p>}</section>; }
function WorkerForm({ draft, onChange, onCancel, onSubmit }: { draft: WorkerDraft; onChange: (draft: WorkerDraft) => void; onCancel: () => void; onSubmit: (event: FormEvent) => void }) { const update = <K extends keyof WorkerDraft>(key: K, value: WorkerDraft[K]) => onChange({ ...draft, [key]: value }); return <div className="modal-backdrop"><form className="worker-form" onSubmit={onSubmit}><h2>{draft.id ? "Editar persona" : "Agregar persona"}</h2><p>Define el cargo, el vínculo y la fecha de ingreso para liquidar correctamente.</p><label>Nombre completo<input required value={draft.full_name} onChange={e => update("full_name", e.target.value)} /></label><label>Identificación<input inputMode="numeric" value={draft.document_number} onChange={e => update("document_number", e.target.value)} /></label><label>Cargo<input required value={draft.role_title} placeholder="Ej.: Auxiliar administrativa" onChange={e => update("role_title", e.target.value)} /></label><label>Tipo de vínculo<select value={draft.category} onChange={e => { const category = e.target.value as Category; update("category", category); update("payment_mode", category === "APOYO_OTRA_SEDE" ? "REFERENCIA" : "MENSUAL"); }}><option value="LABORAL">Nómina</option><option value="HONORARIOS">Prestación de servicios / honorarios</option><option value="APOYO_OTRA_SEDE">Apoyo de otra sede</option></select></label>{draft.category === "HONORARIOS" && <label>Forma de pago<select value={draft.payment_mode} onChange={e => update("payment_mode", e.target.value as WorkerDraft["payment_mode"])}><option value="MENSUAL">Mensual</option><option value="PROCEDIMIENTO">Por procedimiento</option><option value="HORA">Por hora</option></select></label>}<label>Fecha de ingreso<input type="date" value={draft.start_date} onChange={e => update("start_date", e.target.value)} /></label><label>{draft.category === "LABORAL" ? "Salario mensual" : "Valor / tarifa"}<input required inputMode="numeric" value={draft.monthly_salary} onChange={e => update("monthly_salary", e.target.value)} /></label><label>Observación (opcional)<input value={draft.notes} onChange={e => update("notes", e.target.value)} /></label><div className="form-actions"><button type="button" onClick={onCancel}>Cancelar</button><button className="primary" type="submit"><Save size={16} /> Guardar persona</button></div></form></div>; }
function FeesTable({ rows, details, total, onChange }: { rows: Worker[]; details: Record<string,{quantity:number;withholding:number;ica:number;other:number}>; total: number; onChange: (id:string,key:"quantity"|"withholding"|"ica"|"other",value:string)=>void }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Prestadores por honorarios <span>Registra cantidad y retenciones para calcular el neto a pagar.</span></div><div className="scroll"><table className="fees-table"><thead><tr><th>Profesional / proveedor</th><th>Modalidad</th><th>Tarifa</th><th>Cantidad</th><th>Bruto</th><th>Rete fuente %</th><th>ICA x 1.000</th><th>Otros</th><th>Neto a pagar</th></tr></thead><tbody>{rows.map(row => { const detail = details[row.id] ?? { quantity: row.payment_mode === "MENSUAL" ? 1 : 0, withholding: 0, ica: 0, other: 0 }; const gross = row.monthly_salary * detail.quantity; const withholding = gross * detail.withholding / 100; const ica = gross * detail.ica / 1000; const net = gross - withholding - ica - detail.other; return <tr key={row.id}><td>{row.full_name}</td><td>{row.payment_mode}</td><td>{money.format(row.monthly_salary)}</td><td><input className="quantity-input" type="number" min="0" value={detail.quantity} onChange={event => onChange(row.id,"quantity",event.target.value)} /></td><td className="result">{money.format(gross)}</td><td><input className="quantity-input" type="number" min="0" value={detail.withholding} onChange={event => onChange(row.id,"withholding",event.target.value)} /></td><td><input className="quantity-input" type="number" min="0" value={detail.ica} onChange={event => onChange(row.id,"ica",event.target.value)} /></td><td><input className="salary-input" type="number" min="0" value={detail.other} onChange={event => onChange(row.id,"other",event.target.value)} /></td><td className="result">{money.format(net)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={8}>TOTAL NETO HONORARIOS</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>; }
function SupportsTable({ rows }: { rows: Worker[] }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Apoyos de otra sede <span>Referencia: no genera pago automático ni aportes en Manizales.</span></div><div className="scroll"><table><thead><tr><th>Apoyo</th><th>Rol</th><th>Valor informado</th><th>Observación</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.full_name}</td><td>{row.role_title ?? "Apoyo de otra sede"}</td><td>{row.monthly_salary ? money.format(row.monthly_salary) : "Por definir"}</td><td>{row.notes}</td></tr>)}</tbody></table></div></div>; }
function CostsTable({ rows, total }: { rows: PayrollRow[]; total: number }) { return <div className="sheet"><div className="sheet-title"><FileSpreadsheet size={19} /> Costo empresa aproximado <span>Solo personal laboral; no incluye prestadores por honorarios.</span></div><div className="scroll"><table><thead><tr><th>Colaborador</th><th>Salario base</th><th>Pensión emp.</th><th>ARL ref.</th><th>Caja</th><th>Provisiones</th><th>Costo aprox.</th></tr></thead><tbody>{rows.map(row => { const c = calculate(row); const base = c.salaryAndExtras + c.sickPay; const provisions = (base+c.transport)*.1766666667 + base*.0416666667; const cost = base+c.transport+base*.12+base*.00522+base*.04+provisions; return <tr key={row.id}><td>{row.name}</td><td>{money.format(base)}</td><td>{money.format(base*.12)}</td><td>{money.format(base*.00522)}</td><td>{money.format(base*.04)}</td><td>{money.format(provisions)}</td><td className="result">{money.format(cost)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={6}>TOTAL COSTO EMPLEADOR</td><td>{money.format(total)}</td></tr></tfoot></table></div></div>; }
function SimpleTable({ rows }: { rows: Worker[] }) { return <div className="scroll"><table><thead><tr><th>Colaborador</th><th>Rol</th><th>Salario base</th><th>Auxilio transporte</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.full_name}</td><td>{row.role_title ?? "—"}</td><td>{money.format(row.monthly_salary)}</td><td>{money.format(row.transport_allowance)}</td></tr>)}</tbody></table></div>; }
