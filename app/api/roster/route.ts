import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

export const dynamic='force-dynamic';

const editableFields=new Set([
  'nickname','contractTime','certificateNo','mobile','hourlySalary','bankCard','bankName','notes',
  'regularDate','birthday','age','gender','maritalStatus','ethnicity','contractStart','contractEnd','contractType','contractCompany',
  'socialSecurity','housingFund','officeLocation','workStartDate','education','school','major','householdType','idAddress','residentialAddress',
  'probationFixed','probationPerformance','probationTotal','fixedSalary','performanceOkr','salaryTotal','performanceRatio','departureDate','departureType','departureReason','manualActiveRoster'
]);
const importedBaseFields=new Set(['sourceName','sourceStatus','sourceCenter','sourceDepartment','sourceGroup','sourceTitle','sourceHireDate','organizationOverride','titleOverride']);

function database() {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)throw new Error('ROSTER_DATABASE_UNAVAILABLE');
  return db;
}

async function authorized() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(token&&await verifySessionToken(token));
}

export async function GET() {
  if(!await authorized())return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try {
    const rows=(await database().prepare('SELECT employee_id, profile_json, updated_at FROM employee_roster_profiles').all<{employee_id:string;profile_json:string;updated_at:string}>()).results;
    return NextResponse.json({profiles:Object.fromEntries(rows.map((row)=>{try{return [row.employee_id,{...JSON.parse(row.profile_json),updatedAt:row.updated_at}]}catch{return [row.employee_id,{updatedAt:row.updated_at}]}}))});
  } catch { return NextResponse.json({error:'人员名册扩展信息暂时不可用'},{status:503}); }
}

export async function PATCH(request:Request) {
  if(!await authorized())return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try {
    const input=await request.json() as {employeeId?:string;fields?:Record<string,unknown>};
    if(!input.employeeId||!input.fields||typeof input.fields!=='object')throw new Error('INVALID_ROSTER_UPDATE');
    const fields=Object.fromEntries(Object.entries(input.fields).filter(([key,value])=>editableFields.has(key)&&typeof value==='string').map(([key,value])=>[key,String(value).trim().slice(0,500)]));
    const current=await database().prepare('SELECT profile_json FROM employee_roster_profiles WHERE employee_id = ?').bind(input.employeeId).first<{profile_json:string}>();
    let preserved:Record<string,string>={};try{preserved=current?JSON.parse(current.profile_json):{}}catch{/* Ignore an invalid legacy profile. */}
    const merged={...preserved,...fields};
    const now=new Date().toISOString();
    await database().prepare("INSERT INTO employee_roster_profiles (employee_id, profile_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at").bind(input.employeeId,JSON.stringify(merged),now).run();
    return NextResponse.json({ok:true,profile:{...merged,updatedAt:now}});
  } catch { return NextResponse.json({error:'人员名册保存失败，请稍后重试'},{status:400}); }
}

export async function PUT(request:Request) {
  if(!await authorized())return NextResponse.json({error:'登录已失效，请重新登录'},{status:401});
  try {
    const input=await request.json() as {records?:Array<{employeeId?:string;fields?:Record<string,unknown>}>};
    const records=(input.records??[]).slice(0,500);
    if(!records.length)throw new Error('EMPTY_IMPORT');
    const rows=(await database().prepare('SELECT employee_id, profile_json FROM employee_roster_profiles').all<{employee_id:string;profile_json:string}>()).results;
    const existing=new Map(rows.map((row)=>{try{return[row.employee_id,JSON.parse(row.profile_json) as Record<string,string>]}catch{return[row.employee_id,{}]}}));
    const now=new Date().toISOString();
    const writes=records.flatMap((record)=>{
      if(!record.employeeId||!record.fields)return[];
      const imported=Object.fromEntries(Object.entries(record.fields).filter(([key,value])=>(editableFields.has(key)||importedBaseFields.has(key))&&typeof value==='string').map(([key,value])=>[key,String(value).trim().slice(0,500)]));
      const current=existing.get(record.employeeId)??{};
      const manual=Object.fromEntries(Object.entries(current).filter(([key,value])=>editableFields.has(key)&&String(value??'').trim()));
      const merged={...imported,...manual};
      return [database().prepare("INSERT INTO employee_roster_profiles (employee_id, profile_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at").bind(record.employeeId,JSON.stringify(merged),now)];
    });
    if(!writes.length)throw new Error('INVALID_IMPORT');
    await database().batch(writes);
    return NextResponse.json({ok:true,imported:writes.length,updatedAt:now});
  } catch { return NextResponse.json({error:'Excel 名册导入失败，请检查文件内容'},{status:400}); }
}
